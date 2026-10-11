// The map, in tiles. House wing on the west, Senate wing mirrored on the east,
// a mall between them, and the White House row across the top. Bills travel
// from the hoppers at the bottom toward the top.

import type { Chamber, Committee } from "../data/types";

export const TILE = 16;
export const MAP_W = 176;
export const MAP_H = 104;
export const AVENUE_HOUSE = 80; // two tiles wide: 80 and 81
export const AVENUE_SENATE = 94; // 94 and 95
const AVENUE_TOP = 12;
const AVENUE_BOTTOM = 100;
const CROSSINGS = [12, 45, 99];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SiteStyle =
  | "committee"
  | "chamber"
  | "calendar"
  | "inbox"
  | "desk"
  | "hopper"
  | "conference"
  | "whitehouse"
  | "archive"
  | "hall"
  | "memorial"
  | "library"
  | "department"
  | "gate";

export interface Site {
  key: string;
  style: SiteStyle;
  label: string;
  short: string;
  wing: "House" | "Senate" | "Center";
  rect: Rect;
  /** Row of tiles in front of the building where bills are stacked. */
  dock: { x: number; y: number; w: number };
  /** Street in front of the dock that robots drive along. */
  lane: number;
  capacity: number;
  /** For a gate: the world a click on it leads to. */
  travel?: string;
}

export interface Layout {
  sites: Map<string, Site>;
  chambers: Partial<Record<"House" | "Senate", Rect>>;
  conveyors: Partial<Record<"House" | "Senate", { from: { x: number; y: number }; to: { x: number; y: number } }>>;
  pool?: Rect;
  /** Where a new item starts its first journey from, when it is not a hopper: a site key. */
  origin?: string;
  /** Items with one of these fates are laid at this site instead of where they stood. */
  graveyard?: { fates: string[]; site: string };
  /** The site for a location key, when the world does not use the Capitol's rules. */
  siteOf?(loc: string | null): string | null;
  lanes: { y: number; x1: number; x2: number }[];
  avenues: { x: number; y1: number; y2: number }[];
}

const mirror = (rect: Rect): Rect => ({ ...rect, x: MAP_W - rect.x - rect.w });

export function makeSite(
  key: string,
  style: SiteStyle,
  label: string,
  short: string,
  wing: Site["wing"],
  rect: Rect,
  dock?: { x: number; w: number },
): Site {
  const dockRow = { x: dock?.x ?? rect.x, y: rect.y + rect.h, w: dock?.w ?? rect.w };
  return {
    key,
    style,
    label,
    short,
    wing,
    rect,
    dock: dockRow,
    lane: rect.y + rect.h + 1,
    capacity: Math.max(1, Math.floor((dockRow.w * TILE - 20) / 12)),
  };
}

function shortName(name: string): string {
  return name
    .replace(/ Committee$/, "")
    .replace(/^Committee on /, "")
    .replace(/, and /g, " & ")
    .replace(/ and /g, " & ");
}

export function buildLayout(committees: Committee[]): Layout {
  const sites = new Map<string, Site>();
  const add = (entry: Site) => sites.set(entry.key, entry);

  // Top row.
  add(makeSite("president", "whitehouse", "White House", "White House", "Center", { x: 78, y: 2, w: 20, h: 9 }, { x: 82, w: 12 }));
  add(makeSite("law", "archive", "Law Archive", "Law Archive", "Center", { x: 108, y: 3, w: 16, h: 8 }));
  add(makeSite("adopted", "hall", "Resolutions Hall", "Resolutions", "Center", { x: 52, y: 3, w: 16, h: 8 }));
  add(makeSite("library", "library", "Library of Congress", "Library", "Center", { x: 30, y: 3, w: 16, h: 8 }));
  add(makeSite("memorial", "memorial", "Bill Memorial", "Bill Memorial", "Center", { x: 130, y: 3, w: 16, h: 8 }));
  add(makeSite("conference", "conference", "Conference Room", "Conference", "Center", { x: 83, y: 18, w: 10, h: 8 }));

  const houseChamber: Rect = { x: 12, y: 17, w: 60, h: 27 };
  const wings: { chamber: "House" | "Senate"; flip: (r: Rect) => Rect }[] = [
    { chamber: "House", flip: (r) => r },
    { chamber: "Senate", flip: mirror },
  ];
  const chambers = { House: houseChamber, Senate: mirror(houseChamber) };
  const conveyors = {} as Layout["conveyors"];

  for (const { chamber, flip } of wings) {
    const floorDock = flip({ x: 30, y: 0, w: 24, h: 0 });
    add(makeSite(`floor:${chamber}`, "chamber", `${chamber} Floor`, `${chamber} Floor`, chamber, chambers[chamber], {
      x: floorDock.x,
      w: floorDock.w,
    }));
    add(makeSite(`other_chamber:${chamber}`, "inbox", `${chamber} Inbox`, "Inbox", chamber, flip({ x: 73, y: 26, w: 6, h: 4 })));
    add(makeSite(`calendar:${chamber}`, "calendar", `${chamber} Calendar`, "Calendar", chamber, flip({ x: 30, y: 48, w: 24, h: 6 })));
    add(makeSite(`referral_desk:${chamber}`, "desk", `${chamber} Referral Desk`, "Referral Desk", chamber, flip({ x: 34, y: 93, w: 12, h: 5 })));
    const hopper = flip({ x: 6, y: 93, w: 9, h: 5 });
    add(makeSite(`hopper:${chamber}`, "hopper", `${chamber} Hopper`, "Hopper", chamber, hopper));
    const desk = sites.get(`referral_desk:${chamber}`)!.rect;
    const beltY = hopper.y + 2.5;
    conveyors[chamber] =
      chamber === "House"
        ? { from: { x: hopper.x + hopper.w, y: beltY }, to: { x: desk.x, y: beltY } }
        : { from: { x: hopper.x, y: beltY }, to: { x: desk.x + desk.w, y: beltY } };

    const own = committees
      .filter((c) => c.chamber === chamber)
      .sort((a, b) => a.name.localeCompare(b.name));
    own.forEach((committee, index) => {
      const col = index % 6;
      const row = Math.floor(index / 6);
      const rect = flip({ x: 5 + 12 * col, y: 59 + 8 * row, w: 10, h: 5 });
      add(makeSite(`committee:${committee.code}`, "committee", committee.name, shortName(committee.name), chamber, rect));
    });
  }

  const joint = committees.filter((c) => c.chamber !== "House" && c.chamber !== "Senate" && c.n_bills > 0);
  joint.forEach((committee, index) => {
    add(makeSite(`committee:${committee.code}`, "committee", committee.name, shortName(committee.name), "Center", {
      x: 83,
      y: 67 + 8 * index,
      w: 10,
      h: 5,
    }));
  });

  return { sites, chambers, conveyors, pool: { x: 85, y: 48, w: 6, h: 14 }, ...streets(sites) };
}

