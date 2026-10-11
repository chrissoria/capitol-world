// The panel beside the maps of the United States: the list of places, a state's card with the people
// it sends to Congress and its counties, and the cards of one county and of a capital. The people
// come from Capitol World's own file; the maps work without it.

import type { Member } from "../data/types";
import { ordinal } from "../data/types";
import { el, put } from "../ui/dom";
import { WORLDS } from "../worlds";
import type { WorldKey } from "../worlds/types";
import type { StateFile } from "./sheet";
import { COUNTY_WORLDS, STATE, STATES, countyName, countyWords, hasCounties, type StateInfo } from "./states";

export interface AtlasActions {
  /** Back to the map of the whole country, with nothing picked. */
  home(): void;
  /** Open a place: a state's own map, or the card of the District or a territory. */
  open(code: string): void;
  /** Pick a county on the state map that is open (null for none). */
  county(fips: string | null): void;
  /** Go to a place's capital: into its world if it has one. */
  capital(code: string): void;
  /** Go into a world, to one of its people if `member` is given. */
  travel(world: WorldKey, member?: string): void;
}

const KIND: Record<StateInfo["kind"], string> = { state: "State", district: "Federal district", territory: "Territory" };
const partyName = (party: string) => (party === "R" ? "Republican" : party === "D" ? "Democrat" : party ? "Independent" : "");
const pin = (party: string) => el("span", { class: `pin ${party}`, title: partyName(party) });
const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const fact = (label: string, value: string) => (value ? el("div", {}, el("dt", {}, label), el("dd", {}, value)) : null);

