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

import type { CongressEntry, DataProvider } from "../data/load";
import type { Bill, World } from "../data/types";
import type { StatsWords } from "../ui/stats";
import type { BoardConfig } from "../ui/whiteboard";
import type { Layout, Site } from "../world/layout";

export type WorldKey = "capitol" | "whitehouse";

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
  /** What a dead item is called in the filter: "Dead bills only". */
  deadOnly: string;
  /** Names for the fates this world's items can meet, added to the shared list. */
  fates?: Record<string, { name: string; how: string }>;
  searchHint: string;
}

export interface WorldDef {
  key: WorldKey;
  name: string;
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
  /** Which tabs the panel shows. */
  tabs: { roster: boolean; rosterLabel?: string };
  /** Whether the overview lists items by their area (a department, say) rather than by where they are. */
  /** What the whiteboard can plot, and how the Stats tab words its counts, when they differ from the Capitol's. */
  board?: BoardConfig;
  stats?: StatsWords;
  /** Anything more to say about one item, as lines for the inspector. */
  itemNotes?(bill: Bill, world: World): { heading: string; rows: { text: string; target?: string }[] }[];
  /** Where a click on a building of style "gate" leads. */
  doors: { site: string; to: WorldKey; label: string }[];
}
