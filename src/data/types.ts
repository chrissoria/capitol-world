// Shapes of the snapshot files written by build_world_snapshot.py (cat-pol-datasets).

export type Chamber = "House" | "Senate" | "";

export type LocKind =
  | "hopper"
  | "committee"
  | "referral_desk"
  | "calendar"
  | "floor"
  | "other_chamber"
  | "conference"
  | "president"
  | "law"
  | "vetoed"
  | "adopted";

export interface Loc {
  kind: LocKind;
  chamber: Chamber;
  committee: string;
}

export interface Member {
  id: string;
  name: string;
  party: string;
  state: string;
  district: number | null;
  chamber: Chamber;
  n_world: number;
  n_total: number;
  role?: string;
  /** Set for someone who held a seat in the period and no longer does: listed, but not counted or seated. */
  left?: boolean;
  /** In a world without chambers, the circle the person belongs to: "President", "Cabinet", "White House". */
  group?: string;
  /** Colours for the figure, where it should suggest a particular person rather than be drawn at random. */
  look?: { skin?: string; hair?: string; suit?: string; tie?: string; style?: number; robe?: boolean };
}

/** One term a member served, from world/members.json. */
export interface MemberTerm {
  chamber: "House" | "Senate";
  start: string;
  end: string;
  state: string;
  district: number | null;
  party: string;
}

/** What world/members.json knows about one member beyond the map file: how to reach them and when they served. */
export interface MemberFacts {
  /** The official website and contact details; empty for someone who has left Congress. */
  url: string;
  contact_form: string;
  email: string;
  phone: string;
  office: string;
  /** The start of the member's latest unbroken time in one chamber. */
  since: string;
  first_entered: string;
  terms: MemberTerm[];
  born: string;
  gender: string;
}

/** world/members.json, written by build_congress_members.py (cat-pol-datasets) beside the congress-members dataset. */
export interface MemberFile {
  schema: number;
  generated_at: string;
  members: Record<string, MemberFacts>;
}

export interface Committee {
  code: string;
  name: string;
  chamber: string;
  n_bills: number;
}

export interface Bill {
  id: string;
  type: string;
  number: string;
  title: string;
  sponsor: string;
  /** Who is behind a bill that no member is: a committee, by name. */
  author?: string;
  cosponsors: number;
  policy_area: string;
  status: string;
  loc: Loc;
  last_action: { date: string; text: string };
  introduced: string;
  summary: string;
  url: string;
  /** Why the bill is dead (see FATES); absent for a bill that is alive or that succeeded. */
  fate?: string;
  /** Other items this one acts on or is acted on by, as ids: an order's revocations, say. */
  links?: Record<string, string[]>;
}

export interface MoveEvent {
  bill: string;
  date: string;
  seq: number;
  from: string | null;
  to: string;
  text: string;
  /** Member id of the legislator who carried the bill, when known. */
  actor?: string | null;
  /** For an item appearing for the first time (`from` is null): the site it sets out from, if not the world's usual one. */
  via?: string;
  actor_role?: string | null;
}

export interface World {
  schema: number;
  generated_at: string;
  data_through: string;
  congress: number;
  window: { world_since: string; events_since: string };
  counts: {
    total: number;
    world: number;
    events: number;
    guessed_locations: number;
    by_status: Record<string, number>;
    by_kind: Record<string, number>;
    /** Dead bills of the whole Congress, by cause (see FATES). */
    dead?: Record<string, number>;
  };
  roles?: { chairs: Record<string, string>; leaders: Record<string, string> };
  members: Member[];
  committees: Committee[];
  bills: Bill[];
  events: MoveEvent[];
  /** Every movement of the period in order, for a world that can replay the whole of it. */
  story?: MoveEvent[];
  /** A finished Congress: every bill is on the map, at the place it ended. */
  final?: boolean;
  /** First and last year of a finished Congress. */
  years?: [number, number];
  /** "crs" when the summaries are the official ones; otherwise they are machine-written. */
  summary_source?: string;
}

/** world/congresses.json: the finished Congresses that have been built. */
export interface CongressList {
  archive: { congress: number; years: [number, number]; bills: number; laws: number; data_through: string }[];
}

/** "118th", "101st". */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

export interface SearchIndex {
  schema: number;
  data_through: string;
  sponsors: string[];
  statuses: string[];
  policy_areas: string[];
  id: string[];
  title: string[];
  sponsor: number[];
  status: number[];
  policy_area: number[];
  date: string[];
  /** Added later, so an older data file may lack them. */
  pending?: number;
  introduced?: string[];
  /** One character per bill: the sponsor's party (D, R, I or ?). */
  party?: string;
  /** One digit per bill: 0 in committee, 1 out of committee, 2 failed a floor vote, 3 passed a chamber, 4 passed both, 5 law. */
  stage?: string;
  /** "Name (P-ST)" for each entry of `sponsors`. */
  sponsor_names?: string[];
  /** One character per bill: why it is dead (see FATES), or "." if it is not. */
  fate?: string;
  /** One character per item: "1" for one that can be searched for but is left out of the statistics. */
  uncounted?: string;
}

export function locKey(loc: Loc): string {
  return [loc.kind, loc.chamber, loc.committee].filter(Boolean).join(":");
}

export function billLabel(bill: { type: string; number: string }): string {
  const names: Record<string, string> = {
    HR: "H.R.",
    S: "S.",
    HRES: "H.Res.",
    SRES: "S.Res.",
    HJRES: "H.J.Res.",
    SJRES: "S.J.Res.",
    HCONRES: "H.Con.Res.",
    SCONRES: "S.Con.Res.",
  };
  if (bill.type === "SC" || bill.type === "APP") return `No. ${bill.number}`;
  if (bill.type === "ITEM") return /^item /i.test(bill.number) ? bill.number : `File ${bill.number}`; // a docket entry with no file number of its own is "Item 30"
  if (bill.type === "EO") return /^\d/.test(bill.number) ? `Executive Order ${bill.number}` : "Executive order";
  return `${names[bill.type] ?? bill.type} ${bill.number}`;
}
