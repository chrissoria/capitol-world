// The Supreme Court: the justices and the cases they decide. The data is one
// file beside the supreme-court-cases dataset (build_court_snapshot.py), plus a
// small file of words for each term; a period here is a term of the Court,
// which opens in October and is named for that year.

import { fetchJson, type CongressEntry, type DataProvider } from "../data/load";
import type { Bill, Member, MoveEvent, SearchIndex, World } from "../data/types";
import { MAP_W, makeSite, streets, type Layout, type Rect, type Site } from "../world/layout";
import type { WorldDef } from "./types";

const FOLDER = "https://huggingface.co/datasets/chrissoria/supreme-court-cases/resolve/main/world/";

/** world/court.json.gz. The lists under `cases` and `applications` run in parallel, one entry per item. */
interface CourtFile {
  data_through: string;
  current_term: number;
  justices: { id: string; name: string; last_name: string; appointed_by: string; party: string; start: string; end: string; chief_from: string; born: string }[];
  terms: { term: number; chief: number; justices: number[]; paid_petitions: number | null; ifp_petitions: number | null; applications: number | null; routine_applications: number }[];
  dispositions: string[];
  issue_areas: string[];
  issues: string[];
  laws: string[];
  lower_courts: string[];
  decision_types: string[];
  cases: {
    id: string[]; term: number[]; docket: string[]; name: string[]; stage: string[]; granted: string[]; argued: string[]; decided: string[];
    citation: string[]; disposition: number[]; winner: string[]; majority: number[]; minority: number[]; author: number[]; area: number[];
    issue: number[]; law: number[]; unconstitutional: string[]; precedent_altered: number[]; lower_court: number[]; decision_type: number[];
    /** One letter per justice of the term: W wrote for the Court, M joined, C concurred in writing, D dissented, X wrote a dissent, - took no part. */
    votes: string[]; url: string[];
  };
  application_kinds: string[];
  application_courts: string[];
  applications: {
    docket?: string[]; term: number[]; title: string[]; kind: number[]; filed: string[]; outcome: string[]; decided_by: string[];
    resolved: string[]; referred: number[]; capital: number[]; lower_court: number[]; url: string[];
    /** The day it was referred to the full Court, and the seat of the justice it went to first. Absent in an older file. */
    referred_on?: string[]; submitted_to?: number[];
  };
}

/** world/text/<term>.json.gz: [question, holding] for a case, [what was asked, the answer] for an application. */
interface TextFile {
  cases: Record<string, [string, string, string?]>;
  applications: Record<string, [string, string]>;
}

let file: Promise<CourtFile> | undefined;
const load = () => (file ??= fetchJson<CourtFile>(`${FOLDER}court.json.gz`));
const texts = new Map<number, Promise<TextFile>>();
const loadText = (term: number) => {
  let text = texts.get(term);
  if (!text) texts.set(term, (text = fetchJson<TextFile>(`${FOLDER}text/${term}.json.gz`).catch(() => ({ cases: {}, applications: {} }))));
  return text;
};

/** The places a case can be. Each is also the key of a building on the map. */
const PLACES = {
  calendar: "Waiting to be argued",
  court: "Argued, awaiting a decision",
  affirmed: "Affirmed",
  reversed: "Reversed",
  vacated: "Vacated",
  other: "Decided another way",
  emergency: "Emergency applications",
} as const;
type Place = keyof typeof PLACES;

