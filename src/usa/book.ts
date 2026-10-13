// The almanac on the map of the United States: a book tucked into the upper right edge of the map, half out of sight
// until the pointer comes near, as the guide is in the corner below. Opened, it fills
// the screen and holds everything the worlds hold, to be read instead of walked through: the country, its states,
// counties and cities with their figures, and each world's items by where they stand, its people, and a search of
// all of it. Any page can lead back onto the map or into the world it is about.
//
// It reads the same files the worlds do and keeps none of its own. A world's file is loaded when its chapter is
// first opened.

import { loadSearchFrom, loadWorldFrom } from "../data/load";
import { NATION, loadPlace, loadPlacesIn, loadStates, placeFigures, type PlaceFacts } from "../data/places";
import { billLabel, type Bill, type SearchIndex, type World } from "../data/types";
import { el, niceDate, put, type Child } from "../ui/dom";
import { SHARED_STAGES } from "../ui/panel";
import { WORLDS } from "../worlds";
import { loadChambers, type ChamberEntry } from "../worlds/chamber";
import type { WorldDef, WorldKey } from "../worlds/types";
import { box, canvas } from "../world/art";
import { LINES, found, pageOf, personName } from "./bookwork";
import type { AtlasContext } from "./index";
import { STATES, stateOfCounty } from "./states";

export const BOOK_NAME = "The Almanac";

/** The worlds the book has a chapter for, in the order of its contents. */
const CHAPTERS: { key: Exclude<WorldKey, "chamber">; title: string; about: string }[] = [
  { key: "capitol", title: "Congress", about: "Every bill of the Congress now sitting, and who is behind it" },
  { key: "whitehouse", title: "The White House", about: "Executive orders, and the people around the President" },
  { key: "court", title: "The Supreme Court", about: "The cases of the term, and the justices" },
  { key: "california", title: "California’s Legislature", about: "Every bill of the session in Sacramento" },
];

/** One page the book can be open at. */
export type Leaf =
  | { at: "contents" }
  | { at: "place"; id: string; page?: number; part?: "districts" }
  | { at: "world"; key: WorldKey }
  | { at: "stage"; key: WorldKey; kind: string; page?: number }
  | { at: "people"; key: WorldKey; page?: number }
  | { at: "person"; key: WorldKey; id: string; page?: number }
  | { at: "item"; key: WorldKey; id: string }
  | { at: "search"; key: WorldKey; words: string }
  | { at: "rooms" };

interface Spread {
  /** The words over the pages: where in the book this is. */
  running: string;
  left: Child[];
  right: Child[];
}

const whole = (n: number) => n.toLocaleString();

/** The book on its shelf: a closed book, drawn small and shown three times the size. */
function drawBook(): HTMLCanvasElement {
  const [picture, ctx] = canvas(22, 26);
  const ink = "#2e2a44";
  box(ctx, 2, 1, 18, 24, ink); // the cover's edge
  box(ctx, 3, 2, 16, 22, "#a8452f");
  box(ctx, 3, 2, 3, 22, "#7c2f22"); // the spine
  box(ctx, 19, 3, 1, 21, "#f6f2e6"); // the pages' edge
  box(ctx, 8, 5, 9, 1, "#ffd84a");
  box(ctx, 8, 20, 9, 1, "#ffd84a");
  // A star on the cover, as on a capitol.
  for (const [x, y, w] of [[12, 9, 1], [11, 10, 3], [9, 11, 7], [10, 12, 5], [11, 13, 3], [10, 14, 2], [13, 14, 2]]) box(ctx, x, y, w, 1, "#ffd84a");
  box(ctx, 1, 24, 20, 2, ink);
  picture.style.width = `${picture.width * 3}px`;
  picture.style.height = `${picture.height * 3}px`;
  picture.setAttribute("aria-hidden", "true");
  return picture;
}

