// The White House: presidents and their executive orders. The data is one file
// beside the executive-orders dataset (build_whitehouse_snapshot.py); a period
// here is a presidency rather than a Congress.

import { fetchJson, type CongressEntry, type DataProvider } from "../data/load";
import type { Bill, Member, SearchIndex, World } from "../data/types";
import { MAP_W, makeSite, streets, type Layout, type Rect, type Site } from "../world/layout";
import type { WorldDef } from "./types";

const FOLDER = "https://huggingface.co/datasets/chrissoria/executive-orders/resolve/main/world/";
const FILE = `${FOLDER}whitehouse.json.gz`;
const ROSTER = "https://huggingface.co/datasets/chrissoria/executive-branch-roster/resolve/main/world/roster.json";

/** world/roster.json: who serves in the sitting administration (build_executive_roster.py). */
interface RosterFile {
  term_start: string;
  people: { name: string; position: string; group: string; department: string; status: string; since: string; vote: string; source: string; url: string }[];
}

let rosterFile: Promise<RosterFile | null> | undefined;
/** The roster, or null when it cannot be read: the map then has the President alone. */
const loadRoster = () => (rosterFile ??= fetchJson<RosterFile>(ROSTER).catch(() => null));

/** Colours that suggest a recent president without drawing a likeness: hair, suit and tie, and nothing exaggerated. */
const LOOKS: Record<string, Member["look"]> = {
  "Donald J. Trump": { skin: "#f0c29a", hair: "#e9c46a", suit: "#27324f", tie: "#d8433b", style: 2 },
  "Joseph R. Biden, Jr.": { skin: "#f2cfb0", hair: "#ececf0", suit: "#27324f", tie: "#3a6fd8", style: 2 },
  "Barack Obama": { skin: "#8f5c3c", hair: "#4a4a50", suit: "#2b2b33", tie: "#3a6fd8", style: 4 },
  "George W. Bush": { skin: "#eebd97", hair: "#b9b9c0", suit: "#27324f", tie: "#d8433b", style: 2 },
  "William J. Clinton": { skin: "#f2cfb0", hair: "#dcdce4", suit: "#27324f", tie: "#d8433b", style: 2 },
};

interface OrdersFile {
  schema: number;
  data_through: string;
  presidents: { name: string; party: string; first: string; last: string; n: number }[];
  departments: { code: string; name: string; named_in: number; lead_of: number }[];
  id: string[];
  number: string[];
  date: string[];
  title: string[];
  president: number[];
  lead: number[];
  revokes: string[][];
  amends: string[][];
  revoked_by: string[][];
  excerpt: string[];
  url: string[];
  /** Orders to each world/text/<n>.json.gz, which hold the text at greater length. Absent in an older file. */
  text_per_file?: number;
}

const textFiles = new Map<number, Promise<string[]>>();

let file: Promise<OrdersFile> | undefined;
const load = () => (file ??= fetchJson<OrdersFile>(FILE));

/** The party's letter for the pin: R and D have their colours, every other party shares the third. */
const pinOf = (party: string) => (party === "Republican" ? "R" : party === "Democratic" ? "D" : "I");
const presidentId = (index: number) => `president-${index}`;
/** An order's id in the app: its presidency, so a link can open the right one, then the order. */
const orderId = (data: OrdersFile, k: number) => `${data.president[k]}-eo-${data.id[k]}`;
/** "Donald J. Trump (2nd Term)" without the note about terms. */
const plainName = (name: string) => name.replace(/\s*\(.*\)$/, "");

