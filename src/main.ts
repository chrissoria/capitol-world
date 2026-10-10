import { loadWorld } from "./data/load";
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
    loading.textContent = "The map data could not be loaded. Please try again later.";
    console.error(error);
    return;
  }
  const { world, source } = loaded;
  const through = new Date(`${world.data_through}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const stamp = `Data through ${through}${source === "bundled" ? " · bundled sample" : ""}`;
  $("stamp").textContent = stamp;

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const replayButton = $<HTMLButtonElement>("replay");
  const backButton = $<HTMLButtonElement>("back");
  const clock = $("clock");
  let current: Target | null = null;
  let panel: ReturnType<typeof createPanel> | undefined;

  const scene: WorldScene = startGame($("game"), world, {
    onSelect(target) {
      current = target;
      panel?.show(target);
      const hash = target ? `#${target.type}=${target.id}` : " ";
      if (decodeURIComponent(location.hash) !== hash.trim()) history.replaceState(null, "", hash === " " ? location.pathname + location.search : hash);
    },
    onClock(label, progress) {
      clock.hidden = label === null;
      replayButton.textContent = label === null ? "▶ Replay last day" : "■ Skip to today";
      if (label !== null) {
        $("clock-day").textContent = label;
        (clock.querySelector("i") as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
      }
      panel?.refresh(current);
    },
    onPlace(inside) {
      backButton.hidden = !inside;
      replayButton.hidden = Boolean(inside) || !scene.hasEvents;
      $("fit").textContent = inside ? "Whole building" : "Whole map";
      $("stamp").textContent = inside ? `Inside the ${inside} · the comings and goings are animation` : stamp;
    },
    onReady() {
      loading.remove();
      panel = createPanel(world, {
        select: (target) => scene.select(target),
        filter: (filter) => scene.setFilter(filter),
        billsAt: (key) => scene.billsAt(key),
        siteOf: (id) => scene.siteOf(id),
        siteByKey: (key) => scene.siteByKey(key),
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
    if (event.key === "Escape") scene.leave();
  });
  $("zoom-in").addEventListener("click", () => scene.zoomBy(1.4));
  $("zoom-out").addEventListener("click", () => scene.zoomBy(1 / 1.4));
  $("fit").addEventListener("click", () => scene.fitWorld());
  addEventListener("hashchange", () => scene.select(targetFromHash()));
}

void main();
