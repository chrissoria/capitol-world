// Sacramento: the California Legislature and its bills. The first state capitol, and the pattern for
// the rest: the data has the shapes Congress's has (build_california_snapshot.py in cat-pol-datasets),
// the map is the Capitol's with other names on it, and everything a visitor reads is in this file.
//
// The Assembly fills the west wing, where Congress has the House, so in the data and the code its
// chamber is "House". Nothing on screen says so.

import { fetchJson, loadCongressLine, type CongressEntry, type Source } from "../data/load";
import type { Note } from "../ui/explain";
import { ACROSS, MEASURES } from "../ui/whiteboard";
import { EXECUTIVE_RECT, atlasGate, buildLayout, makeSite, type Plan, type Site } from "../world/layout";
import type { WorldDef } from "./types";

const ROOT = "https://huggingface.co/datasets/chrissoria/california-bills/resolve/main/world/";
const CHAMBERS = { House: "Assembly", Senate: "Senate" };

/** A session by the year it began: "2025–2026 session", or "2025–26" where there is little room. */
const sessionName = (year: number) => `${year}–${year + 1} session`;
const sessionShort = (year: number) => `${year}–${String(year + 1).slice(2)}`;

/** world/sessions.json: the session in progress and the finished ones that have been built. */
interface SessionList {
  current: { congress: number; years: [number, number]; final: boolean } | null;
  archive: { congress: number; years: [number, number] }[];
}

const source: Source = {
  root: ROOT,
  list: "sessions.json",
  gzipped: true,
  bundled: false,
  members: null,
  currentText: true,
  async line(): Promise<CongressEntry[]> {
    const list = await fetchJson<SessionList>(`${ROOT}sessions.json`);
    return [
      ...(list.current ? [{ congress: list.current.congress, years: list.current.years, live: true, ended: list.current.final } satisfies CongressEntry] : []),
      ...list.archive.map((item) => ({ congress: item.congress, years: item.years, live: false }) satisfies CongressEntry),
    ];
  },
};

const PLAN: Plan = {
  chambers: CHAMBERS,
  top: [makeSite("president", "mansion", "Governor’s Office", "Governor", "Center", EXECUTIVE_RECT, { x: 80, w: 16 }), atlasGate()],
  shared: {
    law: ["Secretary of State", "Statutes"],
    library: ["State Library", "Library"],
    conference: ["Engrossing and Enrolling", "Enrolling"],
  },
  calendar: "Daily File",
  period: "session",
  // In a session before 2007-2008 the record does not say where a bill stopped, so those that did not pass lie together.
  graveyard: { fates: ["v", "f", "x"], site: "memorial" },
};

/** A measure's page on the Legislature's site, from an id such as "2025-ab-679" or "2025-sbx1-3". */
function billUrl(id: string): string {
  const [year, type, number] = id.split("-");
  const special = /x(\d+)$/.exec(type);
  const kind = type.replace(/x\d+$/, "").toUpperCase();
  return `https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=${year}${Number(year) + 1}${special?.[1] ?? "0"}${kind}${number}`;
}

// ── What each building does ─────────────────────────────────────────────────

const house = (site: Site) => (site.wing === "Senate" ? "Senate" : "Assembly");
const other = (site: Site) => (site.wing === "Senate" ? "Assembly" : "Senate");
const majority = (site: Site) => (site.wing === "Senate" ? "21 of the 40 senators" : "41 of the 80 Assembly Members");

