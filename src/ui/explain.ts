// Plain-language notes on what each stop on the map does in the legislative
// process. Shown folded away in the Inspect tab for anyone who wants them.

import type { Site } from "../world/layout";
import { el } from "./dom";

interface Note {
  /** What happens at this step. */
  role: string[];
  /** What the building holds on this map. */
  here: string;
}

type Wing = "House" | "Senate";

const HOPPER: Record<Wing, Note> = {
  House: {
    role: [
      "A Representative introduces a bill by dropping it into the hopper, a wooden box beside the Clerk’s desk on the House floor. Only members can do this, though the idea for a bill can come from anyone.",
      "The Clerk gives the bill a number (H.R. for a bill, H.Res., H.J.Res. or H.Con.Res. for the kinds of resolution) and it is sent on to a committee, usually within a day.",
    ],
    here: "Measures that have been introduced but not yet referred anywhere. Most leave almost at once, so it is often empty.",
  },
  Senate: {
    role: [
      "A Senator introduces a bill by handing it to the clerks at the presiding officer’s desk, or by presenting it from the floor. The Senate has no hopper; this map borrows the House’s word for it.",
      "The bill gets a number (S. for a bill, S.Res., S.J.Res. or S.Con.Res. for the kinds of resolution) and is normally referred to a committee.",
    ],
    here: "Measures that have been introduced but not yet referred anywhere. Most leave almost at once, so it is often empty.",
  },
};

const DESK: Record<Wing, Note> = {
  House: {
    role: [
      "Every bill is referred to the committee that handles its subject. In the House the Speaker makes the referral on the advice of the Parliamentarian, and a bill that crosses subjects can be sent to several committees, with one named as primary.",
    ],
    here: "Bills whose record says they were referred, but whose committee could not be matched to a building here. It is a holding place on this map, not a real office.",
  },
  Senate: {
    role: [
      "Every bill is referred to the committee that handles its subject. In the Senate the presiding officer makes the referral on the advice of the Parliamentarian, and a bill almost always goes to a single committee.",
    ],
    here: "Bills whose record says they were referred, but whose committee could not be matched to a building here. It is a holding place on this map, not a real office.",
  },
};

const COMMITTEE: Record<Wing | "Center", Note> = {
  House: {
    role: [
      "Committees are where the detailed work happens, and where most bills stop. A committee, or one of its subcommittees, can hold hearings, then “mark up” the bill (debate and amend it) and vote on whether to report it to the full House.",
      "The chair, who belongs to the majority party, largely decides which bills are taken up. Most bills referred to a committee never get a hearing or a vote.",
      "A majority of the House (218 members) can pull a bill out of a committee with a discharge petition. That is rare.",
    ],
    here: "Bills whose latest action left them with this committee. A bill sent to several committees is shown at its primary one.",
  },
  Senate: {
    role: [
      "Committees are where the detailed work happens, and where most bills stop. A committee, or one of its subcommittees, can hold hearings, then “mark up” the bill (debate and amend it) and vote on whether to report it to the full Senate.",
      "The chair, who belongs to the majority party, largely decides which bills are taken up. Most bills referred to a committee never get a hearing or a vote.",
      "Senate committees also consider the President’s nominations and treaties. Those are not bills and are not shown on this map.",
    ],
    here: "Bills whose latest action left them with this committee.",
  },
  Center: {
    role: [
      "Joint committees have members from both the House and the Senate. Most of them study a subject or oversee an agency, such as the Library of Congress or government printing, rather than write and report bills.",
    ],
    here: "The few measures whose latest action left them with this joint committee.",
  },
};

const CALENDAR: Record<Wing, Note> = {
  House: {
    role: [
      "A bill reported by a committee is placed on a calendar: the Union Calendar for bills that raise or spend money, the House Calendar for most others. A calendar is a list of what is eligible for the floor, not a schedule.",
      "The majority leadership decides what actually comes up. Larger bills usually need a rule from the Rules Committee setting the time for debate and which amendments are allowed. Many bills sit on a calendar until the Congress ends.",
    ],
    here: "Bills that are on a House calendar and have not yet been brought to the floor.",
  },
  Senate: {
    role: [
      "Bills reported by a committee go onto the Senate’s Calendar of Business. A bill can also be placed there directly, skipping committee. A calendar is a list of what is eligible for the floor, not a schedule.",
      "The Majority Leader decides what to bring up, either by unanimous consent or with a motion to proceed, which other senators can hold up. Many bills sit on the calendar until the Congress ends.",
    ],
    here: "Bills that are on the Senate calendar and have not yet been brought to the floor.",
  },
};

const FLOOR: Record<Wing, Note> = {
  House: {
    role: [
      "The full House debates and votes here. Bills mostly arrive one of two ways: under a rule that sets the debate time and the amendments allowed, needing a simple majority to pass; or under suspension of the rules, with 40 minutes of debate, no floor amendments and a two-thirds vote.",
      "With all 435 seats filled, a majority is 218. The Speaker, chosen by the whole House, presides or names a member to do so.",
    ],
    here: "Measures the House is considering now. Click the building on the map to go inside.",
  },
  Senate: {
    role: [
      "The full Senate debates and votes here. Debate has no built-in limit, so senators can block a vote by keeping debate open (a filibuster). Ending debate on most bills takes a cloture vote of 60 of the 100 senators; passing the bill itself takes a simple majority.",
      "Much routine business passes by unanimous consent, with no recorded vote. The Vice President is the Senate’s president and can break a tie, though senators of the majority usually take turns presiding.",
    ],
    here: "Measures the Senate is considering now. Click the building on the map to go inside.",
  },
};

