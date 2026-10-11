// The maps of the United States as a page of their own: the scene, the panel beside it, and the
// buttons they share with the worlds. Opened with `?world=usa`. The address can name a state
// (`#state=CA`), a county (`#county=06037`), a city (`#city=06073.0666000`, the county and then the
// place) or a capital (`#capital=CA`).
//
// A click on a state opens that state's own map, with its counties. Where the counties have maps of
// their own (California's do), a click on a county opens it, with its cities. A star is a capitol, a
// triangle is where a county's government sits, and a dot is a city hall; a gold one leads straight
// into the world or the chamber behind it.

import { loadWorld } from "../data/load";
import { ordinal } from "../data/types";
import { niceDate } from "../ui/dom";
import { loadChambers, type ChamberEntry } from "../worlds/chamber";
import type { Destination } from "../worlds/types";
import { nationExtras } from "./art";
import { createAtlasPanel } from "./panel";
import { startAtlas, type Hit, type SheetView } from "./scene";
import { CAPITALS, TERRITORY_BOX } from "./shapes";
import { isUnincorporated, loadCounty, loadState, nationSheet, stateSheet, type CountyFile, type StateFile } from "./sheet";
import { STATE, STATES, countyName, countyWords, hasCities, hasCounties, stateOfCounty, type StateInfo } from "./states";

export const ATLAS_NAME = "United States";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface AtlasContext {
  /** Ends when the page moves on to something else. */
  signal: AbortSignal;
  /** Go into a world, to one of its people if `member` is given; or into a board's or a council's chamber. */
  travel(world: Destination, member?: string): void;
}

/** What the visitor has picked on the map that is open. */
type Picked = { kind: "place"; code: string } | { kind: "county"; fips: string } | { kind: "capital" } | { kind: "city"; id: string } | null;

const capitalLine = (place: StateInfo) => (place.code === "DC" ? "Washington, D.C." : `${place.capital}, capital of ${place.name}`);

function nationView(): SheetView {
  return {
    sheet: nationSheet(),
    names: STATES.map((place) => ({
      id: place.code,
      full: place.callout !== undefined || place.label ? "" : place.name,
      short: place.code,
      at: place.label,
      column: place.callout,
      // The territories' names stand close together, and from far away they would run into one another.
      hideBelow: place.kind === "territory" ? 0.24 : 0,
    })),
    stars: STATES.map((place) => ({ id: place.code, x: CAPITALS[place.code][0], y: CAPITALS[place.code][1], gold: Boolean(place.world), big: place.kind === "district" })),
    column: { x: 340, y: 82 },
    heading: { text: "Territories", x: TERRITORY_BOX.x + TERRITORY_BOX.w / 2, y: TERRITORY_BOX.y + 1 },
    tiny: 20,
    extras: nationExtras,
    caption: (hit) => (hit.kind === "star" ? capitalLine(STATE[hit.id]) : STATE[hit.id].name),
  };
}

function stateView(place: StateInfo, file: StateFile, chambers: Record<string, ChamberEntry>): SheetView {
  const name = (fips: string) => countyName(fips, file.names[file.ids.indexOf(fips)] ?? "").name;
  const sheet = stateSheet(file);
  // A county whose board has a room wears a gold triangle, so the board can be reached without opening the county.
  const boards = file.ids.filter((fips) => chambers[fips]).map((fips) => {
    const heart = sheet.shapes.get(fips)!.heart;
    return { id: fips, x: heart.x + 0.5, y: heart.y + 0.5, gold: true, big: false, mark: "triangle" as const };
  });
  return {
    sheet,
    // No county wears its name: some would fit and most would not. Each is named beside the pointer instead.
    names: [],
    stars: [{ id: place.code, x: file.capital[0], y: file.capital[1], gold: Boolean(place.world), big: true }, ...boards],
    tiny: 4,
    caption: (hit) => (hit.kind !== "star" ? name(hit.id) : hit.id === place.code ? capitalLine(place) : chambers[hit.id]?.name ?? name(hit.id)),
  };
}

/** A county's own map: each city a shape with its name on it where there is room, a dot on each city hall, a triangle on the county's seat. */
function countyView(file: CountyFile, chambers: Record<string, ChamberEntry>): SheetView {
  const sheet = stateSheet(file);
  const county = countyName(file.code, file.name).name;
  const name = (id: string) => (isUnincorporated(id) ? `Unincorporated ${county}` : file.names[file.ids.indexOf(id)] ?? "");
  const halls = file.ids.filter((id) => !isUnincorporated(id)).map((id) => {
    const heart = sheet.shapes.get(id)!.heart;
    return { id, x: heart.x + 0.5, y: heart.y + 0.5, gold: Boolean(chambers[id]), big: false, mark: "dot" as const };
  });
  const seat = file.seat ? [...file.seat.at] : null;
  // Where the seat's own city hall is the same few squares, the triangle stands beside the dot rather than on it.
  const beside = seat && halls.find((hall) => Math.abs(hall.x - seat[0]) < 4 && Math.abs(hall.y - seat[1]) < 4);
  if (seat && beside) seat[0] = beside.x + (beside.x > sheet.w / 2 ? -5 : 5);
  return {
    sheet,
    names: file.ids.filter((id) => !isUnincorporated(id)).map((id) => ({ id, full: name(id), short: "" })),
    stars: [...halls, ...(seat ? [{ id: file.code, x: seat[0], y: seat[1], gold: Boolean(chambers[file.code]), big: true, mark: "triangle" as const }] : [])],
    tiny: 4,
    caption: (hit) => (hit.kind !== "star" ? name(hit.id) : hit.id === file.code ? chambers[file.code]?.name ?? `${county}: its government sits in ${file.seat?.name}` : chambers[hit.id]?.name ?? `${name(hit.id)} city hall`),
  };
}

