import { createMusic } from "./audio/music";
import { archived, loadCommittees, loadCongresses, loadWorld } from "./data/load";
import { ordinal } from "./data/types";
import { createCalendar } from "./ui/calendar";
import { createPanel } from "./ui/panel";
import { startGame, type Target, type WorldScene } from "./world/scene";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function targetFromHash(): Target | null {
  const match = /^#(bill|member|site)=(.+)$/.exec(decodeURIComponent(location.hash));
  return match ? ({ type: match[1], id: match[2] } as Target) : null;
}

async function main() {
  const loading = $("loading");
  let loaded;
  try {
    loaded = await loadWorld();
  } catch (error) {
    loading.textContent = archived
      ? `The ${ordinal(archived)} Congress could not be loaded. `
      : "The map data could not be loaded. Please try again later.";
    if (archived) loading.append(Object.assign(document.createElement("a"), { href: location.pathname, textContent: "Open the current Congress" }));
    console.error(error);
    return;
  }
  const { world, source } = loaded;
  // A link to a bill of another Congress opens that Congress.
  const linked = /^#bill=(\d+)-/.exec(decodeURIComponent(location.hash));
  if (linked && Number(linked[1]) !== world.congress) {
    location.replace(`${location.pathname}?congress=${linked[1]}${location.hash}`);
    return;
  }
  const through = new Date(`${world.data_through}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const stamp = world.final ? `Final record · last action ${through}` : `Data through ${through}${source === "bundled" ? " · bundled sample" : ""}`;
  $("stamp").textContent = stamp;
  const replayLabel = world.final ? "▶ Replay the last day" : "▶ Replay last day";
  const skipLabel = world.final ? "■ Skip to the end" : "■ Skip to today";

  // The picker lists the finished Congresses that have been built; choosing one reloads the page.
  const picker = $<HTMLSelectElement>("congress");
  void loadCongresses().then((list) => {
    if (!list.length) return;
    const current = list.reduce((max, item) => Math.max(max, item.congress), 0) + 1;
    picker.append(new Option(`${ordinal(current)} Congress · ${1789 + 2 * (current - 1)}–now`, ""));
    for (const item of list) picker.append(new Option(`${ordinal(item.congress)} Congress · ${item.years[0]}–${item.years[1]}`, String(item.congress)));
    picker.value = archived ? String(archived) : "";
    picker.hidden = false;
  });
  picker.addEventListener("change", () => {
    location.assign(picker.value ? `${location.pathname}?congress=${picker.value}` : location.pathname);
  });

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const replayButton = $<HTMLButtonElement>("replay");
  const backButton = $<HTMLButtonElement>("back");
  const musicButton = $<HTMLButtonElement>("music");
  const music = createMusic();
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

  if (import.meta.env.DEV) (window as unknown as { scene: WorldScene }).scene = scene;
  replayButton.addEventListener("click", () => (scene.isReplaying ? scene.skipReplay() : scene.replay()));
  backButton.addEventListener("click", () => scene.leave());
  addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (calendar.isOpen) calendar.close();
    else scene.leave();
  });
  $("zoom-in").addEventListener("click", () => scene.zoomBy(1.4));
  $("zoom-out").addEventListener("click", () => scene.zoomBy(1 / 1.4));
  $("fit").addEventListener("click", () => scene.fitWorld());
  addEventListener("hashchange", () => scene.select(targetFromHash()));
}

void main();
