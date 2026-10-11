// A county board or a city council: one body that meets in one room. There is no map; the world
// opens in the chamber, with the members on the dais and the public coming to the microphone, and
// everything else is the side panel.
//
// Which body is in the address (`?world=chamber&place=06073`, a Census code). What it is called and
// where its file is come from public/usa/chambers.json, so a new body is a line there and its data
// (build_chamber_snapshot.py in cat-pol-datasets writes the file). No code.

import { fetchJson, type CongressEntry, type DataProvider } from "../data/load";
import type { CommitteeFile, CommitteeMeeting } from "../data/meetings";
import type { Bill, Member, SearchIndex, World } from "../data/types";
import { makeSite, streets, type Layout, type Site } from "../world/layout";
import type { WorldDef } from "./types";

/** One body in public/usa/chambers.json, under its place's Census code. */
export interface ChamberEntry {
  /** "San Diego County Board of Supervisors", and the body alone: "Board of Supervisors", "the Board". */
  name: string;
  body: string;
  short: string;
  /** Whose it is: "San Diego County". */
  place: string;
  /** The room: "Board Chamber". */
  room: string;
  /** A member's title and what a seat is called: "Supervisor", "District". */
  member: string;
  seat: string;
  /** world/chamber.json.gz, and the body's own site with what to call it. */
  file: string;
  site: string;
  url: string;
  /** Where its meeting times are meant: "America/Los_Angeles". */
  timezone: string;
  /** How far back the record goes, in words: "June 2017". */
  since: string;
  /** Family names of more than one word, by the member's id: "Montgomery Steppe". */
  surnames?: Record<string, string>;
  /** Where it is on the map of the United States, as that page's address has it: "#county=06073". */
  map?: string;
}

/** world/chamber.json.gz. The lists under `items`, `meetings` and `agenda` run in parallel, one entry each. */
interface ChamberFile {
  schema: number;
  generated_at: string;
  data_through: string;
  vote_letters: Record<string, string>;
  members: { id: string; name: string; seat: number | null; role: string; start: string; end: string; serving: boolean; first_vote: string; last_vote: string; votes: number }[];
  kinds: string[];
  statuses: string[];
  bodies: string[];
  subjects: string[];
  actions: string[];
  items: {
    id: string[]; file: string[]; title: string[]; kind: number[]; status: number[]; body: number[]; subject: number[]; filed: string[]; agenda: string[];
    acted: string[]; action: number[]; result: string[]; ayes: number[]; noes: number[]; mover: number[]; seconder: number[]; times: number[]; has_text: number[]; url: string[];
  };
  meetings: { id: string[]; date: string[]; time: string[]; body: number[]; place: string[]; url: string[]; agenda_url: string[]; minutes_url: string[]; items: number[] };
  /** One letter per member in `votes`, in the order of `members`; "-" for someone with no vote on record. */
  agenda: { meeting: number[]; item: number[]; number: string[]; action: number[]; result: string[]; ayes: number[]; noes: number[]; votes: string[] };
}

/** The key of the one room, in the layout and in the meetings file. */
export const ROOM = "chamber";
const SITE = `committee:${ROOM}`;
const FULL_MEETINGS = 40; // the latest meetings are listed with their agendas; older ones are on the wall calendar only

/** The body the address names, or null: `?place=06073`. */
export function placeInAddress(): string | null {
  const place = new URLSearchParams(location.search).get("place");
  return place && /^\d{5,7}$/.test(place) ? place : null;
}

let registry: Promise<Record<string, ChamberEntry>> | undefined;
const loadRegistry = () => (registry ??= fetchJson<Record<string, ChamberEntry>>(`${import.meta.env.BASE_URL}usa/chambers.json`));
/** Where the way out of the chamber on show leads, on the map of the United States. */
export const chamberWayOut = () => entry.map ?? "";

/** The places that have a chamber to open, by Census code: for the map of the United States, which marks them. */
export const loadChambers = () => loadRegistry().catch(() => ({}) as Record<string, ChamberEntry>);

/** The body on show. Everything a visitor reads is worded from it, so it is set before anything is drawn. */
let entry: ChamberEntry = {
  name: "Council Chamber", body: "Council", short: "the council", place: "", room: "Chamber", member: "Member", seat: "District",
  file: "", site: "its own site", url: "", timezone: "America/Los_Angeles", since: "",
};
const files = new Map<string, Promise<{ entry: ChamberEntry; data: ChamberFile }>>();

