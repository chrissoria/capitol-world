import { createMusic } from "./audio/music";
import { archived, congressInAddress, loadCommittees, loadCongresses, loadWorld, setCongress } from "./data/load";
import { setMeetingCongress } from "./data/meetings";
import { ordinal } from "./data/types";
import { createCalendar } from "./ui/calendar";
import { createPanel } from "./ui/panel";
import { startGame, type Target, type WorldScene } from "./world/scene";

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
const congresses = loadCongresses();
let life = new AbortController(); // ends the listeners of the Congress on show
let showing: WorldScene | undefined;
let opened = 0;

/** Show another Congress (null for the current one) in place. */
function switchTo(congress: number | null, address: "push" | "replace" | "keep" = "push") {
  life.abort();
  life = new AbortController();
  showing?.game.destroy(true);
  showing = undefined;
  $("app").replaceWith(untouched.app.cloneNode(true));
  $("about").replaceWith(untouched.about.cloneNode(true));
  setCongress(congress);
  if (address !== "keep") {
    const query = new URLSearchParams(location.search);
    if (congress) query.set("congress", String(congress));
    else query.delete("congress");
    const search = query.toString();
    const next = `${location.pathname}${search ? `?${search}` : ""}${address === "replace" ? location.hash : ""}`;
    history[address === "push" ? "pushState" : "replaceState"](null, "", next);
  }
  music.setTrack("map");
  void main();
}

// Back and forward across a change of Congress.
addEventListener("popstate", () => {
  if (congressInAddress() !== archived) switchTo(congressInAddress(), "keep");
});

async function main() {
  const turn = ++opened;
  const { signal } = life;
  const loading = $("loading");
  let loaded;
  try {
    loaded = await loadWorld();
    if (turn !== opened) return; // another Congress was picked while this one loaded
  } catch (error) {
    if (turn !== opened) return;
    loading.textContent = archived
      ? `The ${ordinal(archived)} Congress could not be loaded. `
      : "The map data could not be loaded. Please try again later.";
    if (archived) loading.append(Object.assign(document.createElement("a"), { href: location.pathname, textContent: "Open the current Congress" }));
    console.error(error);
    return;
  }
  const { world, source } = loaded;
  setMeetingCongress(world.congress);
  // A link to a bill of another Congress opens that Congress.
  const linked = congressOfLink();
  if (linked && linked !== world.congress) return switchTo(linked, "replace");
  const through = new Date(`${world.data_through}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const stamp = world.final ? `Final record · last action ${through}` : `Data through ${through}${source === "bundled" ? " · bundled sample" : ""}`;
  $("stamp").textContent = stamp;
  const replayLabel = world.final ? "▶ Replay the last day" : "▶ Replay last day";
  const skipLabel = world.final ? "■ Skip to the end" : "■ Skip to today";

  // The picker lists the finished Congresses that have been built.
  const picker = $<HTMLSelectElement>("congress");
  void congresses.then((list) => {
    if (!list.length || turn !== opened) return;
    const current = list.reduce((max, item) => Math.max(max, item.congress), 0) + 1;
    picker.append(new Option(`${ordinal(current)} Congress · ${1789 + 2 * (current - 1)}–now`, ""));
    for (const item of list) picker.append(new Option(`${ordinal(item.congress)} Congress · ${item.years[0]}–${item.years[1]}`, String(item.congress)));
    picker.value = archived ? String(archived) : "";
    picker.hidden = false;
  });
  picker.addEventListener("change", () => switchTo(picker.value ? Number(picker.value) : null));

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const replayButton = $<HTMLButtonElement>("replay");
  const backButton = $<HTMLButtonElement>("back");
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
  const clock = $("clock");
  let current: Target | null = null;
  let panel: ReturnType<typeof createPanel> | undefined;
  const committeeOf = (code: string) => loadCommittees().then((file) => file.committees[code], () => undefined);
  const calendar = createCalendar($("wall-calendar"), { committee: committeeOf, stage: (code, meetingId) => scene.stage(code, meetingId) });

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
      if (label !== null) {
        $("clock-day").textContent = label;
        (clock.querySelector("i") as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
      }
      panel?.refresh(current);
    },
    onCalendar(code) {
      calendar.open(code);
    },
    onPlace(inside) {
      calendar.close();
      music.setTrack(inside ? "inside" : "map");
      backButton.hidden = !inside;
      replayButton.hidden = Boolean(inside) || !scene.hasEvents;
      $("fit").textContent = inside ? "Whole building" : "Whole map";
      $("stamp").textContent = inside ? `Inside ${inside.label} · ${inside.note}` : stamp;
    },
    onReady() {
      loading.remove();
      panel = createPanel(world, {
        select: (target) => scene.select(target),
        filter: (filter) => scene.setFilter(filter),
        billsAt: (key) => scene.billsAt(key),
        siteOf: (id) => scene.siteOf(id),
        siteByKey: (key) => scene.siteByKey(key),
        committee: committeeOf,
        stage: (code, meetingId) => scene.stage(code, meetingId),
        whereIs: (id) => scene.whereIs(id),
      });
      replayButton.hidden = !scene.hasEvents;
      const initial = targetFromHash();
      if (initial) scene.select(initial);
      else if (scene.hasEvents && !reducedMotion) scene.replay();
    },
  });

  showing = scene;
  if (import.meta.env.DEV) (window as unknown as { scene: WorldScene }).scene = scene;
  replayButton.addEventListener("click", () => (scene.isReplaying ? scene.skipReplay() : scene.replay()));
  backButton.addEventListener("click", () => scene.leave());
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
    if (linked && linked !== world.congress) switchTo(linked, "replace");
    else scene.select(targetFromHash());
  }, { signal });
}

void main();