const provider: DataProvider = {
  async text(id) {
    const data = await load();
    const per = data.text_per_file;
    const k = data.id.findIndex((_, index) => orderId(data, index) === id);
    if (!per || k < 0) return null;
    const n = Math.floor(k / per);
    let texts = textFiles.get(n);
    if (!texts) textFiles.set(n, (texts = fetchJson<string[]>(`${FOLDER}text/${n}.json.gz`)));
    return (await texts)[k % per] ?? null;
  },
  async world(period) {
    const data = await load();
    const last = data.presidents.length - 1;
    const p = period === null || period > last || period < 0 ? last : period;
    const president = data.presidents[p];
    const byNumber = new Map<string, number>();
    data.id.forEach((id, k) => byNumber.set(id, k));
    const ids = (numbers: string[]) => numbers.filter((n) => byNumber.has(n)).map((n) => orderId(data, byNumber.get(n)!));

    const bills: Bill[] = [];
    for (let k = 0; k < data.id.length; k++) {
      if (data.president[k] !== p) continue;
      const department = data.lead[k] >= 0 ? data.departments[data.lead[k]] : null;
      const revoked = data.revoked_by[k].length > 0;
      bills.push({
        id: orderId(data, k),
        type: "EO",
        number: data.number[k] || data.id[k],
        title: data.title[k],
        sponsor: presidentId(p),
        cosponsors: 0,
        policy_area: department?.name ?? "",
        status: revoked ? "Revoked" : "Signed",
        loc: { kind: "whitehouse" as never, chamber: "", committee: "" },
        last_action: { date: data.date[k], text: `Signed by ${plainName(president.name)}.` },
        introduced: data.date[k],
        summary: data.excerpt[k],
        url: data.url[k],
        ...(revoked ? { fate: "r" } : {}),
        links: { revokes: ids(data.revokes[k]), amends: ids(data.amends[k]), revoked_by: ids(data.revoked_by[k]) },
      });
    }
    bills.sort((a, b) => b.introduced.localeCompare(a.introduced));
    const through = p === last ? data.data_through : president.last;
    const since = new Date(`${through}T12:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 7);
    const eventsSince = since.toISOString().slice(0, 10);
    const events = bills
      .filter((bill) => bill.introduced >= eventsSince && !bill.fate)
      .reverse()
      .map((bill, seq) => ({ bill: bill.id, date: bill.introduced, seq, from: null, to: "whitehouse", text: bill.title.slice(0, 140), actor: null, actor_role: null }));
    const member: Member = { id: presidentId(p), name: plainName(president.name), party: pinOf(president.party), state: "", district: null, chamber: "", n_world: bills.length, n_total: bills.length, role: `President · ${president.party === "None" ? "no party" : president.party}`, group: "President", look: LOOKS[plainName(president.name)] };
    // The cabinet and the senior staff are known only for the administration now in office.
    const roster = p === last ? await loadRoster() : null;
    const staffed = new Map<string, Member>();
    for (const person of roster?.people ?? []) {
      if (person.status !== "serving") continue;
      const directed = person.department ? bills.filter((bill) => bill.policy_area && data.departments.find((d) => d.code === person.department)?.name === bill.policy_area).length : 0;
      const known = staffed.get(person.name);
      if (known) known.role = `${known.role} · ${person.position}`; // one figure for someone with two posts
      else staffed.set(person.name, { id: `staff-${person.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: person.name, party: "", state: "", district: null, chamber: "", n_world: directed, n_total: directed, role: person.position, group: person.group });
    }
    const count = (key: (bill: Bill) => string) => bills.reduce<Record<string, number>>((all, bill) => ({ ...all, [key(bill)]: (all[key(bill)] ?? 0) + 1 }), {});
    const revokedCount = bills.filter((bill) => bill.fate).length;
    return {
      schema: 1,
      generated_at: "",
      data_through: through,
      congress: p,
      window: { world_since: president.first, events_since: eventsSince },
      counts: { total: bills.length, world: bills.length, events: events.length, guessed_locations: 0, by_status: count((b) => b.status), by_kind: count((b) => b.loc.kind), dead: (revokedCount ? { r: revokedCount } : {}) as Record<string, number> },
      members: [member, ...staffed.values()],
      committees: data.departments.map((d) => ({ code: d.code, name: d.name, chamber: "", n_bills: bills.filter((b) => b.loc.committee === d.code).length })),
      bills,
      events,
      final: p !== last,
      years: [Number(president.first.slice(0, 4)), Number(president.last.slice(0, 4))],
      summary_source: "excerpt",
    } satisfies World;
  },

  /** The orders of one presidency, as a search index; the search box asks for the others one by one. */
  async search(period) {
    const data = await load();
    const last = data.presidents.length - 1;
    const p = period === null || period > last || period < 0 ? last : period;
    const rows = data.president.flatMap((president, k) => (president === p ? [k] : []));
    return {
      schema: 1,
      data_through: data.data_through,
      sponsors: data.presidents.map((_, index) => presidentId(index)),
      sponsor_names: data.presidents.map((president) => plainName(president.name)),
      statuses: ["Signed", "Revoked"],
      policy_areas: data.departments.map((d) => d.name),
      id: rows.map((k) => orderId(data, k)),
      title: rows.map((k) => data.title[k]),
      sponsor: rows.map(() => p),
      status: rows.map((k) => (data.revoked_by[k].length ? 1 : 0)),
      policy_area: rows.map((k) => data.lead[k]),
      date: rows.map((k) => data.date[k]),
      introduced: rows.map((k) => data.date[k]),
      party: pinOf(data.presidents[p].party).repeat(rows.length),
      stage: rows.map((k) => (data.revoked_by[k].length ? "5" : "0")).join(""),
      fate: rows.map((k) => (data.revoked_by[k].length ? "r" : ".")).join(""),
    } satisfies SearchIndex;
  },

  async line() {
    const data = await load();
    const last = data.presidents.length - 1;
    return data.presidents
      .map((president, p): CongressEntry => ({ congress: p, years: [Number(president.first.slice(0, 4)), p === last ? null : Number(president.last.slice(0, 4))], live: p === last }))
      .reverse();
  },
};