function placeOf(stage: string, disposition: string): Place {
  if (stage !== "decided") return stage === "argued" ? "court" : "calendar";
  if (disposition === "affirmed") return "affirmed";
  if (disposition.startsWith("reversed")) return "reversed";
  if (disposition.startsWith("vacated")) return "vacated";
  return "other"; // in part, dismissed, or no disposition on record
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** The database abbreviates courts as lawyers do ("U.S. Ct. App., D.C. Cir."); spell the common ones out. */
function courtName(name: string): string {
  return name
    .replace(/\bCt\. App\.,?/g, "Court of Appeals,")
    .replace(/\bDist\. Ct\./g, "District Court")
    .replace(/\bSup\. Ct\./g, "Supreme Court")
    .replace(/\bCir\./g, "Circuit")
    .replace(/\bCt\./g, "Court")
    .replace(/,\s*$/, "")
    .replace(/\.$/, "");
}

/** "John Glover Roberts, Jr." as "John G. Roberts": the form the Court's own reports use. */
function shortName(name: string): string {
  const words = name.replace(/,.*$/, "").split(/\s+/).filter(Boolean);
  if (words.length < 3) return words.join(" ");
  return [words[0], ...words.slice(1, -1).map((middle) => (middle.length > 2 && !middle.endsWith(".") ? `${middle[0]}.` : middle)), words[words.length - 1]].join(" ");
}

const termName = (term: number) => `${term}–${String((term + 1) % 100).padStart(2, "0")} term`;
const applicationId = (term: number, docket: string) => `${term}-app-${docket.toLowerCase()}`;

/** What the card of an item says beyond the common fields, kept beside the bills rather than on them. */
const notes = new Map<string, { heading: string; rows: { text: string }[] }[]>();
/** Cases whose argument can be re-staged in the Courtroom, with what to say of it. */
const sittings = new Map<string, string>();
/** What to say where a justice's name would go, for an item with no single author. */
const unsigned = new Map<string, string>();

function voteLines(data: CourtFile, sitting: number[], k: number): string[] {
  const line = data.cases.votes[k];
  if (!line) return [];
  const names = (letters: string, tag: (letter: string) => string) =>
    sitting.flatMap((justice, seat) => (letters.includes(line[seat]) ? [data.justices[justice].last_name + tag(line[seat])] : [])).join(", ");
  const majority = names("WMC", (letter) => (letter === "W" ? " (wrote the opinion)" : letter === "C" ? " (wrote separately)" : ""));
  const dissent = names("DX", (letter) => (letter === "X" ? " (wrote a dissent)" : ""));
  const absent = names("-", () => "");
  return [
    majority ? `In the majority: ${majority}.` : "",
    dissent ? `Dissenting: ${dissent}.` : "",
    absent && (majority || dissent) ? `Took no part, or vote not recorded: ${absent}.` : "",
  ].filter(Boolean);
}

const provider: DataProvider = {
  async world(period) {
    const data = await load();
    const row = data.terms.find((entry) => entry.term === period) ?? data.terms.find((entry) => entry.term === data.current_term) ?? data.terms[data.terms.length - 1];
    const term = row.term;
    const final = term < data.current_term;
    const words = await loadText(term);
    const { cases, applications } = data;

    const bills: Bill[] = [];
    const wrote = new Map<number, number>();
    for (let k = 0; k < cases.id.length; k++) {
      if (cases.term[k] !== term) continue;
      const disposition = data.dispositions[cases.disposition[k]] ?? "";
      const decided = cases.stage[k] === "decided";
      const place = placeOf(cases.stage[k], disposition);
      const author = cases.author[k] >= 0 ? data.justices[cases.author[k]] : null;
      if (author) wrote.set(cases.author[k], (wrote.get(cases.author[k]) ?? 0) + 1);
      const split = cases.majority[k] ? `${cases.majority[k]}–${cases.minority[k]}` : "";
      const date = cases.decided[k] || cases.argued[k] || cases.granted[k];
      const [question, holding, argument = ""] = words.cases[cases.id[k]] ?? ["", ""];
      const status = decided ? capital(disposition || "decided") : cases.stage[k] === "argued" ? "Argued" : cases.stage[k] === "set for argument" ? "Set for argument" : "Granted";
      bills.push({
        id: cases.id[k],
        type: "SC",
        number: cases.docket[k],
        title: cases.name[k],
        sponsor: author?.id ?? "",
        cosponsors: 0,
        policy_area: data.issue_areas[cases.area[k]] ?? "",
        status,
        loc: { kind: place as never, chamber: "", committee: "" },
        last_action: {
          date,
          text: decided
            ? `Decided${split ? ` ${split}` : ""}${disposition ? `: ${disposition}` : ""}.${author ? ` Opinion of the Court by ${author.last_name}.` : ""}`
            : cases.stage[k] === "argued"
              ? "Argued. The Court has not yet decided."
              : cases.argued[k] > data.data_through || cases.stage[k] === "set for argument"
                ? "The Court has agreed to hear the case; argument is scheduled."
                : "The Court has agreed to hear the case.",
        },
        introduced: date,
        summary: question,
        url: cases.url[k],
      });
      if (!author) unsigned.set(cases.id[k], decided ? "Unsigned: the Court spoke as a whole (per curiam), or no single opinion spoke for it." : "Not yet decided.");
      const facts = [
        cases.granted[k] ? `Review granted ${day(cases.granted[k])}.` : "",
        cases.argued[k] ? `${cases.argued[k] > data.data_through ? "To be argued" : "Argued"} ${day(cases.argued[k])}.` : "",
        data.lower_courts[cases.lower_court[k]] ? `Came from: ${courtName(data.lower_courts[cases.lower_court[k]])}.` : "",
        data.issues[cases.issue[k]] ? `Subject: ${data.issues[cases.issue[k]]}.` : "",
        // The database files rarely litigated statutes under a catch-all, which says nothing worth showing.
        data.laws[cases.law[k]] && !/^(Infrequent|No Legal)/i.test(data.laws[cases.law[k]]) ? `Law at issue: ${data.laws[cases.law[k]]}.` : "",
        cases.unconstitutional[k] ? `The Court held a ${cases.unconstitutional[k]} unconstitutional.` : "",
        cases.precedent_altered[k] ? "The Court altered one of its own precedents." : "",
        cases.citation[k] ? `Reported at ${cases.citation[k]}.` : "",
      ].filter(Boolean);
      notes.set(cases.id[k], [
        { heading: "What the Court held", rows: holding && decided ? [{ text: holding }] : [] },
        { heading: split ? `The vote: ${split}` : "The vote", rows: voteLines(data, row.justices, k).map((text) => ({ text })) },
        { heading: "At argument", rows: argument ? [{ text: argument.replace(/\s*VIDED\.?\s*$/, "") }] : [] },
        { heading: "The record", rows: facts.map((text) => ({ text })) },
      ].filter((group) => group.rows.length));
    }

    for (let k = 0; k < (applications.docket?.length ?? 0); k++) {
      if (applications.term[k] !== term) continue;
      const docket = applications.docket![k];
      const id = applicationId(term, docket);
      const outcome = applications.outcome[k];
      const kind = data.application_kinds[applications.kind[k]] ?? "application";
      const [asked, answer] = words.applications[docket] ?? ["", ""];
      const by = applications.decided_by[k];
      bills.push({
        id,
        type: "APP",
        number: docket,
        title: applications.title[k],
        sponsor: "",
        cosponsors: 0,
        policy_area: "",
        status: outcome ? capital(outcome) : "Pending",
        loc: { kind: "emergency" as never, chamber: "", committee: "" },
        last_action: {
          date: applications.resolved[k] || applications.filed[k],
          text: outcome ? `${capital(outcome)}${by ? ` by ${by}` : ""}.` : "Filed; no ruling on the docket yet.",
        },
        introduced: applications.filed[k],
        summary: asked,
        url: applications.url[k],
      });
      unsigned.set(id, by ? `By ${by}.` : outcome ? "The docket does not say who ruled." : "No ruling yet.");
      notes.set(id, [
        { heading: "The answer", rows: answer && answer !== asked ? [{ text: answer }] : [] },
        { heading: "The record", rows: [
          `An application for ${kind === "other" ? "relief" : kind === "vacate" ? "an order vacating a ruling below" : /^[aeiou]/.test(kind) ? `an ${kind}` : `a ${kind}`}, filed ${day(applications.filed[k])}.`,
          (applications.submitted_to?.[k] ?? -1) >= 0 ? `It went first to Justice ${data.justices[applications.submitted_to![k]].last_name}, who handles such requests from that part of the country.` : "",
          applications.referred[k] ? `That justice referred it to the full Court${applications.referred_on?.[k] ? ` on ${day(applications.referred_on[k])}` : ""}.` : "",
          applications.capital[k] ? "A capital case." : "",
          data.application_courts[applications.lower_court[k]] ? `Came from: ${courtName(data.application_courts[applications.lower_court[k]])}.` : "",
        ].filter(Boolean).map((text) => ({ text })) },
      ].filter((group) => group.rows.length));
    }
    bills.sort((a, b) => b.last_action.date.localeCompare(a.last_action.date) || a.id.localeCompare(b.id));

    const decidedDates = bills.filter((bill) => bill.type === "SC" && bill.loc.kind !== ("calendar" as never) && bill.loc.kind !== ("court" as never)).map((bill) => bill.last_action.date).sort();
    const through = final ? decidedDates[decidedDates.length - 1] ?? `${term + 1}-06-30` : data.data_through;
    const since = new Date(`${through}T12:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 7);
    const eventsSince = since.toISOString().slice(0, 10);
    // The week's movement: a case argued walks into the Court, a case decided walks out to how it came out.
    const events: MoveEvent[] = bills
      .filter((bill) => bill.type === "SC" && bill.last_action.date >= eventsSince && bill.last_action.date <= through && bill.loc.kind !== ("calendar" as never))
      .reverse()
      .map((bill, seq) => ({
        bill: bill.id,
        date: bill.last_action.date,
        seq,
        from: bill.loc.kind === ("court" as never) ? "calendar" : "court",
        to: bill.loc.kind as string,
        text: `${bill.title.slice(0, 110)}: ${bill.status.toLowerCase()}`,
        actor: null,
        actor_role: null,
      }));

    // Every movement of the term in order, for the long replay. A case granted before the term opened starts on
    // the calendar; an application comes up the avenue from the gate, and goes into the Court and back if it was
    // referred to all nine.
    const termStart = `${term}-10-01`;
    const story: MoveEvent[] = [];
    const move = (bill: string, date: string, from: string | null, to: string, text: string, via?: string) =>
      date && date <= through && story.push({ bill, date, seq: 0, from, to, text, actor: null, actor_role: null, ...(via ? { via } : {}) });
    for (let k = 0; k < cases.id.length; k++) {
      if (cases.term[k] !== term) continue;
      const id = cases.id[k];
      const name = cases.name[k].slice(0, 110);
      let at: string | null = cases.granted[k] && cases.granted[k] < termStart ? "calendar" : null;
      if (cases.granted[k] >= termStart && move(id, cases.granted[k], null, "calendar", `${name}: review granted`)) at = "calendar";
      if (cases.argued[k] && cases.argued[k] <= through) {
        // A case argued in an earlier term and held over starts the story inside the Court.
        if (cases.argued[k] >= termStart) move(id, cases.argued[k], at, "court", `${name}: argued`);
        at = "court";
        sittings.set(id, `the argument of ${day(cases.argued[k])} in ${cases.name[k]}, re-staged`);
      }
      if (cases.stage[k] === "decided") move(id, cases.decided[k], at, placeOf("decided", data.dispositions[cases.disposition[k]] ?? ""), `${name}: decided`);
    }
    for (let k = 0; k < (applications.docket?.length ?? 0); k++) {
      if (applications.term[k] !== term) continue;
      const id = applicationId(term, applications.docket![k]);
      const title = applications.title[k].slice(0, 110);
      if (applications.filed[k] < `${term}-06-01`) continue; // misfiled under the term: it would stretch the story back months
      move(id, applications.filed[k], null, "emergency", `${title}: application filed`, "gate");
      const referred = applications.referred_on?.[k] ?? "";
      if (referred && applications.resolved[k] && referred <= applications.resolved[k]) {
        move(id, referred, "emergency", "court", `${title}: referred to the full Court`);
        move(id, applications.resolved[k], "court", "emergency", `${title}: ${applications.outcome[k] || "ruled on"}`);
      }
    }
    story.sort((a, b) => a.date.localeCompare(b.date));
    story.forEach((event, seq) => (event.seq = seq));

    const members: Member[] = row.justices.map((index) => {
      const justice = data.justices[index];
      const chief = index === row.chief;
      const n = wrote.get(index) ?? 0;
      return {
        id: justice.id,
        name: shortName(justice.name),
        party: "",
        state: "",
        district: null,
        chamber: "",
        n_world: n,
        n_total: n,
        role: `${chief ? "Chief Justice" : "Associate Justice"} · appointed by ${justice.appointed_by}, ${(chief && justice.chief_from ? justice.chief_from : justice.start).slice(0, 4)}`,
        group: chief ? "Chief Justice" : "Justice",
        look: { suit: "#1b1b22", robe: true },
      };
    });
    const count = (key: (bill: Bill) => string) => bills.reduce<Record<string, number>>((all, bill) => ({ ...all, [key(bill)]: (all[key(bill)] ?? 0) + 1 }), {});
    return {
      schema: 1,
      generated_at: "",
      data_through: through,
      congress: term,
      window: { world_since: `${term}-10-01`, events_since: eventsSince },
      counts: { total: bills.length, world: bills.length, events: events.length, guessed_locations: 0, by_status: count((b) => b.status), by_kind: count((b) => b.loc.kind) },
      members,
      committees: [],
      bills,
      events,
      story,
      final,
      years: [term, term + 1],
      summary_source: "court",
    } satisfies World;
  },

  /** The cases and applications of one term, as a search index. Applications can be found but are not counted in the statistics. */
  async search(period) {
    const data = await load();
    const term = data.terms.some((entry) => entry.term === period) ? period! : data.current_term;
    const { cases, applications } = data;
    const rows = cases.term.flatMap((value, k) => (value === term ? [k] : []));
    const apps = (applications.docket ?? []).flatMap((_, k) => (applications.term[k] === term ? [k] : []));
    const statuses = [...data.dispositions.map(capital), "Decided", "Argued", "Set for argument", "Granted", "Application"];
    const statusOf = (k: number) =>
      cases.stage[k] === "decided" ? (cases.disposition[k] >= 0 ? cases.disposition[k] : data.dispositions.length) : statuses.indexOf(cases.stage[k] === "argued" ? "Argued" : cases.stage[k] === "set for argument" ? "Set for argument" : "Granted");
    const dateOf = (k: number) => cases.decided[k] || cases.argued[k] || cases.granted[k];
    return {
      schema: 1,
      data_through: data.data_through,
      sponsors: data.justices.map((justice) => justice.id),
      sponsor_names: data.justices.map((justice) => shortName(justice.name)),
      statuses,
      policy_areas: data.issue_areas,
      id: [...rows.map((k) => cases.id[k]), ...apps.map((k) => applicationId(term, applications.docket![k]))],
      title: [...rows.map((k) => `${cases.name[k]} (No. ${cases.docket[k]})`), ...apps.map((k) => `${applications.title[k]} (No. ${applications.docket![k]})`)],
      sponsor: [...rows.map((k) => cases.author[k]), ...apps.map(() => -1)],
      status: [...rows.map(statusOf), ...apps.map(() => statuses.length - 1)],
      policy_area: [...rows.map((k) => cases.area[k]), ...apps.map(() => -1)],
      date: [...rows.map(dateOf), ...apps.map((k) => applications.resolved[k] || applications.filed[k])],
      introduced: [...rows.map(dateOf), ...apps.map((k) => applications.filed[k])],
      party: "?".repeat(rows.length + apps.length),
      // 5 where the party that asked for review won, which is to say the court below was overturned.
      stage: rows.map((k) => (cases.winner[k] === "p" ? "5" : "0")).join("") + "0".repeat(apps.length),
      fate: ".".repeat(rows.length + apps.length),
      uncounted: "0".repeat(rows.length) + "1".repeat(apps.length),
    } satisfies SearchIndex;
  },

  async line() {
    const data = await load();
    return data.terms
      .map((entry): CongressEntry => ({ congress: entry.term, years: [entry.term, entry.term === data.current_term ? null : entry.term + 1], live: entry.term === data.current_term }))
      .reverse();
  },
};

/** Who was Chief Justice each term, for the picker; filled in when the file has loaded. */
const chiefs = new Map<number, string>();
void load().then((data) => data.terms.forEach((entry) => entry.chief >= 0 && chiefs.set(entry.term, data.justices[entry.chief].last_name)), () => undefined);

/** The Court at the head of a lawn; before it, the cases waiting and the applications; below, how the decided ones came out. */
function layout(): Layout {
  const sites = new Map<string, Site>();
  const add = (site: Site) => sites.set(site.key, site);
  const mirror = (rect: Rect): Rect => ({ ...rect, x: MAP_W - rect.x - rect.w });
  const gate = (key: string, label: string, to: string, wing: Site["wing"], rect: Rect) => {
    const site = makeSite(key, "gate", label, label, wing, rect);
    site.travel = to;
    add(site);
  };
  add(makeSite("court", "court", "Supreme Court", "Supreme Court", "Center", { x: 72, y: 3, w: 32, h: 14 }, { x: 80, w: 16 }));
  const waiting: Rect = { x: 50, y: 24, w: 22, h: 6 };
  add(makeSite("calendar", "calendar", "Argument Calendar", "Argument Calendar", "House", waiting));
  add(makeSite("emergency", "calendar", "Emergency Docket", "Emergency Docket", "Senate", mirror(waiting)));
  const inner: Rect = { x: 54, y: 40, w: 18, h: 8 };
  const outer: Rect = { x: 30, y: 40, w: 18, h: 8 };
  add({ ...makeSite("affirmed", "archive", "Affirmed", "Affirmed", "Center", outer), reach: "House" });
  add({ ...makeSite("reversed", "hall", "Reversed", "Reversed", "Center", inner), reach: "House" });
  add({ ...makeSite("vacated", "department", "Vacated", "Vacated", "Center", mirror(inner)), reach: "Senate" });
  add({ ...makeSite("other", "conference", "Other Outcomes", "Other Outcomes", "Center", mirror(outer)), reach: "Senate" });
  add(makeSite("library", "library", "Library", "Library", "House", { x: 10, y: 5, w: 16, h: 8 }));
  gate("gate", "To Capitol Hill", "capitol", "Center", { x: 83, y: 97, w: 10, h: 5 });
  gate("gate-whitehouse", "To the White House", "whitehouse", "Senate", mirror({ x: 13, y: 8, w: 10, h: 5 }));
  return {
    sites,
    chambers: {},
    conveyors: {},
    pool: { x: 85, y: 56, w: 6, h: 12 },
    origin: "court",
    enterable: ["court"],
    piles: { court: "argued and awaiting a decision" },
    staged: (itemId) => sittings.get(itemId) ?? null,
    siteOf: (loc) => (loc ? loc.split(":")[0] : null),
    ...streets(sites),
  };
}

export const court: WorldDef = {
  key: "court",
  name: "Supreme Court World",
  periodParam: "term",
  provider,
  layout,
  line: () => provider.line(),
  periodLabel: (entry) => `${termName(entry.congress)}${chiefs.get(entry.congress) ? ` · ${chiefs.get(entry.congress)} Court` : ""}`,
  tabs: { roster: true, rosterLabel: "Justices", rosterItems: "opinions of the Court" },
  overviewBy: "place",
  board: {
    measures: [
      ["introduced", "How many cases it took", 0],
      ["law", "Share where the court below was overturned", 5],
    ],
    across: [
      ["time", "over time"],
      ["congress", "by term"],
      ["area", "by subject"],
    ],
    group: (period) => String(period),
    parties: false,
  },
  stats: {
    periods: "Terms",
    periodLabel: (entry) => termName(entry.congress),
    noun: "cases",
    verb: "taken up",
    whole: "The whole term",
    where: (first, last) => (first.congress === last.congress ? `in the ${termName(first.congress)}` : `from the ${first.congress} term to the ${last.congress} term`),
    reached: "Court below overturned",
    outcomeTitle: "How they came out",
    outcomeNote: "A case counts as overturning the court below when the side that asked for review won: the judgment was reversed or vacated, in whole or in part. A case still pending counts as taken up and not yet as overturned.",
    byPeriod: "By term",
    byParty: "",
    most: "Who wrote the most opinions of the Court",
    areas: "What the cases were about",
    footnote: "Counted by the day each case was decided, or for a pending case the day it was argued or granted. Subjects and outcomes up to the last finished term are the Supreme Court Database’s coding; the term in progress has no subjects yet. Emergency applications are not counted here.",
  },
  doors: [
    { site: "gate", to: "capitol", label: "Back to Capitol Hill →" },
    { site: "gate-whitehouse", to: "whitehouse", label: "Go to the White House →" },
  ],
  itemNotes: (bill) => notes.get(bill.id) ?? [],
  staging: (bill) => (sittings.has(bill.id) ? { place: "court", label: "See it argued in the Courtroom" } : null),
  words: {
    item: "case",
    items: "cases",
    period: (world) => `${termName(world.congress)} of the Supreme Court`,
    stamp: (world, through) => (world.final ? `Last decision ${through}` : `Docket through ${through}`),
    stages: PLACES,
    overview: (world) => {
      const cases = world.bills.filter((bill) => bill.type === "SC");
      const pending = cases.filter((bill) => bill.loc.kind === ("calendar" as never) || bill.loc.kind === ("court" as never)).length;
      const requests = world.bills.length - cases.length;
      return {
        title: world.final ? `What the Court decided in its ${termName(world.congress)}` : "What the Court is hearing",
        lead: world.final
          ? `The Court decided ${cases.length.toLocaleString()} case${cases.length === 1 ? "" : "s"} in the term that opened in October ${world.congress}.${requests ? ` It also ruled on ${requests.toLocaleString()} emergency applications that asked for more than extra time.` : ""} The buildings below the Court hold the cases by how they came out; click the Court to go in.`
          : `The term opened in October ${world.congress}. The Court has agreed to hear ${cases.length.toLocaleString()} case${cases.length === 1 ? "" : "s"} so far, ${pending.toLocaleString()} of them still to be decided${requests ? `, and has had ${requests.toLocaleString()} emergency applications that asked for more than extra time` : ""}. Click the Court to go in.`,
        where: world.final ? "How they came out" : "Where they stand",
      };
    },
    kicker: (site) => (site.style === "gate" ? "Another world" : "Supreme Court"),
    person: "Opinion of the Court by",
    personHeading: (bill) => (bill.type === "APP" ? "Ruling" : "Opinion of the Court by"),
    noPerson: (bill) => unsigned.get(bill.id) ?? "No single author.",
    deadOnly: "",
    noArea: "", // applications, and the cases of a term not yet coded, are left out of the list by subject
    actionHeading: "Where it stands",
    readMore: (bill) => (bill.type === "APP" ? "See its docket at the Court ↗" : /oyez\.org/.test(bill.url) ? "Read about it on Oyez ↗" : "Read more ↗"),
    memberLine: (member) => `Wrote the opinion of the Court in ${member.n_total.toLocaleString()} case${member.n_total === 1 ? "" : "s"} this term.`,
    searchHint: "Case name or docket number",
    replayAll: "▶ Replay the term",
  },
};
