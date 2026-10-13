// A world is one map of one kind of policy: Congress and its bills, the White
// House and its executive orders, and whatever comes next. Each is described by
// a definition like the one below, and everything else (the scene, the panel,
// search, the whiteboard, travel between worlds) is shared.
//
// To add a world:
//   1. write a data file for it (see build_whitehouse_snapshot.py for the shape);
//   2. write a provider that turns that file into the common `World` and
//      `SearchIndex` shapes, where an item (a bill, an order) has a place, a
//      date, a person behind it and, when it has failed, a fate;
//   3. lay out its buildings with `makeSite` and `streets`;
//   4. give it its words;
//   5. add it to the list in ./index.ts.

import type { CongressEntry, DataProvider, Source } from "../data/load";
import type { Bill, Member, World } from "../data/types";
import type { Note } from "../ui/explain";
import type { StatsNames, StatsWords } from "../ui/stats";
import type { BoardConfig } from "../ui/whiteboard";
import type { Layout, Site } from "../world/layout";

export type WorldKey = "capitol" | "whitehouse" | "court" | "california" | "chamber";
/** Somewhere a door can lead: a world, the map of the United States (../usa), which is not one, or the chamber of one place's board or council. */
export type Destination = WorldKey | "usa" | `chamber:${string}`;

/** The words of a world that is one room: a county board or a city council (./chamber.ts). */
export interface RoomWords {
  /** The room's key, in the layout and in the meetings file. */
  code: string;
  /** What can be clicked, in place of the map's hint. */
  hint(): string;
  /** The heading over the items in the room. */
  here(): string;
  /** The body's own site, as the place to find more. */
  official(): string;
  noMeetings(): string;
  meetingsNote(total: number, listed: number): string;
}

export interface Words {
  /** One item and several: "bill", "bills". */
  item: string;
  items: string;
  /** The period on show: "118th Congress (2023–2025)". */
  period(world: World): string;
  /** The line under the title: "Data through Oct 9, 2026". */
  stamp(world: World, through: string): string;
  /** Names of the places an item can be, by the `kind` of its location. */
  stages: Record<string, string>;
  /** The heading and first lines of the overview. */
  overview(world: World): { title: string; lead: string; where: string };
  /** The small heading over a building's name. */
  kicker(site: Site): string;
  /** "Sponsor", "Signed by". */
  person: string;
  /** The same heading where it depends on the item. */
  personHeading?(bill: Bill): string;
  /** What a dead item is called in the filter: "Dead bills only". Empty where nothing here dies. */
  deadOnly: string;
  /** What to say in the person's place for an item with nobody behind it: an unsigned opinion, say. */
  noPerson?(bill: Bill): string;
  /** The name for items that belong to no area, where "Several, or none" would mislead. */
  noArea?: string;
  /** The heading over an item's latest step, and the words on the link to its source. */
  actionHeading?: string;
  readMore?(bill: Bill): string;
  /** The line under a person's name on their card. */
  memberLine?(member: Member): string;
  /** Names for the fates this world's items can meet, added to the shared list. */
  fates?: Record<string, { name: string; how: string }>;
  searchHint: string;
  /** The words on the button that replays the whole period, in a world that can. */
  replayAll?: string;
}

/**
 * What a legislature calls itself and its parts. Congress and a state's legislature are the same kind
 * of world: two houses, committees, a floor, an executive who signs. Only the names differ, and they
 * are here. To add a state: write its data files in the shapes Congress's have (see
 * build_california_snapshot.py), copy ./california.ts, and name the world in ../usa/states.ts.
 *
 * In the data and the code the two houses keep the names of the wings they fill, "House" (the west
 * wing: the lower house) and "Senate". What a visitor reads comes from `chambers`.
 */
export interface Legislature {
  chambers: { House: string; Senate: string };
  /** "Congress", "the Legislature". */
  body: string;
  /** One two-year period and several: "Congress" and "Congresses", "session" and "sessions". */
  period: string;
  periods: string;
  /** A period's name in a sentence: "118th Congress", "2023–2024 session". */
  periodName(entry: { congress: number }): string;
  /** A member's title: "Representative", "Assembly Member". */
  title(member: Member): string;
  /** Those who add their names to a bill: "cosponsor", "coauthor". */
  cosponsor: string;
  /** The official site, and a measure's page on it from the measure's id. */
  site: string;
  url?(id: string): string;
  /** Whose words a bill's summary is, when it is not one of Congress's two kinds. */
  summaryNote?: string;
  /** False where meetings are not in the data: a committee's panel then lists its members only. */
  meetings: boolean;
  /** What to say of where a committee's list of members comes from, when that needs saying. */
  rosterNote?: string;
  /** What each building does, where it differs from Congress's. */
  explain?(site: Site): Note | undefined;
  /** The About box, where it differs from Capitol World's. */
  about?(world: World, final: boolean): { heading?: string; text: string; note?: boolean }[];
}

export interface WorldDef {
  key: WorldKey;
  name: string;
  /** What the page says while the world's data is on its way: "Loading the White House…". */
  loading: string;
  /** Set for a legislature: Congress, or a state's. */
  legislature?: Legislature;
  /** Where a legislature's files are, when they are not Congress's. */
  source?: Source;
  /** The address parameter that picks a period: ?congress=118, ?term=39. */
  periodParam: string;
  /** Where the data comes from. Null for the Capitol, whose loaders are the default. */
  provider: DataProvider | null;
  layout(world: World): Layout;
  /** The periods that can be opened, the current one first. */
  line(): Promise<CongressEntry[]>;
  /** A period's name in the picker. */
  periodLabel(entry: CongressEntry): string;
  words: Words;
  /** Set for a world that is one room and no map: it opens inside, and there is no way out to a map of its own. */
  room?: RoomWords;
  /** The About box of a world that is not a legislature, where Capitol World's would be wrong. */
  about?(world: World): { heading?: string; text: string; note?: boolean }[];
  /** Which tabs the panel shows. */
  tabs: { roster: boolean; rosterLabel?: string; rosterItems?: string; rosterNote?: string; seatWord?: string };
  /** List the overview by where the items are (the Capitol's way) rather than by their area. */
  overviewBy?: "place";
  /** Whether the overview lists items by their area (a department, say) rather than by where they are. */
  /** What the whiteboard can plot, and how the Stats tab words its counts, when they differ from the Capitol's. */
  board?: BoardConfig;
  /** The place the world is about, as the us-places dataset knows it: "00" for the country, "06" for California, a county's or a city's Census code. */
  place?(): string | null;
  stats?: StatsWords;
  /** The names the Stats tab uses for a legislature that is not Congress. */
  statsNames?: StatsNames;
  /** A scene inside a building that an item's card can open: an argument re-staged in the Courtroom. */
  staging?(bill: Bill): { place: string; label: string } | null;
  /** Anything more to say about one item, as lines for the inspector. */
  itemNotes?(bill: Bill, world: World): { heading: string; rows: { text: string; target?: string }[] }[];
  /** Where a click on a building of style "gate" leads. */
  doors: { site: string; to: Destination; label: string }[];
}