/** Put the book at the edge of `stage`. `show(false)` takes it off the page. */
export function createBook(stage: HTMLElement, { signal, travel }: AtlasContext): { show(visible: boolean): void; open(leaf?: Leaf): void } {
  const shelf = el("button", { id: "almanac", type: "button", "aria-haspopup": "dialog" }, drawBook(), el("span", { class: "almanac-words" }, "Read it all in the Almanac"));
  stage.append(shelf);

  const running = el("span", { class: "book-running" });
  const backButton = el("button", { type: "button", class: "book-tool" }, "← Back");
  const contentsButton = el("button", { type: "button", class: "book-tool" }, "Contents");
  const closeButton = el("button", { type: "button", class: "book-tool", "aria-label": "Close the book" }, "Close ✕");
  const left = el("section", { class: "book-page book-left" });
  const right = el("section", { class: "book-page book-right" });
  const book = el(
    "div",
    { id: "book", role: "dialog", "aria-modal": "true", "aria-label": BOOK_NAME, hidden: "" },
    el("div", { class: "book-cover" }, el("div", { class: "book-bar" }, backButton, contentsButton, running, closeButton), el("div", { class: "book-spread" }, left, right)),
  );
  (stage.closest("#app") ?? stage).append(book);

  // ── What the pages are made from ──────────────────────────────────────────

  const worlds = new Map<WorldKey, Promise<World>>();
  const indexes = new Map<WorldKey, Promise<SearchIndex>>();
  const kept = <T>(shelfOf: Map<WorldKey, Promise<T>>, key: WorldKey, load: () => Promise<T>) => {
    let file = shelfOf.get(key);
    if (!file) {
      file = load();
      file.catch(() => shelfOf.delete(key)); // so a file that did not come can be asked for again
      shelfOf.set(key, file);
    }
    return file;
  };
  const def = (key: WorldKey): WorldDef => WORLDS[key];
  const worldOf = (key: WorldKey) => kept(worlds, key, () => (def(key).provider ? def(key).provider!.world(null) : loadWorldFrom(def(key).source)));
  const indexOf = (key: WorldKey) => kept(indexes, key, () => (def(key).provider ? def(key).provider!.search(null) : loadSearchFrom(def(key).source)));
  const titleOf = (key: WorldKey) => CHAPTERS.find((chapter) => chapter.key === key)?.title ?? def(key).name;
  const stages = (key: WorldKey): Record<string, string> => ({ ...SHARED_STAGES, ...def(key).words.stages });
  let rooms: Promise<Record<string, ChamberEntry>> | undefined;
  const chambers = () => (rooms ??= loadChambers().catch((): Record<string, ChamberEntry> => ({})));

  // ── The parts a page is built from ────────────────────────────────────────

  let trail: Leaf[] = [];
  const go = (leaf: Leaf) => {
    trail.push(leaf);
    void render();
  };
  /** The same page turned to another of its pages: it takes the place of the one it follows. */
  const turn = (leaf: Leaf) => {
    trail[trail.length - 1] = leaf;
    void render();
  };

  /** A line of a list that leads somewhere: what it is, a note under it, and a figure at its right. */
  const entry = (title: Child, note: string, figure: string, onClick: () => void) => {
    const button = el("button", { type: "button", class: "book-entry" }, el("span", { class: "book-entry-words" }, el("span", { class: "book-entry-title" }, title), note && el("span", { class: "book-entry-note" }, note)), figure && el("span", { class: "book-entry-figure" }, figure));
    button.addEventListener("click", onClick);
    return el("li", {}, button);
  };
  const list = (...rows: Child[]) => el("ul", { class: "book-list" }, ...rows);
  const action = (words: string, onClick: () => void) => {
    const button = el("button", { type: "button", class: "book-action" }, words);
    button.addEventListener("click", onClick);
    return button;
  };
  const outside = (words: string, url: string) => el("a", { href: url, target: "_blank", rel: "noopener" }, words);
  /** "Page 2 of 7", with the way to the pages on either side. */
  const pager = (page: number, pages: number, to: (page: number) => Leaf) =>
    pages < 2
      ? null
      : el("div", { class: "book-pager" }, page > 0 ? action("← Earlier page", () => turn(to(page - 1))) : el("span"), el("span", {}, `Page ${page + 1} of ${pages}`), page < pages - 1 ? action("Next page →", () => turn(to(page + 1))) : el("span"));
  /** Close the book and go somewhere on the map, or into a world. */
  const leave = (onward: () => void) => {
    shut();
    onward();
  };

  const itemRow = (key: WorldKey, world: World, bill: Bill) => {
    const person = personName(world.members.find((member) => member.id === bill.sponsor));
    return entry(el("span", {}, el("b", {}, billLabel(bill)), ` ${bill.title}`), [person, bill.last_action.date && niceDate(bill.last_action.date)].filter(Boolean).join(" · "), "", () => go({ at: "item", key, id: bill.id }));
  };

  /** The left-hand page of a world's chapter: what it is, and its items by where they stand. */
  function worldPage(key: WorldKey, world: World): Child[] {
    const words = def(key).words;
    const overview = words.overview(world);
    const names = stages(key);
    const counts = new Map<string, number>();
    for (const bill of world.bills) counts.set(bill.loc.kind, (counts.get(bill.loc.kind) ?? 0) + 1);
    const order = [...Object.keys(names).filter((kind) => counts.has(kind)), ...[...counts.keys()].filter((kind) => !(kind in names))];
    const form = el("form", { class: "book-search" }, el("input", { type: "search", name: "words", placeholder: words.searchHint, "aria-label": `Search every ${words.item}` }), el("button", { type: "submit" }, "Search"));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const asked = String(new FormData(form).get("words") ?? "").trim();
      if (asked) go({ at: "search", key, words: asked });
    });
    return [
      el("p", { class: "book-kicker" }, words.period(world)),
      el("h1", {}, titleOf(key)),
      el("p", { class: "book-stamp" }, words.stamp(world, niceDate(world.data_through))),
      el("p", {}, overview.lead),
      form,
      el("h2", {}, overview.where),
      list(...order.map((kind) => entry(names[kind] ?? kind, "", whole(counts.get(kind)!), () => go({ at: "stage", key, kind })))),
      el("p", { class: "book-actions" }, world.members.length ? action(def(key).legislature ? "Its members" : "Its people", () => go({ at: "people", key })) : null, action("Go into this world →", () => leave(() => travel(key)))),
    ];
  }

  async function worldSpread(key: WorldKey): Promise<Spread> {
    const world = await worldOf(key);
    const byId = new Map(world.bills.map((bill) => [bill.id, bill]));
    const latest = [...world.events].sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq).filter((event) => byId.has(event.bill)).slice(0, LINES);
    return {
      running: titleOf(key),
      left: worldPage(key, world),
      right: [
        el("h2", {}, "The latest"),
        latest.length
          ? list(...latest.map((event) => entry(el("span", {}, el("b", {}, billLabel(byId.get(event.bill)!)), ` ${event.text}`), `${niceDate(event.date)} · ${byId.get(event.bill)!.title}`, "", () => go({ at: "item", key, id: event.bill }))))
          : el("p", { class: "book-quiet" }, "Nothing has moved in the days this file covers."),
      ],
    };
  }

  async function stageSpread(leaf: Extract<Leaf, { at: "stage" }>): Promise<Spread> {
    const world = await worldOf(leaf.key);
    const here = world.bills.filter((bill) => bill.loc.kind === leaf.kind).sort((a, b) => b.last_action.date.localeCompare(a.last_action.date));
    const shown = pageOf(here, leaf.page ?? 0);
    const name = stages(leaf.key)[leaf.kind] ?? leaf.kind;
    return {
      running: `${titleOf(leaf.key)} · ${name}`,
      left: worldPage(leaf.key, world),
      right: [el("h2", {}, name), el("p", { class: "book-quiet" }, `${whole(here.length)} ${here.length === 1 ? def(leaf.key).words.item : def(leaf.key).words.items}, the latest to move first`), list(...shown.rows.map((bill) => itemRow(leaf.key, world, bill))), pager(shown.page, shown.pages, (page) => ({ ...leaf, page }))],
    };
  }

  async function peopleSpread(leaf: Extract<Leaf, { at: "people" }>): Promise<Spread> {
    const world = await worldOf(leaf.key);
    const people = world.members.filter((member) => !member.left).sort((a, b) => b.n_total - a.n_total || a.name.localeCompare(b.name));
    const shown = pageOf(people, leaf.page ?? 0);
    const heading = def(leaf.key).legislature ? "Members" : "People";
    return {
      running: `${titleOf(leaf.key)} · ${heading}`,
      left: worldPage(leaf.key, world),
      right: [
        el("h2", {}, heading),
        el("p", { class: "book-quiet" }, `${whole(people.length)}, those with the most ${def(leaf.key).words.items} to their name first`),
        list(...shown.rows.map((member) => entry(personName(member), [member.role, member.group, member.chamber].filter(Boolean).join(" · "), member.n_total ? whole(member.n_total) : "", () => go({ at: "person", key: leaf.key, id: member.id })))),
        pager(shown.page, shown.pages, (page) => ({ ...leaf, page })),
      ],
    };
  }

  async function personSpread(leaf: Extract<Leaf, { at: "person" }>): Promise<Spread> {
    const world = await worldOf(leaf.key);
    const member = world.members.find((one) => one.id === leaf.id);
    if (!member) throw new Error("nobody of that name is in this chapter");
    const words = def(leaf.key).words;
    const theirs = world.bills.filter((bill) => bill.sponsor === member.id).sort((a, b) => b.last_action.date.localeCompare(a.last_action.date));
    const shown = pageOf(theirs, leaf.page ?? 0);
    const line = words.memberLine?.(member) ?? [def(leaf.key).legislature?.title(member), member.role, member.state && (member.district ? `${member.state}-${member.district}` : member.state)].filter(Boolean).join(" · ");
    return {
      running: `${titleOf(leaf.key)} · ${member.name}`,
      left: [
        el("p", { class: "book-kicker" }, titleOf(leaf.key)),
        el("h1", {}, member.name),
        el("p", {}, line),
        el("dl", { class: "book-figures" }, ...[[`${words.items[0].toUpperCase()}${words.items.slice(1)} in all`, whole(member.n_total)], ["Of those, lately active", whole(member.n_world)]].flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value)])),
        el("p", { class: "book-actions" }, action("Find them in the world →", () => leave(() => travel(leaf.key, member.id)))),
      ],
      right: [
        el("h2", {}, `${words.items[0].toUpperCase()}${words.items.slice(1)} of theirs that have lately moved`),
        theirs.length ? list(...shown.rows.map((bill) => itemRow(leaf.key, world, bill))) : el("p", { class: "book-quiet" }, "None in the days this file covers."),
        pager(shown.page, shown.pages, (page) => ({ ...leaf, page })),
      ],
    };
  }

  async function itemSpread(leaf: Extract<Leaf, { at: "item" }>): Promise<Spread> {
    const world = await worldOf(leaf.key);
    const words = def(leaf.key).words;
    const bill = world.bills.find((one) => one.id === leaf.id);
    const onMap = action("See it in the world →", () => leave(() => travel(leaf.key, undefined, `bill=${leaf.id}`)));
    if (!bill) {
      // Not among those the map shows: what the index of every item knows of it.
      const index = await indexOf(leaf.key);
      const n = index.id.indexOf(leaf.id);
      if (n < 0) throw new Error(`there is no ${words.item} ${leaf.id} in this chapter`);
      const names = index.sponsor_names ?? index.sponsors;
      return {
        running: `${titleOf(leaf.key)} · ${leaf.id}`,
        left: [el("p", { class: "book-kicker" }, titleOf(leaf.key)), el("h1", {}, index.title[n]), el("dl", { class: "book-figures" }, ...[[words.person, names[index.sponsor[n]] ?? ""], ["Where it stands", index.statuses[index.status[n]] ?? ""], ["Last action", niceDate(index.date[n])]].filter(([, value]) => value).flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value)]))],
        right: [el("p", { class: "book-quiet" }, `This ${words.item} has not moved lately, so the book has only its line in the index. The world has the rest.`), el("p", { class: "book-actions" }, onMap)],
      };
    }
    const person = world.members.find((member) => member.id === bill.sponsor);
    const committee = world.committees.find((one) => one.code === bill.loc.committee)?.name ?? "";
    const where = [stages(leaf.key)[bill.loc.kind] ?? bill.loc.kind, committee].filter(Boolean).join(": ");
    const who = person ? action(personName(person), () => go({ at: "person", key: leaf.key, id: person.id })) : (bill.author ?? words.noPerson?.(bill) ?? "");
    const facts: [string, Child][] = [
      [words.personHeading?.(bill) ?? words.person, who],
      ["Where it stands", where],
      ["Status", bill.status],
      ["Introduced", niceDate(bill.introduced)],
      ["About", bill.policy_area],
    ];
    return {
      running: `${titleOf(leaf.key)} · ${billLabel(bill)}`,
      left: [
        el("p", { class: "book-kicker" }, billLabel(bill)),
        el("h1", { class: "book-item-title" }, bill.title),
        el("dl", { class: "book-figures" }, ...facts.filter(([, value]) => value).flatMap(([label, value]) => [el("dt", {}, label), el("dd", {}, value)])),
        el("p", { class: "book-actions" }, onMap, bill.url ? outside(words.readMore?.(bill) ?? "Read it at the source ↗", bill.url) : null),
      ],
      right: [
        el("h2", {}, words.actionHeading ?? "Latest action"),
        el("p", {}, el("b", {}, niceDate(bill.last_action.date)), bill.last_action.text ? ` · ${bill.last_action.text}` : ""),
        bill.summary ? el("h2", {}, "What it is") : null,
        ...bill.summary.split(/\n{2,}/).filter(Boolean).map((part) => el("p", {}, part)),
        bill.summary.endsWith("…") ? el("p", { class: "book-quiet" }, "The summary is cut short here. The world has the whole of it.") : null,
      ],
    };
  }

  async function searchSpread(leaf: Extract<Leaf, { at: "search" }>): Promise<Spread> {
    const [world, index] = await Promise.all([worldOf(leaf.key), indexOf(leaf.key)]);
    const words = def(leaf.key).words;
    const answer = found(index, leaf.words);
    const names = index.sponsor_names ?? index.sponsors;
    return {
      running: `${titleOf(leaf.key)} · Search`,
      left: worldPage(leaf.key, world),
      right: [
        el("h2", {}, `“${leaf.words}”`),
        el("p", { class: "book-quiet" }, answer.total > answer.rows.length ? `${whole(answer.total)} ${words.items} of ${whole(index.id.length)}; the ${answer.rows.length} that moved most lately` : `${whole(answer.total)} of ${whole(index.id.length)} ${words.items}`),
        list(...answer.rows.map((n) => entry(index.title[n], [names[index.sponsor[n]], index.statuses[index.status[n]], niceDate(index.date[n])].filter(Boolean).join(" · "), "", () => go({ at: "item", key: leaf.key, id: index.id[n] })))),
      ],
    };
  }

  /** A place's own page: its figures on the left, and on the right what it is made of and who governs it. */
  async function placeSpread(leaf: Extract<Leaf, { at: "place" }>): Promise<Spread> {
    const [chain, open] = await Promise.all([loadPlace(leaf.id), chambers()]);
    const place = chain[0];
    const state = leaf.id === NATION ? undefined : stateOfCounty(leaf.id);
    const isDistrict = (one: PlaceFacts) => /district/i.test(one.kind) && one.id.includes("US");
    let parts: PlaceFacts[] = [];
    let districts: PlaceFacts[] = [];
    let partsName = "";
    if (leaf.id === NATION) [parts, partsName] = [await loadStates(), "The states"];
    else if (state && place.kind !== "city" && place.kind !== "community") {
      const within = (await loadPlacesIn(state.code)).filter((one) => one.parent_id === leaf.id);
      districts = within.filter((one) => isDistrict(one));
      // A few small communities are filed under the state itself; a state's own page lists its counties.
      if (leaf.part === "districts") [parts, partsName] = [districts, "Its districts in Congress"];
      else if (place.kind === "county") [parts, partsName] = [within.filter((one) => !isDistrict(one)), "Its cities and communities"];
      else [parts, partsName] = [within.filter((one) => one.kind === "county"), "Its counties"];
    }
    if (leaf.part === "districts") parts.sort((a, b) => Number(a.district ?? 0) - Number(b.district ?? 0));
    else parts.sort((a, b) => Number(b.population ?? 0) - Number(a.population ?? 0) || a.name.localeCompare(b.name));
    const shown = pageOf(parts, leaf.page ?? 0);
    // Where on the map this place is, as the map's own address names it.
    const onMap =
      leaf.id === NATION || !state ? ""
      : isDistrict(place) ? `#congress=${state.code}.${leaf.id.slice(leaf.id.indexOf("US") + 2)}`
      : place.kind === "county" ? `#county=${leaf.id}`
      : leaf.id.length === 2 ? `#state=${state.code}`
      : place.parent_id?.length === 5 ? `#city=${place.parent_id}.${leaf.id}`
      : "";
    const represented = typeof place.representative === "string" && place.representative ? `${place.representative}${place.representative_party ? ` (${String(place.representative_party)[0]})` : ""}` : "";
    const governed: Child[] = [];
    if (leaf.id === NATION) for (const key of ["capitol", "whitehouse", "court"] as const) governed.push(entry(titleOf(key), CHAPTERS.find((chapter) => chapter.key === key)!.about, "", () => go({ at: "world", key })));
    if (leaf.id.length === 2 && state?.world && state.world !== "capitol") governed.push(entry(titleOf(state.world), "Its bills, by where they stand", "", () => go({ at: "world", key: state.world! })));
    const room = open[leaf.id];
    if (leaf.id.length === 2 && districts.length && leaf.part !== "districts") governed.push(entry("Its districts in Congress", "Each with its representative and its own figures", whole(districts.length), () => go({ at: "place", id: leaf.id, part: "districts" })));
    if (room) governed.push(entry(room.name, `Its ${room.room.toLowerCase()}: meetings and votes since ${room.since}`, "", () => leave(() => travel(`chamber:${leaf.id}`))));
    const figures = placeFigures(chain);
    // The same figures for each place this one is part of, so a city can be read against its county, state and country.
    const beside = chain.map((_, n) => new Map(placeFigures(chain.slice(n)).map((figure) => [figure.label.replace(/ \(.*\)$/, ""), figure.value])));
    const shared = [...beside[0].keys()].filter((label) => !/^Vote for president/.test(label) && beside.slice(1).some((other) => other.has(label)));
    const compared =
      chain.length > 1 && shared.length
        ? el(
            "table",
            { class: "book-table" },
            el("thead", {}, el("tr", {}, el("th", {}), ...chain.map((one) => el("th", { scope: "col" }, one.name)))),
            el("tbody", {}, ...shared.map((label) => el("tr", {}, el("th", { scope: "row" }, label), ...beside.map((figuresOf) => el("td", {}, figuresOf.get(label) ?? "–"))))),
          )
        : null;
    return {
      running: chain.map((one) => one.name).reverse().join(" · "),
      left: [
        el("p", { class: "book-kicker" }, leaf.id === NATION ? "The country" : `${place.kind[0].toUpperCase()}${place.kind.slice(1)}${chain[1] ? ` in ${chain[1].name}` : ""}`),
        el("h1", {}, place.name),
        place.seat ? el("p", {}, `${leaf.id.length === 2 ? "Its capital is" : "Its government sits in"} ${String(place.seat).replace(/\.$/, "")}.`) : null,
        represented ? el("p", {}, `Represented in Congress by ${represented}.`) : null,
        figures.length ? el("dl", { class: "book-figures" }, ...figures.flatMap((figure) => [el("dt", {}, figure.label), el("dd", {}, figure.value)])) : el("p", { class: "book-quiet" }, "No figures are kept for this place."),
        el("p", { class: "book-actions" }, onMap ? action("Show it on the map →", () => leave(() => (location.hash = onMap))) : null, chain[1] ? action(`↑ ${chain[1].name}`, () => go({ at: "place", id: chain[1].id })) : null),
      ],
      right: [
        governed.length ? el("h2", {}, "Who governs it") : null,
        governed.length ? list(...governed) : null,
        parts.length ? el("h2", {}, partsName) : null,
        parts.length ? el("p", { class: "book-quiet" }, leaf.part === "districts" ? `${whole(parts.length)}, in their order` : `${whole(parts.length)}, the most peopled first`) : null,
        list(...shown.rows.map((one) => entry(one.name, isDistrict(one) ? String(one.representative ?? "") : one.kind === "city" || one.kind === "community" ? one.kind : "", typeof one.population === "number" ? whole(one.population) : "", () => go({ at: "place", id: one.id })))),
        pager(shown.page, shown.pages, (page) => ({ ...leaf, page })),
        compared ? el("h2", {}, "Beside what it is part of") : null,
        compared ? el("div", { class: "book-wide" }, compared) : null, // a table of four places is wider than a phone's page
      ],
    };
  }

  async function roomsSpread(): Promise<Spread> {
    const open = await chambers();
    const ids = Object.keys(open).sort((a, b) => open[a].name.localeCompare(open[b].name));
    return {
      running: "Boards and councils",
      left: [
        el("p", { class: "book-kicker" }, "Local government"),
        el("h1", {}, "Boards and councils"),
        el("p", {}, "A county’s board of supervisors and a city’s council each sit in one room. The rooms that are open hold every meeting on record, what was on its agenda, and how each member voted."),
        el("p", { class: "book-quiet" }, "A room is somewhere to go and look round, so these lines lead out of the book and into it."),
      ],
      right: [el("h2", {}, "The rooms that are open"), ids.length ? list(...ids.map((id) => entry(open[id].name, `${open[id].place} · since ${open[id].since}`, "", () => leave(() => travel(`chamber:${id}`))))) : el("p", { class: "book-quiet" }, "None could be listed just now.")],
    };
  }

  function contentsSpread(): Spread {
    return {
      running: "Contents",
      left: [
        el("p", { class: "book-kicker" }, "Capitol World"),
        el("h1", { class: "book-title" }, BOOK_NAME),
        el("p", {}, "Everything on the map, to be read instead of walked through: the country and each place in it, and what each branch of its government has in hand."),
        el("p", {}, "Pick a chapter. Any page can take you back onto the map, or into the world it is about."),
        el("p", { class: "book-quiet" }, "The book keeps nothing of its own. It reads the same public datasets the worlds do, and they are brought up to date each day."),
      ],
      right: [
        el("h2", {}, "Contents"),
        list(
          entry("The United States", "The country, its states, their counties and cities, with the figures for each", "", () => go({ at: "place", id: NATION })),
          ...CHAPTERS.map((chapter) => entry(chapter.title, chapter.about, "", () => go({ at: "world", key: chapter.key }))),
          entry("Boards and councils", "County boards and city councils that have a room", "", () => go({ at: "rooms" })),
        ),
        el("h2", {}, "A state, straight away"),
        el("p", { class: "book-states" }, ...STATES.filter((place) => place.kind !== "territory").flatMap((place) => {
          const link = action(place.code, () => void loadStates().then((states) => go({ at: "place", id: states.find((one) => one.name === place.name)?.id ?? NATION })));
          link.title = place.name;
          return [link, " "];
        })),
      ],
    };
  }

  const spreadOf = (leaf: Leaf): Promise<Spread> | Spread =>
    leaf.at === "contents" ? contentsSpread()
    : leaf.at === "place" ? placeSpread(leaf)
    : leaf.at === "world" ? worldSpread(leaf.key)
    : leaf.at === "stage" ? stageSpread(leaf)
    : leaf.at === "people" ? peopleSpread(leaf)
    : leaf.at === "person" ? personSpread(leaf)
    : leaf.at === "item" ? itemSpread(leaf)
    : leaf.at === "search" ? searchSpread(leaf)
    : roomsSpread();

  // ── Opening, turning and closing ──────────────────────────────────────────

  let turned = 0;
  async function render() {
    const asked = ++turned;
    const leaf = trail[trail.length - 1];
    backButton.hidden = trail.length < 2;
    contentsButton.hidden = leaf.at === "contents";
    book.classList.add("turning");
    let spread: Spread;
    try {
      spread = await spreadOf(leaf);
    } catch (error) {
      spread = { running: BOOK_NAME, left: [el("h1", {}, "This page would not open"), el("p", {}, "What it is made from could not be read just now. The rest of the book is as it was.")], right: [el("p", { class: "book-quiet" }, error instanceof Error ? error.message : String(error))] };
    }
    if (asked !== turned || signal.aborted) return;
    running.textContent = spread.running;
    put(left, ...spread.left);
    put(right, ...spread.right);
    left.scrollTop = right.scrollTop = 0;
    book.classList.remove("turning");
  }

  function open(leaf: Leaf = { at: "contents" }) {
    trail = leaf.at === "contents" ? [leaf] : [{ at: "contents" }, leaf];
    book.hidden = false;
    shelf.setAttribute("aria-expanded", "true");
    closeButton.focus();
    void render();
  }
  function shut() {
    if (book.hidden) return;
    book.hidden = true;
    shelf.setAttribute("aria-expanded", "false");
    shelf.focus();
  }

  shelf.setAttribute("aria-expanded", "false");
  shelf.addEventListener("click", () => open(), { signal });
  closeButton.addEventListener("click", shut, { signal });
  contentsButton.addEventListener("click", () => {
    trail = [{ at: "contents" }];
    void render();
  }, { signal });
  backButton.addEventListener("click", () => {
    if (trail.length > 1) trail.pop();
    void render();
  }, { signal });
  book.addEventListener("click", (event) => event.target === book && shut(), { signal }); // a click on the table round the book
  addEventListener("keydown", (event) => {
    if (book.hidden) return;
    if (event.key === "Escape") shut();
    // The map under the book has keys of its own; none of them is meant while the book is open.
    event.stopPropagation();
  }, { signal, capture: true });
  signal.addEventListener("abort", () => book.remove());

  return { show: (visible) => (shelf.hidden = !visible), open };
}