const NOTES: Record<string, (site: Site) => Note> = {
  hopper: (site) => ({
    role: [
      `A member introduces a bill by delivering it to the ${site.wing === "Senate" ? "Secretary of the Senate" : "Chief Clerk of the Assembly"}. It is given a number, read for the first time and sent to be printed.`,
      "Except for the budget bill, a bill cannot be heard in committee or acted on until it has been in print for 30 days.",
    ],
    here: "Measures that have been introduced and have gone nowhere yet. It is usually empty.",
  }),
  desk: (site) => ({
    role: [
      `Each house’s Rules Committee decides which committee a bill goes to. Until it does, the bill waits at the ${house(site)} Desk. A bill arriving from the ${other(site)} starts here too.`,
    ],
    here: `Measures at the ${house(site)} Desk or with its Rules Committee for assignment, and those held at the Desk for other reasons.`,
  }),
  committee: (site) => ({
    role: [
      "Policy committees hear bills in public, take testimony, and vote to pass them, amend them or hold them. Most bills that fail, fail here, often without a vote.",
      "A bill that would cost the state money goes on to the Appropriations Committee of the same house. Costlier bills are placed on its suspense file and decided together, in one hearing, twice a year.",
    ],
    here: `Measures whose latest action left them with this ${house(site)} committee.`,
  }),
  calendar: (site) => ({
    role: [
      `A bill reported out of committee is read a second time and then waits on the ${house(site)}’s Daily File for its third reading, when the house debates and votes. Uncontested bills can go on a consent calendar and pass together.`,
      "A bill its author is not ready to take up can be moved to the inactive file, and brought back later.",
    ],
    here: `Measures on second reading, on a consent calendar or on the inactive file of the ${house(site)}.`,
  }),
  chamber: (site) => ({
    role: [
      `The whole ${house(site)} debates and votes here. Most bills need a majority of the membership, ${majority(site)}, however many are present. Urgency bills, tax increases and constitutional amendments need two thirds.`,
    ],
    here: `Measures on third reading in the ${house(site)}, and those returned from the ${other(site)} with amendments to accept or refuse. Click the building on the map to go inside.`,
  }),
  inbox: (site) => ({
    role: [
      `A bill must pass both houses in the same words. One the ${other(site)} has passed comes to the ${house(site)} and goes through the same steps again: committee, second reading, third reading.`,
      `If the second house amends it, the bill returns to its first house, which votes on whether to concur in the amendments. If it refuses, a conference committee of both houses can be appointed to settle the text.`,
    ],
    here: `Measures the ${other(site)} has passed that are waiting on the ${house(site)}.`,
  }),
  conference: () => ({
    role: [
      "When both houses have passed a bill in the same words it is enrolled: proofread, printed in its final form and signed by the officers of each house. It is then presented to the Governor.",
    ],
    here: "Measures both houses have passed that are being enrolled. Most stay a few days. A conference committee, which is rare, would be shown here too.",
  }),
  mansion: () => ({
    role: [
      "The Governor has 12 days to sign or veto a bill. For bills passed at the end of a year’s session and still on the Governor’s desk when the Legislature adjourns, the time is 30 days.",
      "A bill the Governor neither signs nor vetoes in that time becomes law without a signature. In a bill that spends money, the Governor can strike or reduce single items and sign the rest.",
      "The Legislature can override a veto with two thirds of each house. It has not done so in decades.",
    ],
    here: "Bills that have been enrolled and presented to the Governor.",
  }),
  archive: () => ({
    role: [
      "A signed bill goes to the Secretary of State, who gives it a chapter number in the order received: Chapter 275, Statutes of 2025. That is how a California law is cited until it is filed into the codes.",
      "Most new laws take effect on January 1 of the following year. An urgency statute takes effect at once.",
    ],
    here: "Bills that became law.",
  }),
  hall: () => ({
    role: [
      "A resolution states a view or settles the Legislature’s own business, and does not go to the Governor. A house resolution (HR or SR) speaks for one house. A concurrent resolution (ACR or SCR) needs both. A joint resolution (AJR or SJR) tells Congress or the President what the Legislature thinks.",
      "A constitutional amendment (ACA or SCA) needs two thirds of each house and then goes to the voters, not the Governor.",
    ],
    here: "Resolutions that were adopted and constitutional amendments that passed both houses. The hall is a stand-in; there is no such building.",
  }),
  memorial: () => ({
    role: [
      "Most bills do not become law. A few are stopped by an event: the Governor vetoes one, or a house votes one down. Many more run out of time.",
      "A session lasts two years. A bill introduced in the first year that has not passed its own house by the end of the following January is dead, and whatever has not passed both houses when the session ends on August 31 of the second year dies with it.",
      "There is no such building. It is this map’s way of showing the bills that are finished without having succeeded, and why.",
    ],
    here: "Bills that were vetoed or lost a floor vote are laid here. The panel also counts every other dead bill by the way it died.",
  }),
  library: () => ({
    role: [
      "Everything on this map comes from the Legislature’s own record of its bills, which the Legislative Counsel publishes each night. The digest shown with each bill is the Legislative Counsel’s.",
      "The counts on the whiteboard are this project’s own tallies of that record. They are not official statistics.",
    ],
    here: "No bills are kept here. Click the building, or the Stats tab, to open the whiteboard.",
  }),
};

// ── The definition ──────────────────────────────────────────────────────────