export function openAtlas({ signal, travel }: AtlasContext): { destroy(): void } {
  document.querySelector("#hud-title strong")!.textContent = ATLAS_NAME;
  $("stamp").textContent = "Pick a state";
  $("loading").textContent = "Loading the map…";
  $("game").setAttribute("aria-label", "Map of the United States. The panel lists the same places.");
  const back = $<HTMLButtonElement>("back");
  back.textContent = "← United States";

  /** The state whose map is open; null on the map of the whole country. */
  let open: { place: StateInfo; file: StateFile } | null = null;
  /** The county whose map is open, inside that state; null on the state's own map. */
  let county: CountyFile | null = null;
  let chambers: Record<string, ChamberEntry> = {};
  let picked: Picked = null;
  let asked = 0; // counts the maps asked for, so that a slow one does not replace a later one
  let membersLine = "";

  const panel = createAtlasPanel({
    home: () => showNation(),
    open: (code) => openPlace(code),
    county: (fips) => (fips && open && hasCities(open.place) ? showCounty(open.place, fips) : pick(fips ? { kind: "county", fips } : null, true)),
    city: (id) => pick(id ? { kind: "city", id } : null, true),
    leaveCounty: () => open && showState(open.place),
    capital: (code) => goToCapital(code),
    travel,
  });

  const scene = startAtlas($("game"), {
    covered: () => $("hud").getBoundingClientRect().bottom - $("game").getBoundingClientRect().top,
    onPick(hit: Hit | null) {
      if (!hit) pick(null);
      else if (county) {
        // On a county's map: a gold mark leads into the room behind it; anything else is a city to read about.
        if (hit.kind === "star" && chambers[hit.id]) travel(`chamber:${hit.id}`);
        else pick(hit.id === county.code ? null : { kind: "city", id: hit.id });
      } else if (hit.kind === "star" && open && hit.id !== open.place.code) travel(`chamber:${hit.id}`); // a county board's triangle
      else if (hit.kind === "star") goToCapital(hit.id);
      else if (open && hasCities(open.place)) showCounty(open.place, hit.id);
      else if (open) pick({ kind: "county", fips: hit.id });
      else openPlace(hit.id);
    },
    onReady() {
      $("loading").remove();
      follow();
    },
  });

  /** Bring the panel, the title and the address into line with what is open and picked. */
  function render() {
    const place = open?.place ?? (picked?.kind === "place" ? STATE[picked.code] : undefined);
    if (open && county && picked?.kind === "city") panel.city(open.place, county, picked.id);
    else if (open && county) panel.countyMap(open.place, county);
    else if (open && picked?.kind === "county") panel.county(open.place, open.file, picked.fips);
    else if (open && picked?.kind === "capital") panel.capital(open.place, open.file);
    else if (open) panel.state(open.place, open.file);
    else if (place) panel.place(place);
    else panel.overview();
    scene.select(picked?.kind === "county" ? picked.fips : picked?.kind === "place" ? picked.code : picked?.kind === "city" ? picked.id : null, false);
    scene.markStar(picked?.kind === "capital" && open ? open.place.code : null);

    const countyTitle = county ? countyName(county.code, county.name).name : "";
    const cities = county ? county.ids.filter((id) => !isUnincorporated(id)).length : 0;
    document.querySelector("#hud-title strong")!.textContent = county ? countyTitle : open ? open.place.name : ATLAS_NAME;
    document.title = `${county ? countyTitle : open ? open.place.name : ATLAS_NAME} · Capitol World`;
    $("stamp").textContent = county
      ? `${cities} ${cities === 1 ? "city" : "cities and towns"}${county.seat ? ` · county seat ${county.seat.name}` : ""}`
      : open ? `${open.file.ids.length} ${countyWords(open.place.code)[1]} · capital ${open.place.capital}` : membersLine || "Pick a state";
    back.hidden = !open;
    back.textContent = county && open ? `← ${open.place.name}` : "← United States";
    const hash = county ? (picked?.kind === "city" ? `#city=${county.code}.${picked.id}` : `#county=${county.code}`)
      : picked?.kind === "county" ? `#county=${picked.fips}` : picked?.kind === "capital" && open ? `#capital=${open.place.code}` : place ? `#state=${place.code}` : "";
    if (location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
  }

  /** Pick something on the map that is open (null for nothing). `fly` brings a county or a city into view. */
  function pick(next: Picked, fly = false) {
    picked = next;
    render();
    if (fly && next?.kind === "county") scene.select(next.fips, true);
    if (fly && next?.kind === "city") scene.select(next.id, true);
  }

  function showNation(next: Picked = null) {
    asked++;
    if (open || !shown) scene.show(nationView());
    shown = true;
    open = null;
    county = null;
    pick(next);
  }
  let shown = false; // whether any map has been put on show yet

  /** Open a state's own map; then pick something on it, if asked. */
  function showState(place: StateInfo, next: Picked = null) {
    if (open?.place === place && !county) return pick(next, true);
    const turn = ++asked;
    loadState(place.code).then(
      (file) => {
        if (turn !== asked || signal.aborted) return;
        open = { place, file };
        county = null;
        shown = true;
        scene.show(stateView(place, file, chambers));
        // A county the address names but the state does not have is nothing picked.
        pick(next?.kind === "county" && !file.ids.includes(next.fips) ? null : next, true);
      },
      (error) => {
        console.error(error);
        if (turn === asked && !signal.aborted) showNation({ kind: "place", code: place.code });
      },
    );
  }

  /** Open a county's own map, with its cities; then pick one of them, if asked. A state whose counties have no maps shows the county's card instead. */
  function showCounty(place: StateInfo, fips: string, city: string | null = null) {
    if (!hasCities(place)) return showState(place, { kind: "county", fips });
    const turn = ++asked;
    Promise.all([loadState(place.code), loadCounty(place.code, fips)]).then(
      ([file, cities]) => {
        if (turn !== asked || signal.aborted) return;
        open = { place, file };
        county = cities;
        shown = true;
        scene.show(countyView(cities, chambers));
        pick(city && cities.ids.includes(city) ? { kind: "city", id: city } : null, true);
      },
      (error) => {
        console.error(error);
        if (turn === asked && !signal.aborted) showState(place);
      },
    );
  }

  /** Open a place by its code: a state's map, or the card of the District or a territory. */
  function openPlace(code: string) {
    const place = STATE[code];
    if (!place) return showNation();
    if (hasCounties(place)) showState(place);
    else showNation({ kind: "place", code });
  }

  /** A capital's star: straight into the world behind it, or to the capital on its state's map. */
  function goToCapital(code: string) {
    const place = STATE[code];
    if (!place) return;
    if (place.world) travel(place.world);
    else if (hasCounties(place)) showState(place, { kind: "capital" });
    else showNation({ kind: "place", code });
  }

  /** Go where the address says. */
  function follow() {
    const [, kind, value] = /^#(state|county|city|capital)=([\w.]+)$/.exec(decodeURIComponent(location.hash)) ?? [];
    const place = kind === "county" || kind === "city" ? stateOfCounty(value) : STATE[(value ?? "").toUpperCase()];
    if (!place) return showNation();
    const [fips, city] = (value ?? "").split(".");
    if (kind === "county" || kind === "city") {
      // The address is brought into line with what is picked, which is itself a change of address: do nothing for one that is already so.
      if (county?.code === fips && (picked?.kind === "city" ? picked.id : undefined) === city) return;
      showCounty(place, fips, city ?? null);
    }
    else if (kind === "capital" && !place.world && hasCounties(place)) showState(place, { kind: "capital" });
    else openPlace(place.code);
  }

  // Who each place sends to Congress comes from Capitol World's file, and the maps do not wait for it.
  void loadWorld().then(
    ({ world }) => {
      if (signal.aborted) return;
      panel.setMembers(world.members);
      membersLine = `Members of the ${ordinal(world.congress)} Congress · data through ${niceDate(world.data_through)}`;
      if (shown) render();
    },
    (error) => console.error(error),
  );

  // Which boards and councils have a room: their marks turn gold when the list arrives.
  void loadChambers().then((list) => {
    if (signal.aborted) return;
    chambers = list;
    panel.setChambers(list);
    if (county) scene.show(countyView(county, chambers));
    else if (open) scene.show(stateView(open.place, open.file, chambers));
    if (shown) render();
  });

  back.addEventListener("click", () => (county && open ? showState(open.place) : showNation()), { signal });
  $("zoom-in").addEventListener("click", () => scene.zoomBy(1.4), { signal });
  $("zoom-out").addEventListener("click", () => scene.zoomBy(1 / 1.4), { signal });
  $("fit").addEventListener("click", () => scene.fitWorld(), { signal });
  addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (picked) pick(null);
    else if (county && open) showState(open.place);
    else if (open) showNation();
  }, { signal });
  addEventListener("hashchange", follow, { signal });
  if (import.meta.env.DEV) (window as unknown as { atlas: unknown }).atlas = scene;
  return { destroy: () => scene.game.destroy(true) };
}
