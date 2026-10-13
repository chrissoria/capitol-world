// The guide on the map of the United States: a pelican that looks in over the lower left corner of the
// page, where the map shows sea. It is the page's narrator and not a creature of the map: it rises from
// the edge of the frame, is laid over the map, and stays put while the map is dragged and zoomed under
// it. It keeps its head just above the edge until the pointer comes near, or the keyboard reaches it,
// and then it bobs up and says hello and what to do here. On a touch screen a tap does the same.
//
// Its picture is painted once, small, and shown four times the size.

import { box, canvas } from "../world/art";

/** The pelican, one character to a pixel. It looks right, toward the land. */
const PELICAN = [
  "..........kkkkk...................",
  "........kkyyyyykk.................",
  ".......kyyyyyyyyyk................",
  "......kywwwwwwwwwwk...............",
  "......kwwwwkkwwwwwwkkkkkkkkkkk....",
  "......kwwwwkkwwwwwooooooooooook...",
  "......kwwwwwwwwwwoooooooooooooook.",
  "......kwwwwwwwwwkppppppppppppppk..",
  ".......kwwwwwwwwkpppppppppppppk...",
  ".......kwwwwwwwkkppppppppppppk....",
  "........kwwwwwk.kprppppppppkk.....",
  "........kwwwwwk..kkrrrrrrkk.......",
  "........kwwwwwk....kkkkkk.........",
  "........kwwwwwk...................",
  "........kwwsswk...................",
  ".......kwwwsswk...................",
  "......kwwwwwsswk..................",
  "....kkwwwwwwwwwwkk................",
  "...kwwwwwwwwwwwwwwkk..............",
  "..kwwwwwwwwwwwwwwwwwk.............",
  "..kwwwwwwggggggwwwwwwk............",
  "..kwwwwwgggggggggwwwwk............",
  "..kwwwwggggggggggggwwk............",
  "..kwwwwgggggggggkkgwwk............",
  "..kwwwwwggggggkkwwwwwk............",
  "..kwwwwwwwwwwwwwwwwwwk............",
  "..kwwwwwwwwwwwwwwwwwwk............",
  "..kwwwwwwwwwwwwwwwwwwk............",
  "..kwwwwwwwwwwwwwwwwwwk............",
];
const COLOURS: Record<string, string> = {
  k: "#2e2a44", // the page's ink
  w: "#f6f2e6",
  s: "#d9d3c3",
  y: "#f3e3a2",
  o: "#f0a13a",
  p: "#e8833a",
  r: "#c96a2a",
  g: "#8d8a9a",
};
const SCALE = 4;
export const GUIDE_WORDS = "Hi! Pick a state to open its map. A gold star leads into a world.";

function drawPelican(): HTMLCanvasElement {
  const [picture, ctx] = canvas(PELICAN[0].length, PELICAN.length);
  PELICAN.forEach((row, y) => [...row].forEach((pixel, x) => pixel !== "." && box(ctx, x, y, 1, 1, COLOURS[pixel])));
  picture.style.width = `${picture.width * SCALE}px`;
  picture.style.height = `${picture.height * SCALE}px`;
  picture.setAttribute("aria-hidden", "true");
  return picture;
}

/** Put the guide in the corner of `stage`. `show(false)` takes it away while a state's own map is open. */
export function createGuide(stage: HTMLElement, signal: AbortSignal): { show(visible: boolean): void } {
  const guide = document.createElement("button");
  guide.id = "guide";
  guide.type = "button";
  guide.setAttribute("aria-expanded", "false");
  const words = Object.assign(document.createElement("span"), { className: "guide-words", textContent: GUIDE_WORDS });
  guide.append(drawPelican(), words);
  stage.append(guide);

  let tapped = false; // a tap brings it up and the next puts it back; the pointer and the keyboard do so by coming and going
  const out = (up: boolean) => {
    guide.classList.toggle("out", up);
    guide.setAttribute("aria-expanded", String(up));
  };
  guide.addEventListener("pointerenter", (event) => event.pointerType === "mouse" && out(true), { signal });
  guide.addEventListener("pointerleave", (event) => event.pointerType === "mouse" && !tapped && out(false), { signal });
  guide.addEventListener("focus", () => out(true), { signal });
  guide.addEventListener("blur", () => { tapped = false; out(false); }, { signal });
  guide.addEventListener("click", () => { tapped = !tapped; out(tapped); }, { signal });
  return { show: (visible) => { guide.hidden = !visible; if (!visible) { tapped = false; out(false); } } };
}