function load(): Promise<{ entry: ChamberEntry; data: ChamberFile }> {
  const place = placeInAddress() ?? "";
  let file = files.get(place);
  if (!file) {
    file = loadRegistry().then(async (list) => {
      const found = list[place];
      if (!found) throw new Error(`no chamber is listed for place ${place || "(none)"}`);
      const data = await fetchJson<ChamberFile>(found.file);
      if (data.schema !== 1 || !Array.isArray(data.members)) throw new Error("the chamber file is not in the expected format");
      return { entry: found, data };
    });
    file.catch(() => files.delete(place));
    files.set(place, file);
  }
  return file.then((loaded) => {
    entry = loaded.entry;
    chamber.name = loaded.entry.name;
    return loaded;
  });
}

// ── Words ───────────────────────────────────────────────────────────────────

const SMALL = new Set(["of", "the", "and", "in", "for", "to", "on", "a", "an", "as", "at", "by"]);
/** "BOARD OF SUPERVISORS - LAND USE" as "Board of Supervisors: Land Use". */
function nice(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().split(/\s+-\s+/).map((part) => part.split(" ").map((word, index) => (index && SMALL.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1))).join(" ")).join(": ");
}
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
const lastName = (name: string) => entry.surnames?.[name.toLowerCase().replace(/[^a-z0-9]+/g, "-")] ?? name.split(" ").slice(-1)[0];
const tally = (ayes: number, noes: number) => (ayes || noes ? `${ayes}–${noes}` : "");

/** The places an item can be. Only the first is in the room; the rest are how the others came out. */
const PLACES = {
  agenda: "On an agenda, with no action recorded yet",
  passed: "Passed",
  heard: "Heard, with no vote",
  failed: "Failed",
  withdrawn: "Withdrawn",
  filed: "Filed, and not yet on an agenda",
} as const;
type Place = keyof typeof PLACES;

