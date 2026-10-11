// The Stats tab: how many measures were introduced in a period, by whom, and how
// far those same measures have got. Everything is counted in the browser from
// the search indexes, one per Congress, so any run of Congresses can be combined.

import { loadCongressLine, loadSearchOf, type CongressEntry } from "../data/load";
import { ordinal, type SearchIndex, type World } from "../data/types";
import { add, el, niceDate, put } from "./dom";
import type { BoardSpec, Whiteboard } from "./whiteboard";

const PERIODS: [string, string, number][] = [
  ["day", "The latest day", 1],
  ["week", "The last 7 days", 7],
  ["month", "The last 30 days", 30],
  ["year", "The last 12 months", 365],
  ["all", "This whole Congress", 0],
];
const KINDS: [string, string][] = [
  ["law", "Bills and joint resolutions"],
  ["res", "Simple and concurrent resolutions"],
  ["all", "Everything"],
];
const CAN_BECOME_LAW = new Set(["hr", "s", "hjres", "sjres"]);
const PARTIES: [string, string][] = [
  ["R", "Republicans"],
  ["D", "Democrats"],
  ["I", "Independents"],
];

/** The words and choices of a world whose items are not bills: executive orders, say. */
export interface StatsWords {
  /** The label over the two period pickers: "Presidents". */
  periods: string;
  periodLabel(entry: CongressEntry): string;
  /** "executive orders" and "signed", as in "289 executive orders signed". */
  noun: string;
  verb: string;
  whole: string;
  /** How to say which periods are counted: "under Barack Obama", "from Obama to Trump". */
  where(first: CongressEntry, last: CongressEntry): string;
  /** The one thing that can happen to an item here, counted where bills count becoming law. */
  reached: string;
  outcomeTitle: string;
  outcomeNote: string;
  byPeriod: string;
  byParty: string;
  most: string;
  areas: string;
  footnote: string;
}

interface Row {
  congress: number;
  introduced: string;
  house: boolean;
  law: boolean;
  party: string;
  stage: number;
  /** The sponsor's member id, or "" when it is not known. */
  sponsor: string;
  name: string;
  area: string;
}

interface Tally {
  introduced: number;
  reported: number;
  voted: number;
  passed: number;
  both: number;
  law: number;
}

const emptyTally = (): Tally => ({ introduced: 0, reported: 0, voted: 0, passed: 0, both: 0, law: 0 });

function count(tally: Tally, stage: number) {
  tally.introduced++;
  if (stage >= 1) tally.reported++;
  if (stage >= 2) tally.voted++;
  if (stage >= 3) tally.passed++;
  if (stage >= 4) tally.both++;
  if (stage >= 5) tally.law++;
}