export const california: WorldDef = {
  key: "california",
  name: "California Capitol World",
  periodParam: "session",
  provider: null,
  source,
  legislature: {
    chambers: CHAMBERS,
    body: "the Legislature",
    period: "session",
    periods: "sessions",
    periodName: (entry) => sessionName(entry.congress),
    title: (member) => (member.chamber === "Senate" ? "Senator" : "Assembly Member"),
    cosponsor: "coauthor",
    site: "the Legislature’s site",
    url: billUrl,
    summaryNote: "The Legislative Counsel’s Digest of the bill’s newest version",
    meetings: false,
    rosterNote: "As listed on the committee’s most recent roll call. Hearings are not on this map yet.",
    explain: (site) => NOTES[site.style]?.(site),
    about: (world, final) => [
      { text: `California Capitol World shows where the bills of the ${sessionName(world.congress)} of the California Legislature ${final ? "ended up" : "are"}. Bills start at the bottom and move up: to a committee, onto the Daily File, to the floor, across to the other house, and on to the Governor.` },
      { heading: "The data", text: `Everything comes from the Legislature’s own nightly export of its bill database (downloads.leginfo.legislature.ca.gov), through the public dataset chrissoria/california-bills on Hugging Face. ${final ? `This session’s work is over: the Governor’s last day to sign or veto has passed. Last action ${world.data_through}. All ${world.counts.total.toLocaleString()} measures are on the map.` : `Data through ${world.data_through}. The map shows the ${world.counts.world.toLocaleString()} measures with an action in the last 30 days; all ${world.counts.total.toLocaleString()} are searchable.`}` },
      { text: "Where a measure is comes straight from its history, in which the Legislature records the house and the place each action left it. For sessions before 2007–2008 the record says only how a measure ended, so those maps show ends and nothing in between.", note: world.congress < 2007 },
      { text: "Summaries are the Legislative Counsel’s Digest. The subject shown for a bill is the first committee it was sent to for its subject, because California gives bills no policy area. Committee members are those listed on the committee’s most recent roll call." },
      { heading: "How to read it", text: "Teal roofs are the Assembly side and purple roofs the Senate side. Paper with a teal band started in the Assembly; a purple band, the Senate. The figures are generated at random and are not likenesses, and what they do inside the buildings is animation. Where a bill sits says nothing about its merit." },
      { text: "Made by Chris Soria. Not affiliated with the State of California.", note: true },
    ],
  },
  layout: (world) => buildLayout(world.committees, PLAN),
  line: loadCongressLine,
  periodLabel: (entry) => `${sessionName(entry.congress)}`,
  tabs: { roster: true, seatWord: "district" },
  doors: [{ site: "gate-usa", to: "usa", label: "Go to the map of the United States →" }],
  board: {
    measures: MEASURES.map(([key, label, stage]) => [key, key === "passed" ? "Share that passed a house" : label, stage]),
    across: ACROSS.map(([key, label]) => [key, key === "congress" ? "by session" : key === "area" ? "by first committee" : key === "party" ? "by author’s party" : label]),
    group: sessionShort,
  },
  statsNames: {
    period: "session",
    periods: "sessions",
    periodLabel: (entry) => sessionShort(entry.congress),
    periodName: (entry) => sessionName(entry.congress),
    range: (first, last) => `sessions from ${sessionShort(first.congress)} to ${sessionShort(last.congress)}`,
    chambers: CHAMBERS,
    kinds: [
      ["law", "Bills"],
      ["res", "Resolutions and constitutional amendments"],
      ["all", "Everything"],
    ],
    lawTypes: ["ab", "sb", "abx1", "sbx1", "abx2", "sbx2", "abx3", "sbx3", "abx4", "sbx4", "abx5", "sbx5", "abx6", "sbx6", "abx7", "sbx7", "abx8", "sbx8"],
    lower: (type) => type.startsWith("a") || type.startsWith("h"),
    areas: "Committees bills were first sent to",
    nouns: { law: "bills", res: "resolutions and constitutional amendments", all: "measures" },
    house: "house",
    sponsor: "author",
  },
  words: {
    item: "bill",
    items: "bills",
    period: (world) => sessionName(world.congress),
    stamp: (world, through) => (world.final ? `Final record · last action ${through}` : `Data through ${through}`),
    stages: {
      hopper: "Just introduced",
      referral_desk: "At the Desk, waiting for a committee",
      calendar: "On the Daily File",
      other_chamber: "Sent to the other house",
      conference: "Being enrolled",
      president: "With the Governor",
      law: "Became law",
      ended: "Did not pass",
    },
    overview: (world) =>
      world.final
        ? {
            title: `What the ${sessionName(world.congress)} did`,
            lead: `${world.counts.total.toLocaleString()} bills, resolutions and constitutional amendments were introduced in the California Legislature’s ${sessionName(world.congress)}. Each one is on the map, at the place where it ended.`,
            where: "Where those bills ended",
          }
        : {
            title: "What the Legislature is working on",
            lead: `${world.counts.world.toLocaleString()} measures had an action in the 30 days up to ${new Date(`${world.data_through}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}. Each sheet of paper on the map is one of them, sitting where its latest action left it.`,
            where: "Where those bills are",
          },
    kicker: (site) => (site.style === "mansion" ? "Executive branch" : site.wing === "Center" ? "Shared" : CHAMBERS[site.wing]),
    person: "Author",
    noPerson: (bill) => bill.author || "No author listed",
    noArea: "Never sent to a subject committee",
    deadOnly: "Dead bills only",
    searchHint: "Bill number, title words, or a name",
    fates: {
      v: { name: "Vetoed", how: "The Governor returned these without signing them, and the Legislature did not override the veto." },
      f: { name: "Lost a floor vote", how: "A house voted on each of these and refused to pass it, or refused to accept the other house’s amendments." },
      s: { name: "No action in a year", how: "Nothing has happened to these for a year or more, so they are presumed dead. One that moves again leaves this list." },
      c: { name: "Died in committee", how: "These never got out of committee in the house where they began, or never reached one." },
      w: { name: "Died waiting for a floor vote", how: "A committee sent these on, but their own house never passed them." },
      o: { name: "Died in the other house", how: "One house passed these and the other did not." },
      b: { name: "Passed both houses, never became law", how: "Both houses passed some version of these, but they never agreed on one text, or it was not enrolled and signed." },
      x: { name: "Did not pass", how: "The Legislature’s record of this session says how each measure ended, not where it stood when it stopped. These were neither chaptered nor vetoed." },
    },
  },
};