/** Streets for a set of sites: a lane from each dock to its avenue (centre sites reach both), and the two avenues. */
export function streets(sites: Map<string, Site>): Pick<Layout, "lanes" | "avenues"> {
  const lanes: Layout["lanes"] = [];
  for (const entry of sites.values()) {
    const centre = entry.dock.x + entry.dock.w / 2;
    if (entry.wing === "House") lanes.push({ y: entry.lane, x1: Math.min(centre, entry.dock.x), x2: AVENUE_HOUSE + 2 });
    else if (entry.wing === "Senate") lanes.push({ y: entry.lane, x1: AVENUE_SENATE, x2: Math.max(centre, entry.dock.x + entry.dock.w) });
    else lanes.push({ y: entry.lane, x1: Math.min(entry.dock.x, AVENUE_HOUSE), x2: Math.max(entry.dock.x + entry.dock.w, AVENUE_SENATE + 2) });
  }
  for (const y of CROSSINGS) lanes.push({ y, x1: AVENUE_HOUSE, x2: AVENUE_SENATE + 2 });
  return {
    lanes,
    avenues: [
      { x: AVENUE_HOUSE, y1: AVENUE_TOP, y2: AVENUE_BOTTOM },
      { x: AVENUE_SENATE, y1: AVENUE_TOP, y2: AVENUE_BOTTOM },
    ],
  };
}

/** Which site a location key ("committee:House:hsif00", "calendar:Senate", "law") belongs to. */
export function siteKeyFor(loc: string | null, sites: Map<string, Site>, fallbackChamber: Chamber = "House"): string | null {
  if (!loc) return null;
  const parts = loc.split(":");
  const kind = parts[0];
  const chamber = parts.find((part) => part === "House" || part === "Senate") ?? (fallbackChamber || "House");
  if (kind === "committee") {
    const code = parts[parts.length - 1];
    if (sites.has(`committee:${code}`)) return `committee:${code}`;
    return `referral_desk:${chamber}`;
  }
  if (kind === "vetoed") return "memorial"; // a vetoed bill is laid at the memorial
  if (["president", "law", "adopted", "conference"].includes(kind)) return kind;
  const key = `${kind}:${chamber}`;
  return sites.has(key) ? key : `referral_desk:${chamber}`;
}

export function anchorOf(entry: Site): { x: number; y: number } {
  return { x: (entry.dock.x + entry.dock.w / 2) * TILE, y: (entry.dock.y + 0.5) * TILE };
}

/** Street route between two sites, in pixels. */
export function route(from: Site, to: Site): { x: number; y: number }[] {
  const avenue = (entry: Site, other: Site) => {
    const wing = entry.wing === "Center" ? (other.wing === "Senate" ? "Senate" : "House") : entry.wing;
    return (wing === "House" ? AVENUE_HOUSE + 1 : AVENUE_SENATE + 1) * TILE;
  };
  const a = anchorOf(from);
  const b = anchorOf(to);
  const laneA = (from.lane + 0.5) * TILE;
  const laneB = (to.lane + 0.5) * TILE;
  const aveA = avenue(from, to);
  const aveB = avenue(to, from);
  const points = [a, { x: a.x, y: laneA }, { x: aveA, y: laneA }];
  if (aveA !== aveB) {
    const crossing = CROSSINGS.map((y) => (y + 0.5) * TILE).sort(
      (p, q) => Math.abs(p - laneA) + Math.abs(p - laneB) - (Math.abs(q - laneA) + Math.abs(q - laneB)),
    )[0];
    points.push({ x: aveA, y: crossing }, { x: aveB, y: crossing });
  }
  points.push({ x: aveB, y: laneB }, { x: b.x, y: laneB }, b);
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}
