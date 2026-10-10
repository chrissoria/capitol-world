// The Stats tab: how many measures were introduced in a period, by whom, and how
// far those same measures have got. Everything is counted in the browser from
// the search index, so the choices below can be combined freely.

import { loadSearch } from "../data/load";
import type { SearchIndex, World } from "../data/types";
import { add, el, niceDate, put } from "./dom";

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

interface Row {
  introduced: string;
  house: boolean;
  law: boolean;
  party: string;
  stage: number;
  sponsor: number;
  area: number;
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

export function createStats(section: HTMLElement, world: World, pickMember: (id: string) => void) {
  const members = new Map(world.members.map((member) => [member.id, member]));
  const select = (id: string, options: [string, string][], value: string) => {
    const node = el("select", { id });
    for (const [key, label] of options) node.append(el("option", { value: key }, label));
    node.value = value;
    return node;
  };
  const period = select("s-period", PERIODS.map(([key, label]) => [key, label] as [string, string]), "month");
  const kind = select("s-kind", KINDS, "law");
  const chamber = select("s-chamber", [["", "Both chambers"], ["House", "House"], ["Senate", "Senate"]], "");
  const body = el("div", {});
  add(
    section,
    el("h2", {}, "Statistics"),
    el("label", { for: "s-period" }, "Introduced in"),
    period,
    el("label", { for: "s-kind" }, "Kind of measure"),
    kind,
    el("label", { for: "s-chamber" }, "Started in"),
    chamber,
    body,
  );

  let index: SearchIndex | undefined;
  let rows: Row[] = [];
  let latest = "";
  let opened = false;

  function prepare(data: SearchIndex) {
    index = data;
    const { introduced, party, stage } = data;
    if (!introduced || !party || !stage) return;
    rows = data.id.map((id, i) => {
      const type = id.split("-")[1];
      return {
        introduced: introduced[i],
        house: type.startsWith("h"),
        law: CAN_BECOME_LAW.has(type),
        party: party[i],
        stage: Number(stage[i]),
        sponsor: data.sponsor[i],
        area: data.policy_area[i],
      };
    });
    latest = rows.reduce((max, row) => (row.introduced > max ? row.introduced : max), "");
  }

  function bar(label: string, value: number, whole: number, note = "") {
    const width = whole ? Math.max(value > 0 ? 1 : 0, (value / whole) * 100) : 0;
    return el(
      "li",
      {},
      el("div", { class: "bar-row" }, el("span", {}, label), el("span", { class: "count" }, value.toLocaleString())),
      el("div", { class: "meter" }, el("i", { style: `width:${width}%` })),
      el("div", { class: "row-sub" }, `${percent(value, whole)} of those introduced${note}`),
    );
  }

  function chart(chosen: Row[], since: string, days: number) {
    if (days === 1 || !chosen.length) return null;
    // Days for the short periods, months for the long ones.
    const byMonth = days === 0 || days > 60;
    const first = since || chosen.reduce((min, row) => (row.introduced < min ? row.introduced : min), latest);
    const keys: string[] = [];
    if (byMonth) {
      for (let cursor = first.slice(0, 7); cursor <= latest.slice(0, 7); ) {
        keys.push(cursor);
        const [year, month] = cursor.split("-").map(Number);
        cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
      }
    } else for (let back = days - 1; back >= 0; back--) keys.push(daysBefore(latest, back));
    const buckets = new Map(keys.map((key) => [key, { R: 0, D: 0, I: 0 }]));
    for (const row of chosen) {
      const bucket = buckets.get(byMonth ? row.introduced.slice(0, 7) : row.introduced);
      if (bucket) bucket[row.party === "R" ? "R" : row.party === "D" ? "D" : "I"]++;
    }
    const tallest = Math.max(1, ...[...buckets.values()].map((b) => b.R + b.D + b.I));
    const columns = keys.map((key) => {
      const b = buckets.get(key)!;
      const total = b.R + b.D + b.I;
      const label = byMonth ? new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : niceDate(key);
      const column = el("div", { class: "column", title: `${label}: ${total.toLocaleString()} (${b.R} R, ${b.D} D, ${b.I} I)` });
      for (const party of ["I", "D", "R"] as const) {
        if (b[party]) column.append(el("i", { class: party, style: `height:${(b[party] / tallest) * 100}%` }));
      }
      return column;
    });
    const edge = (key: string) => (byMonth ? new Date(`${key}-15T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : niceDate(key));
    return el(
      "div",
      {},
      el("h3", {}, byMonth ? "Introduced each month" : "Introduced each day"),
      el("div", { class: "chart", role: "img", "aria-label": `Bar chart of measures introduced ${byMonth ? "each month" : "each day"}, coloured by the sponsor's party` }, ...columns),
      el("div", { class: "chart-axis" }, el("span", {}, edge(keys[0])), el("span", {}, `tallest bar: ${tallest.toLocaleString()}`), el("span", {}, edge(keys[keys.length - 1]))),
    );
  }

  function render() {
    if (!index) return put(body, el("p", { class: "note" }, "Loading every bill of this Congress…"));
    if (!rows.length) {
      return put(body, el("p", { class: "note" }, "These statistics need a newer copy of the data. They will appear after the next daily update."));
    }
    const days = PERIODS.find(([key]) => key === period.value)![2];
    const since = days ? daysBefore(latest, days - 1) : "";
    const chosen = rows.filter(
      (row) =>
        row.introduced >= since &&
        row.introduced !== "" &&
        (kind.value === "all" || row.law === (kind.value === "law")) &&
        (!chamber.value || row.house === (chamber.value === "House")),
    );
    const all = emptyTally();
    const byParty = new Map(PARTIES.map(([key]) => [key, emptyTally()]));
    const bySponsor = new Map<number, Tally>();
    const byArea = new Map<number, number>();
    for (const row of chosen) {
      count(all, row.stage);
      const party = byParty.get(row.party);
      if (party) count(party, row.stage);
      if (row.sponsor >= 0) {
        if (!bySponsor.has(row.sponsor)) bySponsor.set(row.sponsor, emptyTally());
        count(bySponsor.get(row.sponsor)!, row.stage);
      }
      if (row.area >= 0) byArea.set(row.area, (byArea.get(row.area) ?? 0) + 1);
    }

    const noun = kind.value === "law" ? "bills and joint resolutions" : kind.value === "res" ? "resolutions" : "measures";
    const span = days === 1 ? `on ${niceDate(latest)}` : days ? `from ${niceDate(since)} to ${niceDate(latest)}` : `since ${niceDate("2025-01-03")}`;
    const canBecomeLaw = kind.value !== "res";
    const passedLabel = kind.value === "res" ? "Agreed to by a chamber" : "Passed at least one chamber";
    const votedNote = all.voted ? ` · ${percent(all.passed, all.voted)} of those that got a floor vote` : "";

    const partyRows = PARTIES.filter(([key]) => byParty.get(key)!.introduced).map(([key, name]) => {
      const tally = byParty.get(key)!;
      return el(
        "li",
        {},
        el("div", { class: "bar-row" }, el("span", {}, el("span", { class: `pin ${key}` }), name), el("span", { class: "count" }, tally.introduced.toLocaleString())),
        el("div", { class: "meter" }, el("i", { class: key, style: `width:${(tally.introduced / Math.max(1, all.introduced)) * 100}%` })),
        el(
          "div",
          { class: "row-sub" },
          `${percent(tally.introduced, all.introduced)} of the total. Floor vote ${percent(tally.voted, tally.introduced)} · passed a chamber ${percent(tally.passed, tally.introduced)}`,
          canBecomeLaw ? ` · law ${percent(tally.law, tally.introduced)}` : "",
          tally.voted ? `. Of those voted on, ${percent(tally.passed, tally.voted)} passed.` : ".",
        ),
      );
    });

    const sponsorRows = [...bySponsor.entries()]
      .sort((a, b) => b[1].introduced - a[1].introduced || b[1].passed - a[1].passed)
      .slice(0, 8)
      .map(([sponsorIndex, tally]) => {
        const member = members.get(index!.sponsors[sponsorIndex]);
        if (!member) return null;
        const button = el(
          "button",
          { type: "button" },
          el("span", { class: "row-title" }, el("span", { class: `pin ${member.party}` }), `${member.name} (${member.party}-${member.state})`),
          el("span", { class: "row-sub" }, `${tally.introduced.toLocaleString()} introduced · ${tally.passed.toLocaleString()} passed a chamber${canBecomeLaw ? ` · ${tally.law.toLocaleString()} became law` : ""}`),
        );
        button.addEventListener("click", () => pickMember(member.id));
        return el("li", {}, button);
      });

    const areaRows = [...byArea.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([area, n]) => el("li", {}, el("div", { class: "bar-row" }, el("span", {}, index!.policy_areas[area]), el("span", { class: "count" }, n.toLocaleString()))));

    put(
      body,
      el("div", { class: "stat-big" }, all.introduced.toLocaleString()),
      el("p", {}, `${noun} introduced ${span}${chamber.value ? ` in the ${chamber.value}` : ""}.`),
      all.introduced ? el("h3", {}, "How far they have got") : null,
      all.introduced
        ? el(
            "ul",
            { class: "list" },
            bar("Out of committee", all.reported, all.introduced),
            bar("Got a floor vote", all.voted, all.introduced),
            bar(passedLabel, all.passed, all.introduced, votedNote),
            canBecomeLaw ? bar("Passed both chambers", all.both, all.introduced) : null,
            canBecomeLaw ? bar("Became law", all.law, all.introduced) : null,
          )
        : null,
      all.introduced ? el("p", { class: "note" }, "These follow the same measures counted above, so recent ones have had less time to move. A floor vote here means the measure passed a chamber, or its latest action is a vote it lost.") : null,
      partyRows.length ? el("h3", {}, "By sponsor’s party") : null,
      el("ul", { class: "list" }, ...partyRows),
      chart(chosen, since, days),
      sponsorRows.length ? el("h3", {}, "Who introduced the most") : null,
      el("ul", { class: "list" }, ...sponsorRows),
      areaRows.length ? el("h3", {}, "Most common policy areas") : null,
      el("ul", { class: "list" }, ...areaRows),
      el(
        "p",
        { class: "note" },
        `Counted from ${rows.length.toLocaleString()} measures of this Congress, by the date each was introduced. `,
        index.pending ? `That includes ${index.pending.toLocaleString()} too new to have published text. ` : "The newest few may be missing until their text is published. ",
        "Party is the sponsor’s; cosponsors are not counted.",
      ),
    );
  }

  for (const node of [period, kind, chamber]) node.addEventListener("change", render);

  return {
    /** Called when the tab is shown; loads the index the first time. */
    open() {
      if (opened) return;
      opened = true;
      render();
      loadSearch()
        .then((data) => {
          prepare(data);
          render();
        })
        .catch(() => put(body, el("p", { class: "note" }, "The statistics could not be loaded.")));
    },
  };
}