const INBOX: Record<Wing, Note> = {
  House: {
    role: [
      "A bill has to pass both chambers in exactly the same words. Once the Senate passes one, it is sent to the House, which can refer it to a committee, hold it at the Speaker’s desk, pass it as it stands, change it and send it back, or never take it up.",
    ],
    here: "Measures the Senate has passed that are now waiting on the House.",
  },
  Senate: {
    role: [
      "A bill has to pass both chambers in exactly the same words. Once the House passes one, it is sent to the Senate, which can refer it to a committee, place it on the calendar, pass it as it stands, change it and send it back, or never take it up.",
    ],
    here: "Measures the House has passed that are now waiting on the Senate.",
  },
};

const SHARED: Record<string, Note> = {
  conference: {
    role: [
      "When the House and Senate pass different versions of a bill, they have to settle on one text. They can send amendments back and forth until one chamber accepts the other’s version, or appoint a conference committee of members from both to negotiate.",
      "A conference committee’s report cannot be amended. Each chamber votes on it as a whole, and both must approve it.",
    ],
    here: "Bills the two chambers have each passed in a different form and are now reconciling.",
  },
  whitehouse: {
    role: [
      "Once both chambers have passed identical text, the bill is signed by the Speaker and the Senate’s presiding officer and presented to the President, who has ten days, not counting Sundays, to act.",
      "The President can sign it into law or veto it and send it back with objections. If the President does nothing and Congress is in session, it becomes law without a signature. If Congress has adjourned in the meantime, the bill dies; that is a pocket veto.",
    ],
    here: "Bills that have passed both chambers and are on their way to, or waiting with, the President.",
  },
  archive: {
    role: [
      "A signed bill becomes a public law and is numbered in order: Public Law 119-12 is the twelfth law of the 119th Congress. The National Archives publishes it, first on its own and later in the Statutes at Large, and its provisions are filed by subject into the United States Code.",
    ],
    here: "Bills that became law in the last 30 days. The Law Archive stands in for the National Archives; it is not a real building.",
  },
  bin: {
    role: [
      "A vetoed bill goes back to the chamber where it started, with the President’s objections. Congress can override the veto with a two-thirds vote in each chamber, and the bill then becomes law without the President. Overrides are rare.",
    ],
    here: "Bills the President has vetoed. The bin is this map’s shorthand; a vetoed bill is really returned to Congress.",
  },
  hall: {
    role: [
      "Not everything Congress passes is meant to become law. A simple resolution (H.Res. or S.Res.) speaks for one chamber: it sets that chamber’s rules, states its view or handles its housekeeping. A concurrent resolution (H.Con.Res. or S.Con.Res.) needs both chambers and is used for things like the annual budget resolution. Neither goes to the President.",
      "Joint resolutions (H.J.Res. or S.J.Res.) are different. They take the same path as bills and become law the same way.",
    ],
    here: "Resolutions that have been agreed to and are finished. The hall is a stand-in; there is no such building.",
  },
};

function noteFor(site: Site): Note | undefined {
  const wing: Wing = site.wing === "Senate" ? "Senate" : "House";
  switch (site.style) {
    case "hopper":
      return HOPPER[wing];
    case "desk":
      return DESK[wing];
    case "committee":
      return COMMITTEE[site.wing];
    case "calendar":
      return CALENDAR[wing];
    case "chamber":
      return FLOOR[wing];
    case "inbox":
      return INBOX[wing];
    default:
      return SHARED[site.style];
  }
}

let ended = false;

/** Say that the Congress on show has finished, so the notes describe where bills ended. */
export function describeFinished(finished: boolean) {
  ended = finished;
}

const ENDED = " This Congress has ended, so the map shows where each bill stood on its last day. A bill that had not become law by then died with the Congress.";

function fold(summary: string, notes: Note[]): HTMLElement | null {
  if (!notes.length) return null;
  const body: HTMLElement[] = [];
  for (const note of notes) {
    for (const paragraph of note.role) body.push(el("p", {}, paragraph));
    const here = ended ? note.here.replace("in the last 30 days", "in this Congress") + ENDED : note.here;
    body.push(el("p", { class: "note" }, el("strong", {}, "On this map: "), here));
  }
  return el("details", { class: "explain" }, el("summary", {}, summary), ...body);
}

/** A folded explanation of what a building does. Null for a place with nothing to say. */
export function explainSite(site: Site): HTMLElement | null {
  const note = noteFor(site);
  return note ? fold("What happens here?", [note]) : null;
}

/** The same, for a stage that is spread over several buildings. */
export function explainStage(sites: Site[]): HTMLElement | null {
  const seen = new Set<Note>();
  for (const site of sites) {
    const note = noteFor(site);
    if (note) seen.add(note);
  }
  // House and Senate differ at most stages; show whichever apply, House first.
  return fold("What happens at this stage?", [...seen].slice(0, 2));
}