/** The names in the picker; filled in when the file has loaded. */
let names: string[] = [];
void load().then((data) => (names = data.presidents.map((president) => president.name)), () => undefined);

// The agencies around the White House. They are placeholders for now, drawn as building sites.
const AGENCIES = ["State", "Treasury", "Defense", "Justice", "Interior", "Agriculture", "Commerce", "Labor", "HHS", "HUD", "Transportation", "Energy", "Education", "Veterans Affairs", "Homeland Security", "CIA", "EPA", "NASA", "OMB", "SBA"];

/** The White House at the head of a lawn, with everything inside it; the agencies around it are still going up. */
function layout(): Layout {
  const sites = new Map<string, Site>();
  const add = (site: Site) => sites.set(site.key, site);
  const mirror = (rect: Rect): Rect => ({ ...rect, x: MAP_W - rect.x - rect.w });
  add(makeSite("whitehouse", "whitehouse", "White House", "White House", "Center", { x: 72, y: 3, w: 32, h: 14 }, { x: 80, w: 16 }));
  AGENCIES.forEach((name, index) => {
    const side = index % 2 === 0;
    const row = Math.floor(index / 2);
    const rect: Rect = { x: 56 - 24 * (row % 2), y: 24 + 7 * row, w: 14, h: 5 };
    add(makeSite(`agency:${index}`, "construction", `${name} (under construction)`, name, side ? "House" : "Senate", side ? rect : mirror(rect)));
  });
  add(makeSite("library", "library", "Library", "Library", "House", { x: 10, y: 5, w: 16, h: 8 }));
  add(makeSite("revoked", "memorial", "Revoked Orders", "Revoked Orders", "Senate", mirror({ x: 10, y: 5, w: 16, h: 8 })));
  const gate = makeSite("gate", "gate", "To Capitol Hill", "To Capitol Hill", "Center", { x: 83, y: 97, w: 10, h: 5 });
  gate.travel = "capitol";
  add(gate);
  const toCourt = makeSite("gate-court", "gate", "To the Supreme Court", "To the Supreme Court", "Senate", { x: 100, y: 97, w: 10, h: 5 });
  toCourt.travel = "court";
  add(toCourt);
  return {
    sites,
    chambers: {},
    conveyors: {},
    pool: { x: 85, y: 34, w: 6, h: 10 },
    origin: "whitehouse",
    enterable: ["whitehouse"],
    piles: { whitehouse: "on the Resolute desk" },
    graveyard: { fates: ["r"], site: "revoked" },
    siteOf: (loc) => (loc ? "whitehouse" : null),
    ...streets(sites),
  };
}

