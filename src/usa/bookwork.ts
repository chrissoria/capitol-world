// What the almanac (./book.ts) works out before it draws anything: which lines of a list fall on a page, which items
// a search finds, how a person is named. Kept apart from the page so it can be tried without one (tests/book.test.ts).

import type { Member, SearchIndex } from "../data/types";

/** How many lines of a list go on one page. */
export const LINES = 16;
/** How many answers a search shows. */
export const FOUND = 60;

export const personName = (member: Member | undefined) =>
  member ? `${member.name}${member.party ? ` (${member.party}${member.state ? `-${member.state}` : ""})` : ""}` : "";

/** The lines of a list that fall on one page, and how many pages there are. */
export function pageOf<T>(rows: T[], page: number, lines = LINES): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / lines));
  const at = Math.min(Math.max(0, page), pages - 1);
  return { rows: rows.slice(at * lines, (at + 1) * lines), page: at, pages };
}

/**
 * The rows of a search index that have every word asked for, in their number, title or sponsor; the newest first.
 * A word may be part of a longer one ("infra"), but a number has to stand whole: "2" finds H.R. 2 and not every act of 2026.
 */
export function found(index: SearchIndex, words: string, most = FOUND): { rows: number[]; total: number } {
  const wanted = words.toLowerCase().split(/\s+/).filter(Boolean);
  if (!wanted.length) return { rows: [], total: 0 };
  const names = index.sponsor_names ?? index.sponsors;
  const rows: number[] = [];
  for (let n = 0; n < index.id.length; n++) {
    const text = `${index.id[n].replace(/-/g, " ")} ${index.title[n]} ${names[index.sponsor[n]] ?? ""}`.toLowerCase();
    if (!wanted.every((word) => text.includes(word))) continue;
    const numbers = wanted.filter((word) => /^\d+$/.test(word));
    if (numbers.length && !numbers.every((word) => text.split(/[^a-z0-9]+/).includes(word))) continue;
    rows.push(n);
  }
  rows.sort((a, b) => (index.date[b] ?? "").localeCompare(index.date[a] ?? ""));
  return { rows: rows.slice(0, most), total: rows.length };
}