/** A meeting's start as an instant: its date and "9:00 AM" are in the body's own time zone. */
function instant(date: string, time: string, zone: string): string {
  const clock = /^(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(time.trim());
  const hour = clock ? (Number(clock[1]) % 12) + (/pm/i.test(clock[3] ?? "") ? 12 : 0) : 9;
  const minute = clock ? Number(clock[2]) : 0;
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const asUtc = Date.UTC(year, month - 1, dayOfMonth, hour, minute);
  try {
    // What the zone's clocks read at that instant, read back as if it were UTC, gives the zone's offset.
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" }).formatToParts(new Date(asUtc));
    const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
    const shown = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
    return new Date(asUtc - (shown - asUtc)).toISOString();
  } catch {
    return new Date(asUtc).toISOString();
  }
}

/** What the card of an item says beyond the common fields. */
const notes = new Map<string, { heading: string; rows: { text: string; target?: string }[] }[]>();
/** The line under each member's name on their card. */
const lines = new Map<string, string>();
const itemId = (matter: string) => `item-${matter}`;

/** How a recorded vote went, as "Aye: Anderson, Desmond" lines, from one letter per member. */
function voteLines(data: ChamberFile, letters: string): string[] {
  const groups = new Map<string, string[]>();
  [...letters].forEach((letter, index) => {
    if (letter === "-" || !data.members[index]) return;
    const kind = data.vote_letters[letter] ?? "Other";
    groups.set(kind, [...(groups.get(kind) ?? []), lastName(data.members[index].name)]);
  });
  return [...groups.entries()].map(([kind, names]) => `${kind}: ${names.join(", ")}`);
}

const provider: DataProvider = {
  async world() {
    const { data } = await load();
    const { items, agenda, meetings } = data;
    // Each item's times before the body, oldest first, as places in the agenda lists.
    const before = new Map<number, number[]>();
    agenda.item.forEach((item, k) => item >= 0 && before.set(item, [...(before.get(item) ?? []), k]));
    for (const list of before.values()) list.sort((a, b) => meetings.date[agenda.meeting[a]].localeCompare(meetings.date[agenda.meeting[b]]));
    const soon = new Date(Date.parse(`${data.data_through}T12:00:00Z`) - 45 * 86400000).toISOString().slice(0, 10);

    const moved = new Map<number, number>();
    notes.clear();
    const bills: Bill[] = items.id.map((matter, k) => {
      const action = data.actions[items.action[k]] ?? "";
      const status = data.statuses[items.status[k]] ?? "";
      const times = before.get(k) ?? [];
      const split = tally(items.ayes[k], items.noes[k]);
      const place: Place = items.result[k] === "P" ? "passed"
        : items.result[k] === "F" ? "failed"
          : /withdrawn/i.test(action) || status === "Withdrawn" ? "withdrawn"
            : items.acted[k] && action ? "heard"
              : !times.length && !items.agenda[k] ? "filed"
                : (items.agenda[k] || "") >= soon ? "agenda" : "heard";
      const mover = items.mover[k] >= 0 ? data.members[items.mover[k]] : null;
      const seconder = items.seconder[k] >= 0 ? data.members[items.seconder[k]] : null;
      if (mover) moved.set(items.mover[k], (moved.get(items.mover[k]) ?? 0) + 1);
      const date = items.acted[k] || items.agenda[k] || items.filed[k];
      const done = action ? `${capital(action)}${split ? `, ${split}` : ""}` : "";
      const id = itemId(matter);
      const lastVote = [...times].reverse().find((entryAt) => agenda.votes[entryAt]);
      notes.set(id, [
        { heading: split ? `The vote: ${split}` : "The vote", rows: lastVote === undefined ? [] : voteLines(data, agenda.votes[lastVote]).map((text) => ({ text })) },
        {
          heading: `Before ${entry.short}`,
          rows: times.map((at) => {
            const what = data.actions[agenda.action[at]] ?? "";
            const count = tally(agenda.ayes[at], agenda.noes[at]);
            return { text: `${day(meetings.date[agenda.meeting[at]])} · ${nice(data.bodies[meetings.body[agenda.meeting[at]]] ?? "")}, item ${agenda.number[at] || "—"}${what ? ` · ${what}${count ? ` (${count})` : ""}` : " · no action recorded"}` };
          }),
        },
        {
          heading: "The record",
          rows: [
            `Filed${items.filed[k] ? ` ${day(items.filed[k])}` : ""} as ${data.kinds[items.kind[k]] === "other" ? "an item" : `a${data.kinds[items.kind[k]] === "ordinance" ? "n" : ""} ${data.kinds[items.kind[k]]}`}, file ${items.file[k]}.`,
            data.bodies[items.body[k]] ? `Before: ${nice(data.bodies[items.body[k]])}.` : "",
            status ? `Marked “${status}” on ${entry.site}.` : "",
          ].filter(Boolean).map((text) => ({ text })),
        },
      ].filter((group) => group.rows.length));
      return {
        id,
        type: "ITEM",
        number: items.file[k],
        title: items.title[k],
        sponsor: mover?.id ?? "",
        cosponsors: 0,
        policy_area: data.subjects[items.subject[k]] ?? "",
        status: done || status || "Filed",
        loc: { kind: place as never, chamber: "", committee: "" },
        last_action: {
          date,
          text: done
            ? `${done}${mover ? `, on the motion of ${entry.member} ${lastName(mover.name)}${seconder ? `, seconded by ${entry.member} ${lastName(seconder.name)}` : ""}` : ""}.`
            : items.agenda[k] ? `On the agenda of ${day(items.agenda[k])}. No action is recorded.` : "Filed. It has not been on an agenda.",
        },
        introduced: items.filed[k] || date,
        summary: "",
        url: items.url[k],
      };
    });

    const members: Member[] = data.members.map((person, index) => {
      const seat = person.seat === null ? "" : `${entry.seat} ${person.seat}`;
      const years = `${person.start.slice(0, 4)}${person.serving ? " to now" : `–${person.end.slice(0, 4)}`}`;
      const n = moved.get(index) ?? 0;
      lines.set(person.id, [
        `${entry.member}${seat ? `, ${seat}` : ""}${person.role ? ` · ${person.role}` : ""}.`,
        person.serving ? `On ${entry.short} since ${day(person.start)}.` : `On ${entry.short} ${years}.`,
        person.votes ? `${person.votes.toLocaleString()} votes on record, ${day(person.first_vote)} to ${day(person.last_vote)}.` : "No votes on record here.",
        n ? `Moved ${n.toLocaleString()} item${n === 1 ? "" : "s"}.` : "",
      ].filter(Boolean).join(" "));
      return {
        id: person.id,
        name: person.name,
        party: "",
        state: seat,
        district: person.seat,
        chamber: "",
        n_world: 0,
        n_total: n,
        role: person.serving ? [entry.member, person.role].filter(Boolean).join(" · ") : `Former ${entry.member.toLowerCase()}, ${years}`,
        group: person.serving ? entry.member : `Former ${entry.member.toLowerCase()}`,
        ...(person.serving ? {} : { left: true }),
      };
    });
    const count = (key: (bill: Bill) => string) => bills.reduce<Record<string, number>>((all, bill) => ((all[key(bill)] = (all[key(bill)] ?? 0) + 1), all), {});
    return {
      schema: 1,
      generated_at: data.generated_at,
      data_through: data.data_through,
      congress: 0,
      window: { world_since: items.filed[items.filed.length - 1] ?? "", events_since: data.data_through },
      counts: { total: bills.length, world: bills.length, events: 0, guessed_locations: 0, by_status: count((bill) => bill.status), by_kind: count((bill) => bill.loc.kind) },
      members,
      committees: [],
      bills,
      events: [],
    } satisfies World;
  },

  async search() {
    const { data } = await load();
    const { items } = data;
    const statuses = [...data.actions.map((action) => capital(action) || "No action recorded")];
    return {
      schema: 1,
      data_through: data.data_through,
      sponsors: data.members.map((person) => person.id),
      sponsor_names: data.members.map((person) => person.name),
      statuses,
      policy_areas: data.subjects,
      id: items.id.map(itemId),
      title: items.title.map((title, k) => `${title} (File ${items.file[k]})`),
      sponsor: items.mover,
      status: items.action,
      policy_area: items.subject,
      date: items.acted.map((acted, k) => acted || items.agenda[k] || items.filed[k]),
      introduced: items.filed.map((filed, k) => filed || items.agenda[k] || items.acted[k]),
      party: "?".repeat(items.id.length),
      stage: items.result.map((result) => (result === "P" ? "5" : "0")).join(""),
      fate: ".".repeat(items.id.length),
    } satisfies SearchIndex;
  },

  async line(): Promise<CongressEntry[]> {
    const { data } = await load();
    const first = Number((data.items.filed.filter(Boolean).sort()[0] ?? data.data_through).slice(0, 4));
    return [{ congress: 0, years: [first, null], live: true }];
  },

  /** The meetings, in the shape a committee's have, so the calendar and the room read them as they are. */
  async committees(): Promise<CommitteeFile> {
    const { data } = await load();
    const { meetings, agenda, items } = data;
    const onAgenda = new Map<number, number[]>();
    agenda.meeting.forEach((meeting, k) => onAgenda.set(meeting, [...(onAgenda.get(meeting) ?? []), k]));
    const now = Date.now();
    const all = meetings.id.map((id, m): CommitteeMeeting => {
      const rows = onAgenda.get(m) ?? [];
      const voted = rows.filter((k) => agenda.result[k]);
      const split = voted.filter((k) => agenda.noes[k] > 0 || agenda.result[k] === "F");
      const outcomes = voted.length
        ? [
            `${voted.filter((k) => agenda.result[k] === "P").length} of ${rows.length} items passed, ${voted.length - split.length} of them with no one voting no.`,
            ...split.map((k) => {
              const against = voteLines(data, agenda.votes[k]).find((line) => line.startsWith("No:"));
              return `File ${items.file[agenda.item[k]] ?? "—"}: ${data.actions[agenda.action[k]] || (agenda.result[k] === "P" ? "passed" : "failed")}, ${tally(agenda.ayes[k], agenda.noes[k])}${against ? ` (${against})` : ""}`;
            }),
          ]
        : [];
      return {
        id,
        date: instant(meetings.date[m], meetings.time[m], entry.timezone),
        type: "Meeting",
        title: nice(data.bodies[meetings.body[m]] ?? entry.body),
        place: meetings.place[m] || undefined,
        bills: rows.filter((k) => agenda.item[k] >= 0).map((k) => itemId(items.id[agenda.item[k]])),
        n_bills: meetings.items[m] || rows.length,
        n_witnesses: 0,
        outcomes,
        sub: "",
        url: meetings.url[m] || entry.url,
        brief: m >= FULL_MEETINGS,
      };
    });
    const coming = all.filter((meeting) => Date.parse(meeting.date) > now).reverse();
    const past = all.filter((meeting) => Date.parse(meeting.date) <= now);
    const serving = data.members.filter((person) => person.serving);
    return {
      schema: 1,
      generated_at: data.generated_at,
      committees: {
        [ROOM]: {
          name: entry.body,
          chamber: "",
          members: serving.map((person, index) => ({ id: person.id, side: "majority", rank: person.seat ?? index + 1, title: person.role })),
          subcommittees: {},
          n_meetings: all.length,
          meetings: [...coming.map((meeting) => ({ ...meeting, brief: false })), ...past],
        },
      },
    };
  },
};

/** No map is shown, but the scene keeps every item at a site: the room for those on an agenda, and one for each way the rest came out. */
function layout(): Layout {
  const sites = new Map<string, Site>();
  sites.set(SITE, makeSite(SITE, "committee", entry.room, entry.room, "Center", { x: 78, y: 40, w: 20, h: 10 }));
  (Object.keys(PLACES) as Place[]).filter((place) => place !== "agenda").forEach((place, index) =>
    sites.set(place, makeSite(place, "archive", PLACES[place], PLACES[place], "Center", { x: 20 + 28 * index, y: 60, w: 18, h: 8 })));
  return {
    sites,
    chambers: {},
    conveyors: {},
    origin: SITE,
    council: ROOM,
    piles: { [ROOM]: "on the agenda" },
    siteOf: (loc) => {
      const place = loc ? loc.split(":")[0] : null;
      return place === "agenda" ? SITE : place;
    },
    ...streets(sites),
  };
}

export const chamber: WorldDef = {
  key: "chamber",
  name: "Council Chamber",
  periodParam: "session",
  provider,
  layout,
  line: () => provider.line(),
  periodLabel: () => "",
  tabs: { roster: true, rosterLabel: "Members", rosterItems: "items moved", rosterNote: "Everyone who has sat on the body since its record here begins. Pick anyone now serving to find them on the dais." },
  overviewBy: "place",
  room: {
    code: ROOM,
    hint: () => `Click anyone on the dais, the papers on the clerk’s table, or the calendar on the wall. The people coming to the microphone are animation: who spoke at a meeting is not in the record.`,
    here: () => `Before ${entry.short} now`,
    official: () => entry.site,
    noMeetings: () => `Nothing is scheduled on ${entry.site}.`,
    meetingsNote: (total, listed) => `${total.toLocaleString()} meetings since ${entry.since || "the record began"}; the latest ${listed} are here, and the rest are on the calendar on the wall. Re-staging seats the members now serving.`,
  },
  board: {
    measures: [
      ["introduced", "How many items were filed", 0],
      ["law", "Share that passed", 5],
    ],
    across: [
      ["time", "over time"],
      ["area", "by subject"],
    ],
    group: (period) => String(period),
    parties: false,
  },
  stats: {
    periods: "",
    periodLabel: () => entry.body,
    noun: "items",
    verb: "filed",
    whole: "The whole record",
    where: () => `before the ${entry.body}`,
    reached: "Passed",
    outcomeTitle: "How they came out",
    outcomeNote: "An item counts as passed when the record of its last time on an agenda says so. Most pass together on the consent calendar. Reports, public comment and closed-session items are filed like the rest and have no vote.",
    byPeriod: "",
    byParty: "",
    most: "By the member who moved them",
    areas: "What the items were about",
    footnote: "Counted by the day each item was filed. Local offices in California are nonpartisan, so nothing here is counted by party.",
  },
  doors: [{ site: "gate-usa", to: "usa", label: "← Back out to the map" }],
  itemNotes: (bill) => notes.get(bill.id) ?? [],
  words: {
    item: "item",
    items: "items",
    period: () => entry.name,
    stamp: (_world, through) => `${entry.place ? `${entry.place} · ` : ""}Meetings through ${through}`,
    stages: PLACES,
    overview: (world) => {
      const waiting = world.counts.by_kind.agenda ?? 0;
      const serving = world.members.filter((member) => !member.left).length;
      return {
        title: entry.name,
        lead: `The ${serving} ${entry.member.toLowerCase()}s of ${entry.place || "this place"} meet in this room. ${world.bills.length.toLocaleString()} items have come before them since ${entry.since || "the record began"}; ${waiting ? `${waiting.toLocaleString()} are on an agenda with no action recorded yet` : "none is waiting on an agenda right now"}.`,
        where: "Where the items stand",
      };
    },
    kicker: () => entry.place || "Chamber",
    person: "Moved by",
    noPerson: (bill) => (bill.loc.kind === ("passed" as never) || bill.loc.kind === ("failed" as never) ? "The record names no mover." : "No motion has been made on it."),
    deadOnly: "",
    noArea: "",
    actionHeading: "Where it stands",
    readMore: () => `See it on ${entry.site} ↗`,
    memberLine: (member) => lines.get(member.id) ?? member.role ?? "",
    searchHint: "Words in the title, or a file number",
  },
};