export function createAtlasPanel(actions: AtlasActions) {
  const section = document.getElementById("tab-inspect")!;
  // One tab's worth of panel: the tabs themselves belong to the worlds.
  document.getElementById("tabs")!.hidden = true;
  for (const tab of document.querySelectorAll<HTMLElement>(".tab")) tab.hidden = tab !== section;

  let known = false; // whether the list of members has arrived
  const delegation = new Map<string, { senators: Member[]; house: Member[] }>();

  /** What the people a place sends to the House are called. */
  const houseTitle = (place: StateInfo, n: number) =>
    place.kind === "state" ? (n === 1 ? "representative" : "representatives") : place.code === "PR" ? "resident commissioner" : "delegate";
  const seatsLine = (place: StateInfo) => {
    const seats = delegation.get(place.code);
    if (!seats) return "";
    return [seats.senators.length ? count(seats.senators.length, "senator") : "", seats.house.length ? `${seats.house.length} ${houseTitle(place, seats.house.length)}` : ""].filter(Boolean).join(" · ");
  };

  const door = (world: WorldKey) => {
    const go = el("button", { type: "button", class: "door" }, `Enter ${WORLDS[world].name} →`);
    go.addEventListener("click", () => actions.travel(world));
    return el("p", {}, go);
  };
  const back = (label: string, go: () => void) => {
    const button = el("button", { type: "button", class: "back" }, `← ${label}`);
    button.addEventListener("click", go);
    return el("div", { class: "trail" }, button);
  };
  const row = (title: string, sub: string, go: () => void, mark = "") => {
    const button = el(
      "button",
      { type: "button" },
      mark ? el("span", { class: "bar-row" }, el("span", { class: "row-title" }, title), el("span", { class: "count" }, mark)) : el("span", { class: "row-title" }, title),
      sub ? el("span", { class: "row-sub" }, sub) : null,
    );
    button.addEventListener("click", go);
    return el("li", {}, button);
  };

  function memberRow(member: Member, place: StateInfo) {
    const seat =
      member.chamber === "Senate"
        ? "Senator"
        : place.kind !== "state"
          ? houseTitle(place, 1).replace(/^./, (first) => first.toUpperCase())
          : member.district
            ? `${ordinal(member.district)} district`
            : "At large";
    const button = el(
      "button",
      { type: "button" },
      el("span", { class: "row-title" }, pin(member.party), member.name),
      el("span", { class: "row-sub" }, [seat, partyName(member.party)].filter(Boolean).join(" · ")),
    );
    button.addEventListener("click", () => actions.travel("capitol", member.id));
    return el("li", {}, button);
  }

  /** The people a place sends to Congress, as the lower part of its card. */
  function people(place: StateInfo) {
    const seats = delegation.get(place.code);
    return [
      ...(seats?.senators.length ? [el("h3", {}, "Senators"), el("ul", { class: "list" }, ...seats.senators.map((member) => memberRow(member, place)))] : []),
      ...(seats?.house.length
        ? [el("h3", {}, place.kind === "state" ? "Representatives" : "In the House"), el("ul", { class: "list" }, ...seats.house.map((member) => memberRow(member, place)))]
        : []),
      seats ? el("p", { class: "note" }, "Pick a member to find them in Capitol World.") : known ? null : el("p", { class: "note" }, "The list of members has not loaded."),
    ];
  }

  /** The facts every place's card has. */
  function facts(place: StateInfo, more: (HTMLElement | null)[] = []) {
    const seats = delegation.get(place.code);
    const moving = [...(seats?.senators ?? []), ...(seats?.house ?? [])].reduce((sum, member) => sum + (member.n_world ?? 0), 0);
    return el(
      "dl",
      { class: "facts" },
      fact("Capital", place.capital),
      fact("Joined", place.joined ? `${place.joined} · the ${ordinal(place.order!)} state` : ""),
      ...more,
      fact("In Congress", seatsLine(place)),
      fact("Bills moving", moving ? `${count(moving, "bill")} from these members had an action in the last 30 days` : ""),
    );
  }

  const show = (...children: (Node | string | null | undefined | false)[]) => {
    put(section, ...children);
    section.scrollTop = 0;
  };

  return {
    /** The members of Congress have arrived: who each place sends. */
    setMembers(members: Member[]) {
      known = true;
      delegation.clear();
      for (const member of members) {
        if (!STATE[member.state]) continue;
        if (!delegation.has(member.state)) delegation.set(member.state, { senators: [], house: [] });
        const seats = delegation.get(member.state)!;
        (member.chamber === "Senate" ? seats.senators : seats.house).push(member);
      }
      for (const seats of delegation.values()) {
        seats.senators.sort((a, b) => a.name.localeCompare(b.name));
        seats.house.sort((a, b) => (a.district ?? 0) - (b.district ?? 0) || a.name.localeCompare(b.name));
      }
    },

    /** The whole country: every place, listed. */
    overview() {
      const total = [...delegation.values()].reduce((sum, seats) => sum + seats.senators.length + seats.house.length, 0);
      const list = (kind: StateInfo["kind"]) =>
        STATES.filter((place) => place.kind === kind)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((place) => row(place.name, seatsLine(place), () => actions.open(place.code), place.world ? "★" : ""));
      show(
        el("h2", {}, "The United States"),
        el("p", {}, total
          ? `Fifty states, the District of Columbia and five territories send ${total.toLocaleString()} people to Congress. Pick a place to see who.`
          : "Fifty states, the District of Columbia and five territories. Pick a place to see it."),
        el("p", { class: "note" }, "Click a state to open its own map, with its counties. A star marks each capital: a gold one leads into a world, and a white one is a capital whose world is not built yet. Drag to move around; scroll or pinch to zoom."),
        door("capitol"),
        el("h3", {}, "The capital"),
        el("ul", { class: "list" }, ...list("district")),
        el("h3", {}, "States"),
        el("ul", { class: "list" }, ...list("state")),
        el("h3", {}, "Territories"),
        el("ul", { class: "list" }, ...list("territory")),
      );
    },

    /** The District or a territory, which have no map of their own; or a state whose map could not be loaded. */
    place(place: StateInfo) {
      show(
        back("All states", actions.home),
        el("div", { class: "kicker" }, KIND[place.kind]),
        el("h2", {}, place.name),
        place.world
          ? door(place.world)
          : el("p", { class: "note" }, hasCounties(place) ? `The map of ${place.name} could not be loaded.` : `${place.name} has no world of its own yet. When it does, the star on ${place.capital} will lead straight in.`),
        facts(place),
        ...people(place),
      );
    },

    /** A state, on its own map: its facts, its people and its counties. */
    state(place: StateInfo, file: StateFile) {
      const [, many] = countyWords(place.code);
      const counties = file.ids
        .map((fips, n) => ({ fips, ...countyName(fips, file.names[n]) }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((county) => row(county.name, "", () => actions.county(county.fips), COUNTY_WORLDS[county.fips] ? "★" : ""));
      const capital = el("button", { type: "button", class: place.world ? "door" : "" }, place.world ? `Enter ${WORLDS[place.world].name} →` : `★ ${place.capital}, the capital`);
      capital.addEventListener("click", () => actions.capital(place.code));
      show(
        back("United States", actions.home),
        el("div", { class: "kicker" }, KIND[place.kind]),
        el("h2", {}, place.name),
        el("p", { class: "note" }, `Click one of its ${many} on the map, or the star on ${place.capital}.`),
        el("p", {}, capital),
        facts(place, [fact(many.replace(/^./, (first) => first.toUpperCase()), String(file.ids.length))]),
        ...people(place),
        el("h3", {}, `${file.ids.length} ${many}`),
        el("ul", { class: "list" }, ...counties),
      );
    },

    /** One county of the state whose map is open. */
    county(place: StateInfo, file: StateFile, fips: string) {
      const county = countyName(fips, file.names[file.ids.indexOf(fips)] ?? "");
      const world = COUNTY_WORLDS[fips];
      show(
        back(place.name, () => actions.county(null)),
        el("div", { class: "kicker" }, county.kind),
        el("h2", {}, county.name),
        world ? door(world) : el("p", { class: "note" }, `${county.name} has no world of its own yet. When it does, this is where the way in will be.`),
        el("dl", { class: "facts" }, fact("State", place.name), fact("Census code", fips)),
      );
    },

    /** A state's capital, whose capitol has no world yet. */
    capital(place: StateInfo, file: StateFile) {
      const under = file.ids[stateCountyAt(file, file.capital[0], file.capital[1]) - 1];
      const county = under ? countyName(under, file.names[file.ids.indexOf(under)]) : null;
      const inCounty = county ? el("button", { type: "button" }, county.name) : null;
      inCounty?.addEventListener("click", () => actions.county(under));
      show(
        back(place.name, () => actions.county(null)),
        el("div", { class: "kicker" }, "State capital"),
        el("h2", {}, place.capital),
        el("p", {}, `${place.capital} is the capital of ${place.name}.`),
        el("p", { class: "note" }, `Its capitol has no world of its own yet. When it does, the star will turn gold and lead straight in, as the one on Washington leads into Capitol World.`),
        inCounty ? el("h3", {}, "It is in") : null,
        inCounty ? el("ul", { class: "list" }, el("li", {}, inCounty)) : null,
      );
    },
  };
}

/** The number of the county at a square of a state's file (0 for none), read from its runs. */
function stateCountyAt(file: StateFile, x: number, y: number): number {
  let left = Math.floor(y) * file.w + Math.floor(x);
  for (let i = 0; i + 1 < file.runs.length; i += 2) {
    if (left < file.runs[i + 1]) return file.runs[i];
    left -= file.runs[i + 1];
  }
  return 0;
}
