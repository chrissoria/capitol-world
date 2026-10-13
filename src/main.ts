import { createMusic } from "./audio/music";
import { archived, congressInAddress, loadCommittees, loadWorld, setCongress, useProvider, useSource } from "./data/load";
import { setMeetingCongress } from "./data/meetings";
import { ordinal } from "./data/types";
import { createCalendar } from "./ui/calendar";
import { createPanel } from "./ui/panel";
import { startGame, type Target, type WorldScene } from "./world/scene";
import { openAtlas } from "./usa";
import { WORLDS, atlasInAddress, chamberWayOut, placeInAddress, worldInAddress } from "./worlds";
import type { Destination, WorldKey } from "./worlds/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function targetFromHash(): Target | null {
  const match = /^#(bill|member|site)=(.+)$/.exec(decodeURIComponent(location.hash));
  return match ? ({ type: match[1], id: match[2] } as Target) : null;
}

/** The Congress of the bill the address links to, if it links to one. */
function congressOfLink(): number | null {
  const linked = /^#bill=(\d+)-/.exec(decodeURIComponent(location.hash));
  return linked ? Number(linked[1]) : null;
}

// These outlive a change of Congress. The page is rebuilt from the untouched copies below rather than
// reloaded, because a reload would stop the music until the next click.
const music = createMusic();
const untouched = { app: $("app").cloneNode(true), about: $("about").cloneNode(true) };
// The world on show: Capitol Hill, or another named in the address.
let def = worldInAddress();
useProvider(def.provider);
useSource(def.source);
// The map of the United States is not a world: it has no items of its own, and borrows the Capitol's members.
let atlas = atlasInAddress();
if (atlas) setCongress(null);
nameWorld();
let shownPlace = placeInAddress(); // whose chamber is on show, when one is
let life = new AbortController(); // ends the listeners of the Congress on show
let showing: { destroy(): void } | undefined;
let opened = 0;

/**
 * An address that names no world and is not the map's is the Capitol's, from before the map was the way in. It is given
 * the Capitol's name, so that it is still the Capitol's once the bill it points at is put down.
 */
function nameWorld() {
  const query = new URLSearchParams(location.search);
  if (atlas || query.has("world")) return;
  query.set("world", def.key);
  history.replaceState(null, "", `${location.pathname}?${query}${location.hash}`);
}

/** Show another Congress (null for the current one) in place, or go somewhere else: another world, or the map of the United States. */
function switchTo(congress: number | null, address: "push" | "replace" | "keep" = "push", world: Destination = atlas ? "usa" : def.key, hash = "") {
  life.abort();
  life = new AbortController();
  showing?.destroy();
  showing = undefined;
  $("app").replaceWith(untouched.app.cloneNode(true));
  $("about").replaceWith(untouched.about.cloneNode(true));
  atlas = world === "usa";
  // A chamber is some place's: "chamber:06073" on the way in, and the address's own place when only the view changes.
  const place = world.startsWith("chamber") ? (world.split(":")[1] ?? placeInAddress()) : null;
  const next = world === "usa" ? WORLDS.capitol : place ? WORLDS.chamber : WORLDS[world as WorldKey];
  if (next.key !== def.key) {
    def = next;
    useProvider(def.provider);
    useSource(def.source);
  }
  if (atlas) congress = null;
  setCongress(congress);
  shownPlace = atlas ? null : place;
  if (address !== "keep") {
    const query = new URLSearchParams(location.search);
    for (const name of ["congress", "term", "session", "world", "place"]) query.delete(name);
    if (!atlas) query.set("world", def.key); // the map is where the bare address lands, so every world is named
    if (!atlas && place) query.set("place", place);
    if (congress !== null) query.set(def.periodParam, String(congress));
    const search = query.toString();
    const next = `${location.pathname}${search ? `?${search}` : ""}${address === "replace" ? location.hash : hash}`;
    history[address === "push" ? "pushState" : "replaceState"](null, "", next);
  } else nameWorld();
  music.setTrack("map");
  void (atlas ? showAtlas() : main());
}

// Back and forward across a change of Congress.
addEventListener("popstate", () => {
  if (atlasInAddress() !== atlas || worldInAddress().key !== def.key || congressInAddress() !== archived || (def.key === "chamber" && placeInAddress() !== shownPlace)) switchTo(congressInAddress(), "keep", atlasInAddress() ? "usa" : worldInAddress().key);
});