function percent(part: number, whole: number): string {
  if (!whole) return "–";
  const value = (part / whole) * 100;
  return `${value > 0 && value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const yearsOf = (entry: CongressEntry) => `${entry.years[0]}–${entry.years[1] ?? "now"}`;

function toRows(data: SearchIndex, congress: number): Row[] {
  const { introduced, party, stage } = data;
  if (!introduced || !party || !stage) return [];
  return data.id.map((id, i) => {
    const type = id.split("-")[1];
    const sponsor = data.sponsor[i];
    return {
      congress,
      introduced: introduced[i],
      house: type.startsWith("h"),
      law: CAN_BECOME_LAW.has(type),
      party: party[i],
      stage: Number(stage[i]),
      sponsor: data.sponsors[sponsor] ?? "",
      name: data.sponsor_names?.[sponsor] ?? "",
      area: data.policy_areas[data.policy_area[i]] ?? "",
    };
  });
}

export function createStats(section: HTMLElement, world: World, pickMember: (id: string) => void, board: Whiteboard, cfg?: StatsWords) {
  const nameOf = (entry: CongressEntry) => cfg?.periodLabel(entry) ?? `${ordinal(entry.congress)} · ${yearsOf(entry)}`;
  const members = new Map(world.members.map((member) => [member.id, member]));
  const select = (id: string, options: [string, string][], value: string) => {
    const node = el("select", { id });
    fill(node, options, value);
    return node;
  };
  const fill = (node: HTMLSelectElement, options: [string, string][], value: string) => {
    node.replaceChildren(...options.map(([key, label]) => el("option", { value: key }, label)));
    node.value = options.some(([key]) => key === value) ? value : (options[0]?.[0] ?? "");
  };

  // Until the list of Congresses arrives, the only one on offer is the one on show.
  let line: CongressEntry[] = [{ congress: world.congress, years: world.years ?? [1789 + 2 * (world.congress - 1), null], live: !world.final }];
  const from = select("s-from", [[String(world.congress), `${ordinal(world.congress)} Congress`]], String(world.congress));
  const to = select("s-to", [[String(world.congress), `${ordinal(world.congress)} Congress`]], String(world.congress));
  const period = select("s-period", [], "");
  const kind = select("s-kind", KINDS, cfg ? "all" : "law");
  const chamber = select("s-chamber", [["", "Both chambers"], ["House", "House"], ["Senate", "Senate"]], "");
  const body = el("div", {});
  add(
    section,
    el("h2", {}, "Statistics"),
    el("label", { for: "s-from" }, cfg?.periods ?? "Congresses"),
    el("div", { class: "pair" }, from, el("span", {}, "to"), to),
    el("label", { for: "s-period" }, cfg ? `${cfg.verb[0].toUpperCase()}${cfg.verb.slice(1)} in` : "Introduced in"),
    period,
    ...(cfg ? [] : [el("label", { for: "s-kind" }, "Kind of measure"), kind, el("label", { for: "s-chamber" }, "Started in"), chamber]),
    body,
  );

  let rows: Row[] = [];
  let chosenLine: CongressEntry[] = [];
  let pending = 0;
  let latest = "";
  let state: "loading" | "ready" | "failed" = "loading";
  let opened = false;
  let loads = 0;
  // What the whiteboard draws from: the measures the choices above leave in.
  let counted: Row[] = [];
  let caption = "";
  board.setSource(() => ({ ready: state === "ready", rows: counted, caption }));

  /** Make a figure a button that draws its chart on the whiteboard. */
  const drawable = <T extends HTMLElement>(node: T, spec: Partial<BoardSpec>): T => {
    node.classList.add("pick");
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.title = "Draw this on the whiteboard";
    const go = () => board.open(spec);
    node.addEventListener("click", go);
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      go();
    });
    return node;
  };

  const span = () => chosenLine.length > 0 && chosenLine.some((entry) => entry.live);
  const single = () => chosenLine.length === 1;

  function setPeriods() {
    const keep = period.value;
    if (single() && span()) {
      fill(period, PERIODS.map(([key, label]) => [key, key === "all" && cfg ? cfg.whole : label] as [string, string]), keep || (cfg ? "all" : "month"));
      return;
    }
    const years = [...new Set(rows.map((row) => row.introduced.slice(0, 4)).filter(Boolean))].sort();
    const whole = single() ? (cfg?.whole ?? "The whole Congress") : `All of it, ${chosenLine[0].years[0]}–${chosenLine[chosenLine.length - 1].years[1] ?? "now"}`;
    fill(period, [["all", whole], ...years.map((year) => [`y${year}`, year] as [string, string])], keep.startsWith("y") ? keep : "all");
  }

  async function load() {
    const turn = ++loads;
    const low = Math.min(Number(from.value), Number(to.value));
    const high = Math.max(Number(from.value), Number(to.value));
    chosenLine = line.filter((entry) => entry.congress >= low && entry.congress <= high).sort((a, b) => a.congress - b.congress);
    state = "loading";
    render();
    try {
      const indexes = await Promise.all(chosenLine.map((entry) => loadSearchOf(entry.live ? null : entry.congress)));
      if (turn !== loads) return;
      rows = indexes.flatMap((data, i) => toRows(data, chosenLine[i].congress));
      pending = indexes.reduce((sum, data, i) => sum + (chosenLine[i].live ? (data.pending ?? 0) : 0), 0);
      latest = rows.reduce((max, row) => (row.introduced > max ? row.introduced : max), "");
      state = "ready";
      setPeriods();
    } catch {
      if (turn !== loads) return;
      state = "failed";
    }
    render();
  }

  function bar(label: string, value: number, whole: number, measure: BoardSpec["measure"], note = "") {
    const width = whole ? Math.max(value > 0 ? 1 : 0, (value / whole) * 100) : 0;
    return drawable(el(
      "li",
      {},
      el("div", { class: "bar-row" }, el("span", {}, label), el("span", { class: "count" }, value.toLocaleString())),
      el("div", { class: "meter" }, el("i", { style: `width:${width}%` })),
      el("div", { class: "row-sub" }, `${percent(value, whole)} of those introduced${note}`),
    ), { measure, across: "party", who: "" });
  }

  function chart(chosen: Row[], since: string, days: number, last: string) {
    if (days === 1 || !chosen.length) return null;
    const first = since || chosen.reduce((min, row) => (row.introduced < min ? row.introduced : min), last);
    // Days for the short periods, months for a Congress or two, years beyond that.
    const unit = days > 0 && days <= 60 ? "day" : Number(last.slice(0, 4)) - Number(first.slice(0, 4)) > 4 ? "year" : "month";
    const width = unit === "day" ? 10 : unit === "month" ? 7 : 4;
    const keys: string[] = [];
    if (unit === "day") for (let back = days - 1; back >= 0; back--) keys.push(daysBefore(last, back));
    else if (unit === "year") for (let year = Number(first.slice(0, 4)); year <= Number(last.slice(0, 4)); year++) keys.push(String(year));
    else {
      for (let cursor = first.slice(0, 7); cursor <= last.slice(0, 7); ) {
        keys.push(cursor);
        const [year, month] = cursor.split("-").map(Number);
        cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
      }
    }
    const buckets = new Map(keys.map((key) => [key, { R: 0, D: 0, I: 0 }]));
    for (const row of chosen) {
      const bucket = buckets.get(row.introduced.slice(0, width));
      if (bucket) bucket[row.party === "R" ? "R" : row.party === "D" ? "D" : "I"]++;
    }
    const tallest = Math.max(1, ...[...buckets.values()].map((b) => b.R + b.D + b.I));
    const name = (key: string) =>
      unit === "day" ? niceDate(key) : unit === "year" ? key : new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
    const columns = keys.map((key) => {
      const b = buckets.get(key)!;
      const column = el("div", { class: "column", title: `${name(key)}: ${(b.R + b.D + b.I).toLocaleString()} (${b.R} R, ${b.D} D, ${b.I} I)` });
      for (const party of ["I", "D", "R"] as const) {
        if (b[party]) column.append(el("i", { class: party, style: `height:${(b[party] / tallest) * 100}%` }));
      }
      return column;
    });
    return drawable(el(
      "div",
      {},
      el("h3", {}, `${cfg ? cfg.verb[0].toUpperCase() + cfg.verb.slice(1) : "Introduced"} each ${unit}`),
      el("div", { class: "chart", role: "img", "aria-label": `Bar chart of measures introduced each ${unit}, coloured by the sponsor's party` }, ...columns),
      el("div", { class: "chart-axis" }, el("span", {}, name(keys[0])), el("span", {}, `tallest bar: ${tallest.toLocaleString()}`), el("span", {}, name(keys[keys.length - 1]))),
    ), { measure: "introduced", across: "time", who: "" });
  }

  function render() {
    paint();
    board.refresh();
  }

  function paint() {
    counted = [];
    if (state === "failed") return put(body, el("p", { class: "note" }, "The statistics could not be loaded."));
    if (state === "loading") return put(body, el("p", { class: "note" }, cfg ? "Loading…" : chosenLine.length > 1 ? `Loading every bill of ${chosenLine.length} Congresses…` : "Loading every bill of this Congress…"));
    if (!rows.length) {
      return put(body, el("p", { class: "note" }, "These statistics need a newer copy of the data. They will appear after the next daily update."));
    }
    const live = span();
    const year = period.value.startsWith("y") ? period.value.slice(1) : "";
    const days = PERIODS.find(([key]) => key === period.value)?.[2] ?? 0;
    const since = days ? daysBefore(latest, days - 1) : "";
    const chosen = rows.filter(
      (row) =>
        row.introduced >= since &&
        row.introduced.startsWith(year) &&
        row.introduced !== "" &&
        (kind.value === "all" || row.law === (kind.value === "law")) &&
        (!chamber.value || row.house === (chamber.value === "House")),
    );
    counted = chosen;
    const all = emptyTally();
    const byParty = new Map(PARTIES.map(([key]) => [key, emptyTally()]));
    const byCongress = new Map(chosenLine.map((entry) => [entry.congress, emptyTally()]));
    const bySponsor = new Map<string, { tally: Tally; name: string; party: string }>();
    const byArea = new Map<string, number>();
    for (const row of chosen) {
      count(all, row.stage);
      const party = byParty.get(row.party);
      if (party) count(party, row.stage);
      count(byCongress.get(row.congress)!, row.stage);
      if (row.sponsor) {
        if (!bySponsor.has(row.sponsor)) bySponsor.set(row.sponsor, { tally: emptyTally(), name: row.name, party: row.party });
        count(bySponsor.get(row.sponsor)!.tally, row.stage);
      }
      if (row.area) byArea.set(row.area, (byArea.get(row.area) ?? 0) + 1);
    }

    const noun = cfg ? cfg.noun : kind.value === "law" ? "bills and joint resolutions" : kind.value === "res" ? "resolutions" : "measures";
    const first = chosenLine[0];
    const last = chosenLine[chosenLine.length - 1];
    const where = cfg
      ? cfg.where(first, last)
      : single()
      ? `in the ${ordinal(first.congress)} Congress`
      : `in the ${ordinal(first.congress)} to ${ordinal(last.congress)} Congresses (${first.years[0]}–${last.years[1] ?? "now"})`;
    const when = days === 1 ? `on ${niceDate(latest)}` : days ? `from ${niceDate(since)} to ${niceDate(latest)}` : year ? `in ${year}` : where;
    const canBecomeLaw = kind.value !== "res";
    const passedLabel = kind.value === "res" ? "Agreed to by a chamber" : "Passed at least one chamber";
    const votedNote = all.voted ? ` · ${percent(all.passed, all.voted)} of those that got a floor vote` : "";

    caption = `${noun} ${cfg?.verb ?? "introduced"} ${when}${chamber.value ? ` in the ${chamber.value}` : ""}`;
    const partyRows = PARTIES.filter(([key]) => byParty.get(key)!.introduced).map(([key, name]) => {
      const tally = byParty.get(key)!;
      return drawable(el(
        "li",
        {},
        el("div", { class: "bar-row" }, el("span", {}, el("span", { class: `pin ${key}` }), name), el("span", { class: "count" }, tally.introduced.toLocaleString())),
        el("div", { class: "meter" }, el("i", { class: key, style: `width:${(tally.introduced / Math.max(1, all.introduced)) * 100}%` })),
        el(
          "div",
          { class: "row-sub" },
          ...(cfg
            ? [`${percent(tally.introduced, all.introduced)} of the total · ${cfg.reached.toLowerCase()}: ${percent(tally.law, tally.introduced)}.`]
            : [
                `${percent(tally.introduced, all.introduced)} of the total. Floor vote ${percent(tally.voted, tally.introduced)} · passed a chamber ${percent(tally.passed, tally.introduced)}`,
                canBecomeLaw ? ` · law ${percent(tally.law, tally.introduced)}` : "",
                tally.voted ? `. Of those voted on, ${percent(tally.passed, tally.voted)} passed.` : ".",
              ]),
        ),
      ), { measure: "introduced", across: "time", who: key as BoardSpec["who"] });
    });

    // One row per Congress, so they can be compared.
    const most = Math.max(1, ...[...byCongress.values()].map((tally) => tally.introduced));
    const congressRows = single()
      ? []
      : [...chosenLine].reverse().map((entry) => {
          const tally = byCongress.get(entry.congress)!;
          return drawable(el(
            "li",
            {},
            el("div", { class: "bar-row" }, el("span", {}, nameOf(entry)), el("span", { class: "count" }, tally.introduced.toLocaleString())),
            el("div", { class: "meter" }, el("i", { style: `width:${(tally.introduced / most) * 100}%` })),
            el(
              "div",
              { class: "row-sub" },
              ...(cfg
                ? [`${cfg.reached}: ${tally.law.toLocaleString()} (${percent(tally.law, tally.introduced)})`]
                : [
                    `Out of committee ${percent(tally.reported, tally.introduced)} · passed a chamber ${percent(tally.passed, tally.introduced)}`,
                    canBecomeLaw ? ` · ${tally.law.toLocaleString()} became law (${percent(tally.law, tally.introduced)})` : "",
                  ]),
              entry.live ? " · still under way" : "",
            ),
          ), { measure: canBecomeLaw ? "law" : "passed", across: "congress", who: "" });
        });

    const sponsorRows = [...bySponsor.entries()]
      .sort((a, b) => b[1].tally.introduced - a[1].tally.introduced || b[1].tally.passed - a[1].tally.passed)
      .slice(0, 8)
      .map(([id, { tally, name, party }]) => {
        const member = members.get(id);
        const label = member ? `${member.name} (${member.party}-${member.state})` : name;
        if (!label) return null;
        const title = el("span", { class: "row-title" }, el("span", { class: `pin ${member?.party ?? party}` }), label);
        const sub = el("span", { class: "row-sub" }, cfg ? `${tally.introduced.toLocaleString()} ${cfg.verb} · ${cfg.reached.toLowerCase()}: ${tally.law.toLocaleString()}` : `${tally.introduced.toLocaleString()} introduced · ${tally.passed.toLocaleString()} passed a chamber${canBecomeLaw ? ` · ${tally.law.toLocaleString()} became law` : ""}`);
        if (!member) return el("li", {}, el("div", { class: "plain-row" }, title, sub)); // not in the Congress on show
        const button = el("button", { type: "button" }, title, sub);
        button.addEventListener("click", () => pickMember(member.id));
        return el("li", {}, button);
      });

    const areaRows = [...byArea.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([area, n]) => drawable(el("li", {}, el("div", { class: "bar-row" }, el("span", {}, area), el("span", { class: "count" }, n.toLocaleString()))), { measure: "introduced", across: "area", who: "" }));

    put(
      body,
      el("p", { class: "note" }, "Pick any figure to draw it on the whiteboard."),
      drawable(el("div", { class: "stat-big" }, all.introduced.toLocaleString()), { measure: "introduced", across: "party", who: "" }),
      el("p", {}, `${caption}.`),
      all.introduced ? el("h3", {}, cfg ? cfg.outcomeTitle : live ? "How far they have got" : "How far they got") : null,
      all.introduced
        ? el(
            "ul",
            { class: "list" },
            ...(cfg
              ? [bar(cfg.reached, all.law, all.introduced, "law")]
              : [
                  bar("Out of committee", all.reported, all.introduced, "reported"),
                  bar("Got a floor vote", all.voted, all.introduced, "voted"),
                  bar(passedLabel, all.passed, all.introduced, "passed", votedNote),
                  canBecomeLaw ? bar("Passed both chambers", all.both, all.introduced, "passed") : null,
                  canBecomeLaw ? bar("Became law", all.law, all.introduced, "law") : null,
                ]),
          )
        : null,
      all.introduced
        ? el(
            "p",
            { class: "note" },
            ...(cfg
              ? [cfg.outcomeNote]
              : [
                  live ? "These follow the same measures counted above, so recent ones have had less time to move." : `${single() ? "This Congress has" : "These Congresses have"} ended, so these are final.`,
                  " A floor vote here means the measure passed a chamber, or its latest action is a vote it lost.",
                ]),
          )
        : null,
      congressRows.length ? el("h3", {}, cfg?.byPeriod ?? "By Congress") : null,
      el("ul", { class: "list" }, ...congressRows),
      partyRows.length ? el("h3", {}, cfg?.byParty ?? "By sponsor’s party") : null,
      el("ul", { class: "list" }, ...partyRows),
      chart(chosen, since, days, year ? chosen.reduce((max, row) => (row.introduced > max ? row.introduced : max), "") : latest),
      sponsorRows.length ? el("h3", {}, cfg?.most ?? "Who introduced the most") : null,
      el("ul", { class: "list" }, ...sponsorRows),
      areaRows.length ? el("h3", {}, cfg?.areas ?? "Most common policy areas") : null,
      el("ul", { class: "list" }, ...areaRows),
      el(
        "p",
        { class: "note" },
        ...(cfg
          ? [cfg.footnote]
          : [
              `Counted from ${rows.length.toLocaleString()} measures of ${single() ? "this Congress" : `${chosenLine.length} Congresses`}, by the date each was introduced. `,
              live ? (pending ? `That includes ${pending.toLocaleString()} too new to have published text. ` : "The newest few may be missing until their text is published. ") : "",
              "Party is the sponsor’s; cosponsors are not counted.",
            ]),
      ),
    );
  }

  for (const node of [period, kind, chamber]) node.addEventListener("change", render);
  for (const node of [from, to]) node.addEventListener("change", () => void load());

  return {
    /** Called when the tab is shown; loads the index the first time. */
    open() {
      if (opened) return;
      opened = true;
      void load();
      void loadCongressLine().then((entries) => {
        if (entries.length < 2 || !section.isConnected) return;
        line = entries;
        const options = entries.map((entry) => [String(entry.congress), nameOf(entry)] as [string, string]);
        fill(from, options, from.value);
        fill(to, options, to.value);
      });
    },
  };
}
