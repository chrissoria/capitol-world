// The maps of the United States as a page of their own: the scene, the panel beside it, and the
// buttons they share with the worlds. Opened with `?world=usa`. The address can name a state
// (`#state=CA`), a county (`#county=06037`) or a capital (`#capital=CA`).
//
// A click on a state opens that state's own map, with its counties. A click on a capital's star goes
// straight into the world behind it, where there is one; so far only Washington's has one.

import { loadWorld } from "../data/load";
import { ordinal } from "../data/types";
import { niceDate } from "../ui/dom";
import type { WorldKey } from "../worlds/types";
import { nationExtras } from "./art";
import { createAtlasPanel } from "./panel";
import { startAtlas, type Hit, type SheetView } from "./scene";
import { CAPITALS, TERRITORY_BOX } from "./shapes";
import { loadState, nationSheet, stateSheet, type StateFile } from "./sheet";
import { STATE, STATES, countyName, countyWords, hasCounties, stateOfCounty, type StateInfo } from "./states";

export const ATLAS_NAME = "United States";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface AtlasContext {
  /** Ends when the page moves on to something else. */
  signal: AbortSignal;
  /** Go into a world, to one of its people if `member` is given. */
  travel(world: WorldKey, member?: string): void;
}

/** What the visitor has picked on the map that is open. */
type Picked = { kind: "place"; code: string } | { kind: "county"; fips: string } | { kind: "capital" } | null;

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
    stars: STATES.map((place) => ({ id: place.code, x: CAPITALS[place.code][0], y: CAPITALS[place.code][1], gold: Boolean(place.world), big: Boolean(place.world) })),
    column: { x: 340, y: 82 },
    heading: { text: "Territories", x: TERRITORY_BOX.x + TERRITORY_BOX.w / 2, y: TERRITORY_BOX.y + 1 },
    tiny: 20,
    extras: nationExtras,
    caption: (hit) => (hit.kind === "star" ? capitalLine(STATE[hit.id]) : STATE[hit.id].name),
  };
}

function stateView(place: StateInfo, file: StateFile): SheetView {
  const name = (fips: string) => countyName(fips, file.names[file.ids.indexOf(fips)] ?? "").name;
  return {
    sheet: stateSheet(file),
    // No county wears its name: some would fit and most would not. Each is named beside the pointer instead.
    names: [],
    stars: [{ id: place.code, x: file.capital[0], y: file.capital[1], gold: Boolean(place.world), big: true }],
    tiny: 4,
    caption: (hit) => (hit.kind === "star" ? capitalLine(place) : name(hit.id)),
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
  let picked: Picked = null;
  let asked = 0; // counts the maps asked for, so that a slow one does not replace a later one
  let membersLine = "";

  const panel = createAtlasPanel({
    home: () => showNation(),
    open: (code) => openPlace(code),
    county: (fips) => pick(fips ? { kind: "county", fips } : null, true),
    capital: (code) => goToCapital(code),
    travel,
  });

  const scene = startAtlas($("game"), {
    covered: () => $("hud").getBoundingClientRect().bottom - $("game").getBoundingClientRect().top,
    onPick(hit: Hit | null) {
      if (hit?.kind === "star") goToCapital(hit.id);
      else if (!hit) pick(null);
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
    if (open && picked?.kind === "county") panel.county(open.place, open.file, picked.fips);
    else if (open && picked?.kind === "capital") panel.capital(open.place, open.file);
    else if (open) panel.state(open.place, open.file);
    else if (place) panel.place(place);
    else panel.overview();
    scene.select(picked?.kind === "county" ? picked.fips : picked?.kind === "place" ? picked.code : null, false);
    scene.markStar(picked?.kind === "capital" && open ? open.place.code : null);

    document.querySelector("#hud-title strong")!.textContent = open ? open.place.name : ATLAS_NAME;
    document.title = `${open ? open.place.name : ATLAS_NAME} · Capitol World`;
    $("stamp").textContent = open ? `${open.file.ids.length} ${countyWords(open.place.code)[1]} · capital ${open.place.capital}` : membersLine || "Pick a state";
    back.hidden = !open;
    const hash = picked?.kind === "county" ? `#county=${picked.fips}` : picked?.kind === "capital" && open ? `#capital=${open.place.code}` : place ? `#state=${place.code}` : "";
    if (location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
  }

  /** Pick something on the map that is open (null for nothing). `fly` brings a county into view. */
  function pick(next: Picked, fly = false) {
    picked = next;
    render();
    if (fly && next?.kind === "county") scene.select(next.fips, true);
  }

  function showNation(next: Picked = null) {
    asked++;
    if (open || !shown) scene.show(nationView());
    shown = true;
    open = null;
    pick(next);
  }
  let shown = false; // whether any map has been put on show yet

  /** Open a state's own map; then pick something on it, if asked. */
  function showState(place: StateInfo, next: Picked = null) {
    if (open?.place === place) return pick(next, true);
    const turn = ++asked;
    loadState(place.code).then(
      (file) => {
        if (turn !== asked || signal.aborted) return;
        open = { place, file };
        shown = true;
        scene.show(stateView(place, file));
        // A county the address names but the state does not have is nothing picked.
        pick(next?.kind === "county" && !file.ids.includes(next.fips) ? null : next, true);
      },
      (error) => {
        console.error(error);
        if (turn === asked && !signal.aborted) showNation({ kind: "place", code: place.code });
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
    const [, kind, value] = /^#(state|county|capital)=([\w]+)$/.exec(decodeURIComponent(location.hash)) ?? [];
    const place = kind === "county" ? stateOfCounty(value) : STATE[(value ?? "").toUpperCase()];
    if (!place) return showNation();
    if (kind === "county") showState(place, { kind: "county", fips: value });
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

  back.addEventListener("click", () => showNation(), { signal });
  $("zoom-in").addEventListener("click", () => scene.zoomBy(1.4), { signal });
  $("zoom-out").addEventListener("click", () => scene.zoomBy(1 / 1.4), { signal });
  $("fit").addEventListener("click", () => scene.fitWorld(), { signal });
  addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (picked) pick(null);
    else if (open) showNation();
  }, { signal });
  addEventListener("hashchange", follow, { signal });
  if (import.meta.env.DEV) (window as unknown as { atlas: unknown }).atlas = scene;
  return { destroy: () => scene.game.destroy(true) };
}