/** The tune of a world that is one room: a county board in California has one of its own; any other board or council has the committee rooms'. */
const roomTrack = () => (/^06\d{3}$/.test(shownPlace ?? "") ? "county-ca" : "committee");

/** The music button, on a page that has just been built. */
function wireMusic() {
  const musicButton = $<HTMLButtonElement>("music");
  const showMusic = () => {
    musicButton.textContent = music.enabled ? "♪ On" : "♪ Off";
    musicButton.setAttribute("aria-pressed", String(music.enabled));
    musicButton.setAttribute("aria-label", music.enabled ? "Music is on. Turn it off" : "Music is off. Turn it on");
  };
  showMusic();
  musicButton.addEventListener("click", () => {
    music.setEnabled(!music.enabled);
    showMusic();
  });
}

/** The map of the United States, from which the worlds are reached. */
function showAtlas() {
  wireMusic();
  showing = openAtlas({ signal: life.signal, travel: (world, member) => switchTo(null, "push", world, member ? `#member=${member}` : "") });
}

async function main() {
  const turn = ++opened;
  const { signal } = life;
  const loading = $("loading");
  loading.textContent = def.loading;
  let loaded;
  try {
    loaded = await loadWorld();
    if (turn !== opened) return; // another Congress was picked while this one loaded
  } catch (error) {
    if (turn !== opened) return;
    loading.textContent = def.key === "capitol" && archived
      ? `The ${ordinal(archived)} Congress could not be loaded. `
      : "The map data could not be loaded. Please try again later. ";
    if (archived !== null || def.key !== "capitol") loading.append(Object.assign(document.createElement("a"), { href: `${location.pathname}?world=${def.key}`, textContent: archived !== null && def.legislature ? `Open the current ${def.legislature.period}` : "Open the current Congress" }));
    console.error(error);
    return;
  }
  const { world, source } = loaded;
  setMeetingCongress(world.congress);
  // A link to a bill of another Congress opens that Congress.
  const linked = congressOfLink();
  if (linked !== null && linked !== world.congress) return switchTo(linked, "replace");
  const through = new Date(`${world.data_through}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const stamp = `${def.words.stamp(world, through)}${source === "bundled" ? " · bundled sample" : ""}`;
  $("stamp").textContent = stamp;
  document.querySelector("#hud-title strong")!.textContent = def.name;
  document.title = def.name;
  const replayLabel = world.final ? "▶ Replay the last day" : "▶ Replay last day";
  const skipLabel = world.final ? "■ Skip to the end" : "■ Skip to today";

  // The picker lists the periods this world can show: Congresses here, presidencies next door.
  const picker = $<HTMLSelectElement>("congress");
  void def.line().then((list) => {
    if (list.length < 2 || turn !== opened) return;
    for (const entry of list) picker.append(new Option(def.periodLabel(entry), entry.live ? "" : String(entry.congress)));
    picker.value = archived === null ? "" : String(archived);
    picker.hidden = false;
  });
  picker.addEventListener("change", () => switchTo(picker.value === "" ? null : Number(picker.value)));

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const replayButton = $<HTMLButtonElement>("replay");
  const storyButton = $<HTMLButtonElement>("replay-all"); // the whole period, in a world that can replay it
  storyButton.textContent = def.words.replayAll ?? "";
  const backButton = $<HTMLButtonElement>("back");
  let indoors = false; // whether a building is open, which is what the back button then leads out of
  wireMusic();
  const clock = $("clock");
  let current: Target | null = null;
  let panel: ReturnType<typeof createPanel> | undefined;
  const committeeOf = (code: string) => loadCommittees().then((file) => file.committees[code], () => undefined);
  const calendar = createCalendar($("wall-calendar"), { committee: committeeOf, stage: (code, meetingId) => scene.stage(code, meetingId), site: () => def.room?.official().replace(/^the /, "") ?? def.legislature?.site ?? "Congress.gov" });

  const scene: WorldScene = startGame($("game"), world, {
    onSelect(target) {
      current = target;
      panel?.show(target);
      const hash = target ? `#${target.type}=${target.id}` : " ";
      if (decodeURIComponent(location.hash) !== hash.trim()) history.replaceState(null, "", hash === " " ? location.pathname + location.search : hash);
    },
    onClock(label, progress) {
      clock.hidden = label === null;
      replayButton.textContent = label === null ? replayLabel : skipLabel;
      storyButton.hidden = label !== null || !scene.hasStory || !def.words.replayAll || Boolean(scene.place);
      replayButton.hidden = label === null && !scene.hasEvents;
      if (label !== null) {
        $("clock-day").textContent = label;
        (clock.querySelector("i") as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
      }
      panel?.refresh(current);
    },
    onCalendar(code) {
      calendar.open(code);
    },
    onOffice(_place, key) {
      if (key === "stats") panel?.openStats();
    },
    onTravel(to) {
      switchTo(null, "push", to as Destination);
    },
    onPlace(inside) {
      calendar.close();
      // The chambers have their own tune, and so do the committee rooms.
      music.setTrack(!inside ? "map" : def.room ? roomTrack() : inside.place === "House" || inside.place === "Senate" || !def.legislature ? "inside" : "committee");
      // Out of doors the button leads back to the map of the country; inside a building, back out of it. A world that
      // is one room has no out of doors of its own, so there it always leads to the country's map.
      indoors = Boolean(inside);
      backButton.hidden = false;
      backButton.textContent = def.room ? "← Map" : inside ? "← Back outside" : "← United States";
      replayButton.hidden = Boolean(inside) || !scene.hasEvents;
      storyButton.hidden = Boolean(inside) || !scene.hasStory || !def.words.replayAll;
      $("fit").textContent = inside ? "Fit the building" : "Fit to screen";
      $("stamp").textContent = inside ? `Inside ${inside.label} · ${inside.note}` : stamp;
    },
    onReady() {
      loading.remove();
      if (!def.room) {
        backButton.hidden = false;
        backButton.textContent = "← United States";
      }
      panel = createPanel(world, {
        select: (target) => scene.select(target),
        filter: (filter) => scene.setFilter(filter),
        billsAt: (key) => scene.billsAt(key),
        siteOf: (id) => scene.siteOf(id),
        siteByKey: (key) => scene.siteByKey(key),
        committee: committeeOf,
        stage: (code, meetingId) => scene.stage(code, meetingId),
        whereIs: (id) => scene.whereIs(id),
        lookAt: (key) => scene.lookAt(key),
        learning: (open) => music.setTrack(open ? "library" : def.room ? roomTrack() : "map"),
        travel: (to) => switchTo(null, "push", to as Destination, def.room && to === "usa" ? chamberWayOut() : ""),
        mapView: () => (scene.textures.exists("ground") ? (scene.textures.get("ground").getSourceImage() as HTMLCanvasElement) : null),
      }, def);
      replayButton.hidden = !scene.hasEvents;
      storyButton.hidden = !scene.hasStory || !def.words.replayAll;
      if (def.room) scene.enter(def.room.code);
      const initial = targetFromHash();
      if (initial) scene.select(initial);
      else if (scene.hasEvents && !reducedMotion) scene.replay();
    },
  }, def.layout);

  showing = { destroy: () => scene.game.destroy(true) };
  if (import.meta.env.DEV) (window as unknown as { scene: WorldScene }).scene = scene;
  replayButton.addEventListener("click", () => (scene.isReplaying ? scene.skipReplay() : scene.replay()));
  storyButton.addEventListener("click", () => scene.replay(true));
  backButton.addEventListener("click", () => {
    if (def.room) switchTo(null, "push", "usa", chamberWayOut());
    else if (indoors) scene.leave();
    else switchTo(null, "push", "usa", def.key === "california" ? "#state=CA" : "");
  });
  addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (calendar.isOpen) calendar.close();
    else scene.leave();
  }, { signal });
  $("zoom-in").addEventListener("click", () => scene.zoomBy(1.4));
  $("zoom-out").addEventListener("click", () => scene.zoomBy(1 / 1.4));
  $("fit").addEventListener("click", () => scene.fitWorld());
  addEventListener("hashchange", () => {
    const linked = congressOfLink();
    if (linked !== null && linked !== world.congress) switchTo(linked, "replace");
    else scene.select(targetFromHash());
  }, { signal });
}

void (atlas ? showAtlas() : main());
