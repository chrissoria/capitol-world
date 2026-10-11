// The part of a member's card that comes from world/members.json: the official website, the time in
// office, and the birth date. Everything here is read from that file; nothing is worked out from a name.

import type { Member, MemberFacts, MemberTerm } from "../data/types";
import { el, niceDate } from "./dom";

const DAY = 86_400_000;
/** A longer gap than this between two terms in a chamber is a break in service (build_congress_members.py). */
const BREAK_DAYS = 31;

/** An unbroken run of terms in one chamber. */
export interface Stretch {
  chamber: MemberTerm["chamber"];
  start: string;
  end: string;
  state: string;
}

const time = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`).getTime();

/** A member's service as unbroken runs in one chamber, oldest first: a term in the House, then the Senate since 2001. */
export function stretches(terms: MemberTerm[]): Stretch[] {
  const runs: Stretch[] = [];
  for (const term of [...terms].sort((a, b) => a.start.localeCompare(b.start))) {
    const last = runs[runs.length - 1];
    if (last && last.chamber === term.chamber && time(term.start) - time(last.end) <= BREAK_DAYS * DAY) {
      last.end = term.end;
      last.state = term.state;
    } else runs.push({ chamber: term.chamber, start: term.start, end: term.end, state: term.state });
  }
  return runs;
}

/** "25 years", "1 year", "8 months": the whole years between two days, or the months of a first year. */
export function span(start: string, end: string): string {
  const from = new Date(`${start}T12:00:00`);
  const to = new Date(`${end}T12:00:00`);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) months--;
  if (months < 1) return "less than a month";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"}`;
}

const safe = (url: string) => (/^https?:\/\//i.test(url) ? url : "");
const link = (url: string, text: string) => el("a", { href: url, target: "_blank", rel: "noopener" }, text);
const row = (label: string, ...value: (Node | string)[]) => el("div", {}, el("dt", {}, label), el("dd", {}, ...value));

/**
 * The lines for a member's card. `congress` is the Congress on show, which decides which run of
 * service is the one the card is about: someone on the 115th's map as a representative may be a
 * senator today.
 */
export function memberFacts(member: Member, facts: MemberFacts, congress: number, today = new Date().toISOString().slice(0, 10)): HTMLElement {
  const year = 1789 + 2 * (congress - 1);
  const [opened, closed] = [`${year}-01-03`, `${year + 2}-01-03`];
  const runs = stretches(facts.terms ?? []);
  const shown = runs.find((run) => run.chamber === member.chamber && run.start < closed && run.end > opened) ?? runs[runs.length - 1];
  const serving = runs.some((run) => run.end > today);
  // Time still running is counted in years; a finished run is given by its dates, in full for the one the card is about.
  const describe = (run: Stretch) =>
    run.end > today
      ? `${run.chamber} since ${niceDate(run.start)} · ${span(run.start, today)}`
      : run === shown
        ? `${run.chamber}, ${niceDate(run.start)} to ${niceDate(run.end)}`
        : `${run.chamber}, ${run.start.slice(0, 4)}–${run.end.slice(0, 4)}`;
  const elsewhere = (run: Stretch) => (run.state !== member.state ? ` (${run.state})` : "");

  const website = safe(facts.url);
  const form = safe(facts.contact_form);
  const reach = [facts.office, facts.phone].filter(Boolean).join(" · ");
  return el(
    "div",
    { class: "member-facts" },
    website || form
      ? el("p", {}, website ? link(website, "Official website ↗") : null, website && form ? " · " : null, form ? link(form, "Contact form ↗") : null)
      : null,
    el(
      "dl",
      { class: "facts" },
      shown ? row("In office", describe(shown) + elsewhere(shown)) : null,
      ...runs
        .filter((run) => run !== shown)
        .reverse()
        .map((run) => row(run.start < shown!.start ? "Earlier" : "Later", describe(run) + elsewhere(run))),
      facts.born ? row("Born", niceDate(facts.born) + (serving ? ` · age ${span(facts.born, today).replace(/ years?$/, "")}` : "")) : null,
      // On the map of an earlier Congress, a member who has since changed chamber has today's office, not that seat's.
      reach ? row(shown && shown.end <= today ? "Office now" : "Office", reach) : null,
    ),
  );
}