export const whitehouse: WorldDef = {
  key: "whitehouse",
  name: "White House World",
  periodParam: "term",
  provider,
  layout,
  line: () => provider.line(),
  periodLabel: (entry) => `${names[entry.congress] ?? "President"} · ${entry.years[0]}–${entry.years[1] ?? "now"}`,
  tabs: { roster: true, rosterLabel: "Cabinet" },
  board: {
    measures: [
      ["introduced", "How many were signed", 0],
      ["law", "Share later revoked", 5],
    ],
    across: [
      ["party", "by the president’s party"],
      ["time", "over time"],
      ["congress", "by president"],
      ["area", "by department"],
    ],
    group: (period) => (names[period] ?? "").replace(/\s*\(.*\)$/, "").replace(/,? Jr\.$/, "").split(" ").slice(-1)[0] + (/2nd Term/.test(names[period] ?? "") ? " II" : ""),
  },
  stats: {
    periods: "Presidents",
    periodLabel: (entry) => `${names[entry.congress] ?? "President"} · ${entry.years[0]}–${entry.years[1] ?? "now"}`,
    noun: "executive orders",
    verb: "signed",
    whole: "The whole presidency",
    where: (first, last) =>
      first.congress === last.congress
        ? `by ${plainName(names[first.congress] ?? "the President")}`
        : `from ${plainName(names[first.congress] ?? "")} to ${plainName(names[last.congress] ?? "")} (${first.years[0]}–${last.years[1] ?? "now"})`,
    reached: "Later revoked",
    outcomeTitle: "What became of them",
    outcomeNote: "An order counts as revoked when a later order says it revokes, rescinds or supersedes it, in whole or in part. That is read from the later order’s wording, so some are missed; recent orders have had less time to be revoked.",
    byPeriod: "By president",
    byParty: "By the president’s party",
    most: "Who signed the most",
    areas: "Departments directed most",
    footnote: "Counted by the date each order was signed. A department is counted when an order names it at least twice and more than any other.",
  },
  doors: [
    { site: "gate", to: "capitol", label: "Back to Capitol Hill →" },
    { site: "gate-court", to: "court", label: "Go to the Supreme Court →" },
  ],
  itemNotes(bill) {
    const links = bill.links ?? {};
    const rows = (ids: string[] = []) => ids.map((id) => ({ text: `Executive Order ${id.split("-").slice(2).join("-")}`, target: id }));
    return [
      { heading: "Revoked by", rows: rows(links.revoked_by) },
      { heading: "It revokes", rows: rows(links.revokes) },
      { heading: "It amends", rows: rows(links.amends) },
    ].filter((group) => group.rows.length);
  },
  words: {
    item: "order",
    items: "orders",
    period: (world) => `presidency of ${world.members[0]?.name ?? "the President"}${world.years ? ` (${world.years[0]}–${world.final ? world.years[1] : "now"})` : ""}`,
    stamp: (world, through) => (world.final ? `Last order signed ${through}` : `Orders through ${through}`),
    stages: { whitehouse: "At the White House" },
    overview: (world) => ({
      title: world.final ? `What ${world.members[0]?.name} ordered` : "What the President has ordered",
      lead: `${world.members[0]?.name ?? "The President"} ${world.final ? "signed" : "has signed"} ${world.counts.total.toLocaleString()} executive order${world.counts.total === 1 ? "" : "s"}${world.years ? ` ${world.final ? `from ${world.years[0]} to ${world.years[1]}` : `since ${world.years[0]}`}` : ""}. They are inside the White House: click it to go in. The agencies around it are still being built.`,
      where: "Who they direct",
    }),
    kicker: (site) => (site.style === "gate" ? "Another world" : "White House grounds"),
    person: "Signed by",
    deadOnly: "Revoked orders only",
    fates: { r: { name: "Revoked by a later order", how: "A later order says it revokes, rescinds or supersedes these, in whole or in part. This is read from the wording of the later order, so some revocations are missed." } },
    searchHint: "Order number or title words",
  },
};
