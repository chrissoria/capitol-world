// All artwork is drawn here at runtime with a fixed palette: no image files, so
// nothing to license and one consistent style.

import type { Member } from "../data/types";
import { AVENUE_HOUSE, AVENUE_SENATE, MAP_H, MAP_W, TILE, type Layout, type Rect, type Site } from "./layout";

export const PALETTE = {
  ink: "#2e2a44",
  grass: "#74c365",
  grassLight: "#8bd47a",
  grassDark: "#5fae55",
  path: "#ead9a4",
  pathEdge: "#c9b377",
  stone: "#dcd6c8",
  stoneEdge: "#b9b1a0",
  water: "#5fb0ea",
  waterLight: "#93cdf5",
  wall: "#f4ecd6",
  wallShade: "#d8cba8",
  door: "#7b4a2b",
  window: "#a8dcff",
  wood: "#b98452",
  woodDark: "#8a5d36",
  house: "#2f9e8f",
  houseDark: "#237a6e",
  houseCarpet: "#cdeadf",
  senate: "#8f5fb0",
  senateDark: "#6d4589",
  senateCarpet: "#e3d6ef",
  gold: "#e0aa3e",
  goldDark: "#b38327",
  orange: "#e58a45",
  orangeDark: "#bb6a2f",
  slate: "#62739a",
  slateDark: "#48577a",
  white: "#ffffff",
  steel: "#8d98a8",
  steelDark: "#5f6a7a",
  partyR: "#d8433b",
  partyD: "#3a6fd8",
  partyI: "#5c9a4f",
  yellow: "#ffd84a",
} as const;

export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = w;
  element.height = h;
  const ctx = element.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [element, ctx];
}

export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function framed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  box(ctx, x, y, w, h, PALETTE.ink);
  box(ctx, x + 1, y + 1, w - 2, h - 2, fill);
}

// ── Ground ───────────────────────────────────────────────────────────────────

function roofColors(entry: Site): [string, string] {
  switch (entry.style) {
    case "whitehouse":
      return [PALETTE.white, PALETTE.stoneEdge];
    case "archive":
      return [PALETTE.gold, PALETTE.goldDark];
    case "hall":
      return [PALETTE.orange, PALETTE.orangeDark];
    case "conference":
      return [PALETTE.slate, PALETTE.slateDark];
    case "memorial":
      return [PALETTE.steel, PALETTE.steelDark];
    case "library":
      return ["#8cc0aa", "#64997f"]; // weathered copper
    case "department":
      return ["#4f6f9c", "#3a557c"];
    default:
      if (entry.wing === "Senate") return [PALETTE.senate, PALETTE.senateDark];
      if (entry.wing === "House") return [PALETTE.house, PALETTE.houseDark];
      return [PALETTE.slate, PALETTE.slateDark];
  }
}

function drawRoofed(ctx: CanvasRenderingContext2D, entry: Site) {
  const { x, y, w, h } = scale(entry.rect);
  const [roof, roofDark] = roofColors(entry);
  const roofH = Math.round(h * 0.56);
  // Walls.
  framed(ctx, x, y + roofH - 2, w, h - roofH + 2, PALETTE.wall);
  box(ctx, x + 1, y + h - 5, w - 2, 4, PALETTE.wallShade);
  // Roof with shingle rows.
  framed(ctx, x - 2, y, w + 4, roofH, roof);
  for (let row = 5; row < roofH - 2; row += 5) box(ctx, x - 1, y + row, w + 2, 1, roofDark);
  box(ctx, x - 1, y + roofH - 3, w + 2, 2, roofDark);
  // Door and windows.
  const doorW = 12;
  const doorX = x + Math.round(w / 2) - doorW / 2;
  framed(ctx, doorX, y + h - 16, doorW, 16, PALETTE.door);
  box(ctx, doorX + doorW - 4, y + h - 9, 2, 2, PALETTE.yellow);
  const wallTop = y + roofH + 3;
  for (let wx = x + 8; wx + 10 <= x + w - 6; wx += 18) {
    if (wx + 10 > doorX - 3 && wx < doorX + doorW + 3) continue;
    framed(ctx, wx, wallTop, 10, 9, PALETTE.window);
    box(ctx, wx + 4, wallTop + 1, 1, 7, PALETTE.ink);
  }
  if (entry.style === "archive" || entry.style === "hall" || entry.style === "memorial" || entry.style === "library") {
    for (let cx = x + 6; cx < x + w - 6; cx += 14) {
      if (cx + 4 > doorX - 2 && cx < doorX + doorW + 2) continue;
      framed(ctx, cx, y + roofH - 2, 5, h - roofH + 2, PALETTE.white);
    }
    // Pediment.
    const mid = x + w / 2;
    for (let i = 0; i < 9; i++) box(ctx, mid - 18 + i * 2, y + roofH - 4 - i, 36 - i * 4, 1, i === 8 ? PALETTE.ink : PALETTE.white);
  }
  if (entry.style === "calendar") {
    // A wall calendar on the roof.
    const bx = x + w / 2 - 20;
    framed(ctx, bx, y + 6, 40, roofH - 12, PALETTE.white);
    box(ctx, bx + 1, y + 7, 38, 5, PALETTE.partyR);
    for (let gx = 0; gx < 7; gx++)
      for (let gy = 0; gy < Math.floor((roofH - 22) / 5); gy++) box(ctx, bx + 4 + gx * 5, y + 15 + gy * 5, 3, 3, PALETTE.stoneEdge);
  }
}

/** The north front: flat balustraded roof, two storeys of windows, the pedimented portico, low wings. */
function drawWhiteHouse(ctx: CanvasRenderingContext2D, entry: Site) {
  const { x, y, w, h } = scale(entry.rect);
  const white = "#fbfaf5";
  const shade = "#dcd9cf";
  const deep = "#c4c1b6";
  const roofTone = "#e4e1d7";
  const mid = x + Math.round(w / 2);
  const wing = 44;
  const mx = x + wing;
  const mw = w - wing * 2;
  const top = y + 38; // where the wall begins
  const bottom = y + h - 6;

  // Low colonnaded wings either side.
  for (const wx of [x, x + w - wing - 2]) {
    framed(ctx, wx, y + 94, wing + 2, bottom - (y + 94), deep);
    for (let cx = wx + 3; cx < wx + wing - 2; cx += 9) framed(ctx, cx, y + 98, 5, bottom - (y + 98), white);
    framed(ctx, wx - 1, y + 88, wing + 4, 8, white);
    for (let bx = wx + 2; bx < wx + wing; bx += 4) box(ctx, bx, y + 90, 1, 4, shade);
  }

  // Flat roof with chimneys and a balustrade along the front edge.
  framed(ctx, mx - 2, y + 8, mw + 4, 32, roofTone);
  for (let line = y + 13; line < y + 30; line += 6) box(ctx, mx, line, mw, 1, shade);
  for (const cx of [mx + 34, mx + 78, mx + mw - 90, mx + mw - 46]) {
    framed(ctx, cx, y + 11, 12, 11, white);
    box(ctx, cx + 1, y + 19, 10, 2, shade);
  }
  framed(ctx, mx - 3, y + 30, mw + 6, 9, white);
  for (let bx = mx; bx < mx + mw; bx += 4) box(ctx, bx, y + 32, 1, 5, shade);

  // The wall: cornice, a band between the storeys, and a darker base.
  framed(ctx, mx, top, mw, bottom - top, white);
  box(ctx, mx + 1, top + 1, mw - 2, 3, shade);
  box(ctx, mx + 1, y + 86, mw - 2, 2, shade);
  box(ctx, mx + 1, bottom - 9, mw - 2, 8, shade);
  const bays = 11;
  const pitch = Math.floor((mw - 24) / (bays - 1));
  const first = mid - Math.round((pitch * (bays - 1)) / 2) - 6;
  for (let bay = 0; bay < bays; bay++) {
    const wx = first + bay * pitch;
    const centre = bay === (bays - 1) / 2;
    // Upper windows, with alternating pointed and flat hoods.
    framed(ctx, wx, y + 54, 12, 22, PALETTE.window);
    box(ctx, wx + 5, y + 55, 2, 20, PALETTE.ink);
    box(ctx, wx + 1, y + 64, 10, 1, PALETTE.ink);
    box(ctx, wx - 2, y + 50, 16, 2, deep);
    if (bay % 2 === 0) {
      box(ctx, wx + 1, y + 48, 10, 2, deep);
      box(ctx, wx + 4, y + 46, 4, 2, deep);
    }
    box(ctx, wx - 1, y + 76, 14, 2, shade);
    if (centre) continue;
    // Taller ground-floor windows.
    framed(ctx, wx, y + 96, 12, 26, PALETTE.window);
    box(ctx, wx + 5, y + 97, 2, 24, PALETTE.ink);
    box(ctx, wx + 1, y + 108, 10, 1, PALETTE.ink);
    box(ctx, wx - 2, y + 92, 16, 2, deep);
  }

  // The portico: four tall columns under a pediment, with the door behind.
  const pw = 96;
  const px = mid - pw / 2;
  box(ctx, px, top + 10, pw, bottom - top - 11, "#efede5");
  framed(ctx, mid - 9, y + 98, 18, bottom - (y + 98), "#3d3f4a");
  box(ctx, mid - 1, y + 99, 2, bottom - (y + 100), PALETTE.ink);
  box(ctx, mid - 4, y + 114, 2, 3, PALETTE.yellow);
  box(ctx, mid + 2, y + 114, 2, 3, PALETTE.yellow);
  framed(ctx, mid - 10, y + 91, 20, 8, PALETTE.window);
  box(ctx, mid, y + 62, 1, 8, PALETTE.ink);
  framed(ctx, mid - 3, y + 69, 7, 8, PALETTE.yellow);
  framed(ctx, px - 5, top - 1, pw + 10, 10, white);
  box(ctx, px - 4, top + 6, pw + 8, 2, shade);
  for (let row = 0; row < 24; row++) {
    const half = Math.round((pw / 2 + 5) * (1 - row / 24));
    box(ctx, mid - half - 1, top - 2 - row, half * 2 + 2, 1, PALETTE.ink);
    if (half > 1) box(ctx, mid - half, top - 2 - row, half * 2, 1, row < 2 || half < 4 ? white : row % 23 === 0 ? white : "#f3f1ea");
  }
  box(ctx, mid - 6, top - 12, 12, 5, shade);
  for (const cx of [px + 2, px + 30, px + pw - 38, px + pw - 10]) {
    framed(ctx, cx, top + 9, 8, bottom - top - 12, white);
    box(ctx, cx + 5, top + 10, 2, bottom - top - 14, shade);
    framed(ctx, cx - 2, top + 8, 12, 4, white);
    framed(ctx, cx - 2, bottom - 6, 12, 5, white);
  }
  framed(ctx, px - 8, bottom - 2, pw + 16, 5, white);
  framed(ctx, px - 14, bottom + 2, pw + 28, 5, PALETTE.stone);

  // Shrubs along the base, and the flag on the roof.
  for (let sx = mx + 6; sx < mx + mw - 12; sx += 20) {
    if (sx + 12 > px - 16 && sx < px + pw + 16) continue;
    framed(ctx, sx, bottom - 5, 12, 8, "#3f8f4a");
    box(ctx, sx + 2, bottom - 4, 4, 2, "#58a85f");
  }
  const pole = y - 16;
  box(ctx, mid, pole, 1, 30, PALETTE.ink);
  box(ctx, mid + 1, pole, 14, 9, PALETTE.partyR);
  for (let stripe = 1; stripe < 9; stripe += 4) box(ctx, mid + 1, pole + stripe, 14, 2, PALETTE.white);
  box(ctx, mid + 1, pole, 6, 5, PALETTE.partyD);
}

function drawSmall(ctx: CanvasRenderingContext2D, entry: Site) {
  const { x, y, w, h } = scale(entry.rect);
  if (entry.style === "hopper") {
    // A wooden hopper box with a funnel on top.
    framed(ctx, x + 8, y + 26, w - 16, h - 26, PALETTE.wood);
    for (let bx = x + 10; bx < x + w - 10; bx += 12) box(ctx, bx, y + 28, 1, h - 30, PALETTE.woodDark);
    for (let i = 0; i < 14; i++) box(ctx, x + 4 + i, y + 12 + i, w - 8 - i * 2, 1, i === 0 ? PALETTE.ink : PALETTE.woodDark);
    framed(ctx, x + 2, y + 6, w - 4, 8, PALETTE.wood);
    framed(ctx, x + w / 2 - 12, y + 44, 24, 10, PALETTE.ink);
    return;
  }
  const [roof, roofDark] = roofColors(entry);
  framed(ctx, x, y + 14, w, h - 14, PALETTE.wall);
  box(ctx, x + 1, y + h - 5, w - 2, 4, PALETTE.wallShade);
  // Striped awning.
  framed(ctx, x - 2, y + 4, w + 4, 14, roof);
  for (let sx = x + 4; sx < x + w; sx += 12) box(ctx, sx, y + 5, 6, 12, PALETTE.white);
  box(ctx, x - 1, y + 16, w + 2, 1, roofDark);
  // Counter with a slot or tray.
  framed(ctx, x + 6, y + 24, w - 12, entry.style === "inbox" ? 8 : 12, PALETTE.wood);
  box(ctx, x + 12, y + 27, w - 24, 2, PALETTE.ink);
}

/** Rows of a filled circle, so a dome stays crisp instead of anti-aliased. */
function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, top = -r, bottom = r) {
  for (let dy = Math.round(top); dy < Math.round(bottom); dy++) {
    const half = Math.round(Math.sqrt(Math.max(0, r * r - (dy + 0.5) * (dy + 0.5))));
    if (half > 0) box(ctx, cx - half, cy + dy, half * 2, 1, color);
  }
}

/** The House and Senate: a long roofed hall with a portico, steps and a dome. */
function drawChamber(ctx: CanvasRenderingContext2D, entry: Site) {
  const { x, y, w, h } = scale(entry.rect);
  const [roof, roofDark] = roofColors(entry);
  const roofH = Math.round(h * 0.6);
  const mid = x + Math.round(w / 2);
  const wallTop = y + roofH;
  const wallH = h - roofH;

  // Walls with two storeys of windows.
  framed(ctx, x, wallTop - 2, w, wallH + 2, PALETTE.wall);
  box(ctx, x + 1, wallTop + Math.round(wallH / 2) - 2, w - 2, 3, PALETTE.wallShade);
  box(ctx, x + 1, y + h - 9, w - 2, 8, PALETTE.wallShade);
  const porticoW = 248;
  for (let wx = x + 14; wx + 14 <= x + w - 10; wx += 30) {
    if (wx + 14 > mid - porticoW / 2 - 6 && wx < mid + porticoW / 2 + 6) continue;
    for (const wy of [wallTop + 16, wallTop + Math.round(wallH / 2) + 14]) {
      framed(ctx, wx, wy, 14, 22, PALETTE.window);
      box(ctx, wx + 6, wy + 1, 2, 20, PALETTE.ink);
      box(ctx, wx + 1, wy + 10, 12, 1, PALETTE.ink);
      box(ctx, wx - 2, wy + 22, 18, 3, PALETTE.stoneEdge);
    }
  }

  // Roof: shingle rows, hipped ends and a ridge.
  framed(ctx, x - 4, y, w + 8, roofH, roof);
  for (let row = 6; row < roofH - 3; row += 6) box(ctx, x - 3, y + row, w + 6, 1, roofDark);
  for (let i = 0; i < roofH - 2; i += 2) {
    const reach = Math.round((1 - Math.abs(i - roofH / 2) / (roofH / 2)) * 46);
    box(ctx, x - 3, y + 1 + i, reach, 2, roofDark);
    box(ctx, x + w + 3 - reach, y + 1 + i, reach, 2, roofDark);
  }
  box(ctx, x + 46, y + Math.round(roofH / 2) - 2, w - 92, 4, roofDark);
  box(ctx, x + 46, y + Math.round(roofH / 2) - 1, w - 92, 1, PALETTE.wall);
  box(ctx, x - 3, y + roofH - 4, w + 6, 3, roofDark);
  for (const cx of [x + 120, x + w - 136]) {
    framed(ctx, cx, y + 22, 16, 20, PALETTE.wallShade);
    framed(ctx, cx - 2, y + 18, 20, 6, PALETTE.stoneEdge);
  }

  // Dome on a drum, with a lantern and a flag.
  const domeY = y + Math.round(roofH * 0.6);
  const r = Math.min(74, Math.round(roofH * 0.34));
  framed(ctx, mid - r - 14, domeY + 6, r * 2 + 28, 26, PALETTE.stone);
  framed(ctx, mid - r - 6, domeY - 12, r * 2 + 12, 20, PALETTE.white);
  for (let cx = mid - r; cx < mid + r; cx += 12) framed(ctx, cx, domeY - 9, 6, 14, PALETTE.window);
  disc(ctx, mid, domeY - 12, r + 2, PALETTE.ink, -(r + 2), 0);
  disc(ctx, mid, domeY - 12, r, PALETTE.white, -r, 0);
  for (const rib of [-0.62, -0.25, 0.25, 0.62]) {
    for (let dy = -r + 3; dy < 0; dy++) {
      const half = Math.sqrt(r * r - dy * dy);
      box(ctx, mid + Math.round(half * rib), domeY - 12 + dy, 1, 1, PALETTE.stoneEdge);
    }
  }
  box(ctx, mid - r + 4, domeY - 20, r * 2 - 8, 3, roof);
  framed(ctx, mid - 9, domeY - 12 - r - 14, 18, 18, PALETTE.white);
  framed(ctx, mid - 5, domeY - 12 - r - 10, 10, 9, PALETTE.window);
  disc(ctx, mid, domeY - 12 - r - 14, 8, PALETTE.ink, -8, 0);
  disc(ctx, mid, domeY - 12 - r - 14, 6, PALETTE.gold, -6, 0);
  const pole = domeY - 12 - r - 46;
  box(ctx, mid, pole, 1, 26, PALETTE.ink);
  box(ctx, mid + 1, pole, 16, 10, PALETTE.partyR);
  for (let stripe = 1; stripe < 10; stripe += 4) box(ctx, mid + 1, pole + stripe, 16, 2, PALETTE.white);
  box(ctx, mid + 1, pole, 7, 6, PALETTE.partyD);

  // Portico: pediment, columns, door and steps.
  const px = mid - porticoW / 2;
  framed(ctx, px - 6, wallTop - 8, porticoW + 12, 10, PALETTE.white);
  for (let i = 0; i < 26; i++) {
    const half = Math.round((porticoW / 2 + 4) * (1 - i / 26));
    box(ctx, mid - half, wallTop - 9 - i, half * 2, 1, i === 25 ? PALETTE.ink : PALETTE.white);
    box(ctx, mid - half - 1, wallTop - 9 - i, 1, 1, PALETTE.ink);
    box(ctx, mid + half, wallTop - 9 - i, 1, 1, PALETTE.ink);
  }
  box(ctx, mid - 26, wallTop - 22, 52, 8, roof);
  box(ctx, mid - 14, wallTop - 28, 28, 6, roof);
  framed(ctx, px, wallTop + 2, porticoW, wallH - 16, PALETTE.wallShade);
  const doorW = 34;
  const doorH = Math.min(58, wallH - 30);
  framed(ctx, mid - doorW / 2, y + h - 14 - doorH, doorW, doorH, PALETTE.door);
  box(ctx, mid - 1, y + h - 13 - doorH, 2, doorH - 2, PALETTE.ink);
  box(ctx, mid - 6, y + h - 14 - Math.round(doorH / 2), 2, 3, PALETTE.yellow);
  box(ctx, mid + 4, y + h - 14 - Math.round(doorH / 2), 2, 3, PALETTE.yellow);
  framed(ctx, mid - doorW / 2 - 3, y + h - 20 - doorH, doorW + 6, 7, PALETTE.gold);
  for (let cx = px + 6; cx <= px + porticoW - 16; cx += 30) {
    if (cx + 10 > mid - doorW / 2 - 2 && cx < mid + doorW / 2 + 2) continue;
    framed(ctx, cx, wallTop + 2, 10, wallH - 16, PALETTE.white);
    box(ctx, cx + 6, wallTop + 3, 2, wallH - 18, PALETTE.stone);
    framed(ctx, cx - 2, wallTop + 2, 14, 5, PALETTE.white);
    framed(ctx, cx - 2, y + h - 19, 14, 5, PALETTE.white);
  }
  for (let step = 0; step < 3; step++) {
    framed(ctx, px - 10 - step * 6, y + h - 14 + step * 5, porticoW + 20 + step * 12, 6, step % 2 ? PALETTE.stone : PALETTE.white);
  }
}

/** A gateway in a hedge, with the road running through it: the way to another world. */
function drawGate(ctx: CanvasRenderingContext2D, entry: Site) {
  const { x, y, w, h } = scale(entry.rect);
  box(ctx, x, y + h - 22, w, 22, PALETTE.ink);
  box(ctx, x + 1, y + h - 21, w - 2, 20, "#3f8f4a");
  for (let lx = x + 4; lx < x + w - 4; lx += 7) box(ctx, lx, y + h - 18 + ((lx / 7) % 2) * 5, 3, 3, "#58a85f");
  const mid = x + Math.round(w / 2);
  framed(ctx, mid - 16, y + 2, 32, h - 2, PALETTE.stone);
  box(ctx, mid - 10, y + 14, 20, h - 14, PALETTE.path);
  box(ctx, mid - 11, y + 13, 22, 1, PALETTE.ink);
  box(ctx, mid - 11, y + 13, 1, h - 13, PALETTE.ink);
  box(ctx, mid + 10, y + 13, 1, h - 13, PALETTE.ink);
  framed(ctx, mid - 18, y, 36, 6, PALETTE.wall);
  for (const px of [-16, 12]) framed(ctx, mid + px, y + 6, 4, 8, PALETTE.gold);
}

/** A copper-green roof and dome with the torch of learning on top, after the Jefferson Building. */
function drawLibrary(ctx: CanvasRenderingContext2D, entry: Site) {
  drawRoofed(ctx, entry);
  const { x, y, w } = scale(entry.rect);
  const mid = x + Math.round(w / 2);
  disc(ctx, mid, y + 4, 22, PALETTE.ink, -22, 4);
  disc(ctx, mid, y + 4, 20, "#8cc0aa", -20, 3);
  for (const rib of [-12, -4, 4, 12]) box(ctx, mid + rib - 1, y - 12 + Math.abs(rib) / 2, 1, 14 - Math.abs(rib) / 2, "#64997f");
  framed(ctx, mid - 3, y - 24, 6, 8, PALETTE.gold);
  box(ctx, mid - 2, y - 30, 4, 6, PALETTE.orange);
  box(ctx, mid - 1, y - 33, 2, 4, PALETTE.yellow);
}

/** A grey hall with a flame that is kept burning and a wreath by the door. */
function drawMemorial(ctx: CanvasRenderingContext2D, entry: Site) {
  drawRoofed(ctx, entry);
  const { x, y, w, h } = scale(entry.rect);
  const mid = x + Math.round(w / 2);
  // The flame, in a bowl on the roof.
  framed(ctx, mid - 6, y - 4, 12, 5, PALETTE.stone);
  box(ctx, mid - 3, y - 12, 6, 8, PALETTE.orange);
  box(ctx, mid - 2, y - 15, 4, 5, PALETTE.yellow);
  box(ctx, mid - 1, y - 17, 2, 3, PALETTE.yellow);
  box(ctx, mid - 1, y - 9, 2, 4, PALETTE.white);
  // Wreaths either side of the door.
  for (const wx of [mid - 22, mid + 14]) {
    box(ctx, wx, y + h - 13, 8, 8, PALETTE.ink);
    box(ctx, wx + 1, y + h - 12, 6, 6, "#3f8f4a");
    box(ctx, wx + 3, y + h - 10, 2, 2, PALETTE.wall);
    box(ctx, wx + 3, y + h - 13, 2, 2, PALETTE.partyR);
  }
  // A black band under the eaves.
  box(ctx, x + 1, y + Math.round(h * 0.56) - 1, w - 2, 2, PALETTE.ink);
}

function drawConference(ctx: CanvasRenderingContext2D, entry: Site) {
  drawRoofed(ctx, entry);
  const { x, y, w } = scale(entry.rect);
  // Two chamber pennants on the roof, since both chambers meet here.
  box(ctx, x + 14, y - 10, 1, 12, PALETTE.ink);
  box(ctx, x + 15, y - 10, 8, 5, PALETTE.house);
  box(ctx, x + w - 15, y - 10, 1, 12, PALETTE.ink);
  box(ctx, x + w - 23, y - 10, 8, 5, PALETTE.senate);
}

const scale = (rect: Rect) => ({ x: rect.x * TILE, y: rect.y * TILE, w: rect.w * TILE, h: rect.h * TILE });

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, random: () => number) {
  const dark = random() < 0.5;
  box(ctx, x + 6, y + 8, 4, 8, PALETTE.woodDark);
  const leaf = dark ? "#3f8f4a" : "#4fa458";
  const leafLight = dark ? "#58a85f" : "#6dbd6c";
  box(ctx, x + 2, y - 8, 12, 16, PALETTE.ink);
  box(ctx, x, y - 4, 16, 9, PALETTE.ink);
  box(ctx, x + 3, y - 7, 10, 14, leaf);
  box(ctx, x + 1, y - 3, 14, 7, leaf);
  box(ctx, x + 4, y - 6, 5, 4, leafLight);
  box(ctx, x + 2, y - 1, 3, 2, leafLight);
}

/** A repeating patch of woodland for everything beyond the edge of the map. */
export function drawForest(): HTMLCanvasElement {
  const size = 256; // a power of two, so it can tile
  const [element, ctx] = canvas(size, size);
  const random = rng(1789);
  const tiles = size / TILE;
  box(ctx, 0, 0, size, size, PALETTE.grass);
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const px = tx * TILE;
      const py = ty * TILE;
      if (random() < 0.3) box(ctx, px, py, TILE, TILE, PALETTE.grassLight);
      if (random() < 0.5) {
        const gx = px + 2 + Math.floor(random() * 10);
        const gy = py + 3 + Math.floor(random() * 9);
        box(ctx, gx, gy, 1, 3, PALETTE.grassDark);
        box(ctx, gx + 2, gy + 1, 1, 2, PALETTE.grassDark);
      }
    }
  }
  // Trees row by row, back to front, kept clear of the edges so the patch repeats without a seam.
  for (let ty = 1; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      if (random() < 0.42) {
        drawTree(ctx, tx * TILE + (tx === tiles - 1 ? 0 : Math.floor(random() * 5)), ty * TILE, random);
        tx++; // no two trees on top of each other
      }
    }
  }
  return element;
}

/** A sign of the times on the lawn: where it is, in pixels, and its caption. */
export interface Landmark {
  x: number;
  y: number;
  size: number;
  note: string;
}

// Lawns where the signs of the times go, one to each: by the White House, and down the mall.
const ERA_LAWNS: Rect[] = [
  { x: 70, y: 6, w: 6, h: 4 },
  { x: 82, y: 29, w: 11, h: 6 },
  { x: 82, y: 37, w: 11, h: 7 },
  { x: 82, y: 76, w: 11, h: 10 },
  { x: 82, y: 88, w: 11, h: 9 },
];

/** Something small to draw on a lawn, in a square of `LANDMARK_SIZE` pixels, with its caption. */
export interface LawnMarker {
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void;
  note: string;
}
export const LANDMARK_SIZE = 32;

export function drawGround(layout: Layout, markers: LawnMarker[] = [], seed = 0): { ground: HTMLCanvasElement; landmarks: Landmark[] } {
  const [element, ctx] = canvas(MAP_W * TILE, MAP_H * TILE);
  const random = rng(119);
  const blocked: boolean[][] = Array.from({ length: MAP_H }, () => new Array<boolean>(MAP_W).fill(false));
  const block = (rect: Rect, margin = 0) => {
    for (let ty = Math.floor(rect.y - margin); ty < Math.ceil(rect.y + rect.h + margin); ty++)
      for (let tx = Math.floor(rect.x - margin); tx < Math.ceil(rect.x + rect.w + margin); tx++)
        if (ty >= 0 && ty < MAP_H && tx >= 0 && tx < MAP_W) blocked[ty][tx] = true;
  };

  // Grass with tufts and the odd flower.
  box(ctx, 0, 0, element.width, element.height, PALETTE.grass);
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const px = tx * TILE;
      const py = ty * TILE;
      const roll = random();
      if (roll < 0.3) box(ctx, px, py, TILE, TILE, PALETTE.grassLight);
      if (random() < 0.5) {
        const gx = px + 2 + Math.floor(random() * 10);
        const gy = py + 3 + Math.floor(random() * 9);
        box(ctx, gx, gy, 1, 3, PALETTE.grassDark);
        box(ctx, gx + 2, gy + 1, 1, 2, PALETTE.grassDark);
      }
      if (roll > 0.975) {
        const fx = px + 4 + Math.floor(random() * 6);
        const fy = py + 4 + Math.floor(random() * 6);
        box(ctx, fx, fy, 3, 3, random() < 0.5 ? PALETTE.white : PALETTE.yellow);
        box(ctx, fx + 1, fy + 1, 1, 1, PALETTE.orange);
      }
    }
  }

  // The mall between the avenues.
  const mall: Rect = { x: AVENUE_HOUSE + 2, y: 12, w: AVENUE_SENATE - AVENUE_HOUSE - 2, h: 88 };
  box(ctx, mall.x * TILE, mall.y * TILE, mall.w * TILE, mall.h * TILE, PALETTE.grassLight);
  for (let ty = mall.y; ty < mall.y + mall.h; ty += 2)
    for (let tx = mall.x; tx < mall.x + mall.w; tx += 2) box(ctx, tx * TILE + 7, ty * TILE + 7, 2, 2, PALETTE.grass);

  // Streets.
  for (const lane of layout.lanes) {
    const x1 = Math.round(lane.x1 * TILE);
    const w = Math.round((lane.x2 - lane.x1) * TILE);
    box(ctx, x1, lane.y * TILE, w, TILE, PALETTE.path);
    box(ctx, x1, lane.y * TILE, w, 1, PALETTE.pathEdge);
    box(ctx, x1, lane.y * TILE + TILE - 1, w, 1, PALETTE.pathEdge);
    block({ x: lane.x1, y: lane.y, w: lane.x2 - lane.x1, h: 1 });
  }
  for (const avenue of layout.avenues) {
    const px = avenue.x * TILE;
    const py = avenue.y1 * TILE;
    const h = (avenue.y2 - avenue.y1) * TILE;
    box(ctx, px, py, TILE * 2, h, PALETTE.stone);
    box(ctx, px, py, 1, h, PALETTE.stoneEdge);
    box(ctx, px + TILE * 2 - 1, py, 1, h, PALETTE.stoneEdge);
    for (let y = py + 6; y < py + h; y += 16) box(ctx, px + TILE - 1, y, 2, 6, PALETTE.stoneEdge);
    block({ x: avenue.x, y: avenue.y1, w: 2, h: avenue.y2 - avenue.y1 });
  }

  // Reflecting pool.
  if (layout.pool) {
    const pool = scale(layout.pool);
    framed(ctx, pool.x - 3, pool.y - 3, pool.w + 6, pool.h + 6, PALETTE.stone);
    framed(ctx, pool.x, pool.y, pool.w, pool.h, PALETTE.water);
    for (let wy = pool.y + 6; wy < pool.y + pool.h - 4; wy += 9)
      for (let wx = pool.x + 5 + ((wy / 9) % 2) * 8; wx < pool.x + pool.w - 8; wx += 20) box(ctx, wx, wy, 7, 1, PALETTE.waterLight);
    block(layout.pool, 1);
  }

  // Conveyor beds (the moving chevrons are sprites on top).
  for (const belt of Object.values(layout.conveyors)) {
    if (!belt) continue;
    const x1 = Math.min(belt.from.x, belt.to.x) * TILE;
    const w = Math.abs(belt.to.x - belt.from.x) * TILE;
    const y = belt.from.y * TILE - 7;
    framed(ctx, x1 - 1, y - 2, w + 2, 18, PALETTE.steelDark);
    box(ctx, x1, y, w, 14, "#3d4452");
    for (let leg = x1 + 6; leg < x1 + w; leg += 32) box(ctx, leg, y + 16, 3, 5, PALETTE.ink);
    block({ x: x1 / TILE, y: belt.from.y - 1, w: w / TILE, h: 2.5 });
  }

  // Buildings, and the docks in front of them.
  for (const entry of layout.sites.values()) {
    block(entry.rect, 1);
    block({ x: entry.dock.x, y: entry.dock.y, w: entry.dock.w, h: 1 });
    const dock = { x: entry.dock.x * TILE, y: entry.dock.y * TILE, w: entry.dock.w * TILE };
    box(ctx, dock.x, dock.y + 2, dock.w, TILE - 2, PALETTE.stone);
    box(ctx, dock.x, dock.y + TILE - 1, dock.w, 1, PALETTE.stoneEdge);
    box(ctx, dock.x, dock.y + 2, dock.w, 1, PALETTE.stoneEdge);
    if (entry.style === "chamber") drawChamber(ctx, entry);
    else if (entry.style === "conference") drawConference(ctx, entry);
    else if (entry.style === "whitehouse") drawWhiteHouse(ctx, entry);
    else if (entry.style === "memorial") drawMemorial(ctx, entry);
    else if (entry.style === "library") drawLibrary(ctx, entry);
    else if (entry.style === "gate") drawGate(ctx, entry);
    else if (["inbox", "desk", "hopper"].includes(entry.style)) drawSmall(ctx, entry);
    else drawRoofed(ctx, entry);
  }

  // Signs of the times, each somewhere on its own lawn; the place differs from Congress to Congress.
  const landmarks: Landmark[] = [];
  const spot = rng(seed * 7919 + 13);
  markers.forEach((marker, index) => {
    const lawn = ERA_LAWNS[index % ERA_LAWNS.length];
    for (let attempt = 0; attempt < 60; attempt++) {
      const tx = lawn.x + Math.floor(spot() * (lawn.w - 1));
      const ty = lawn.y + Math.floor(spot() * (lawn.h - 1));
      if (blocked[ty][tx] || blocked[ty][tx + 1] || blocked[ty + 1][tx] || blocked[ty + 1][tx + 1]) continue;
      marker.draw(ctx, tx * TILE, ty * TILE);
      block({ x: tx, y: ty, w: 2, h: 2 });
      landmarks.push({ x: tx * TILE, y: ty * TILE, size: LANDMARK_SIZE, note: marker.note });
      break;
    }
  });

  // Trees on whatever grass is left, denser toward the edges.
  for (let ty = 2; ty < MAP_H - 1; ty++) {
    for (let tx = 1; tx < MAP_W - 1; tx++) {
      if (blocked[ty][tx] || blocked[ty - 1][tx]) continue;
      const edge = Math.min(tx, MAP_W - 1 - tx, ty, MAP_H - 1 - ty);
      const inMall = tx >= mall.x && tx < mall.x + mall.w;
      const chance = edge < 3 ? 0.55 : inMall ? 0.05 : 0.07;
      if (random() < chance) {
        drawTree(ctx, tx * TILE, ty * TILE, random);
        blocked[ty][tx] = true;
        if (tx + 1 < MAP_W) blocked[ty][tx + 1] = true;
      }
    }
  }
  return { ground: element, landmarks };
}

// ── Legislators ──────────────────────────────────────────────────────────────

export const SPRITE_W = 16;
export const SPRITE_H = 24;
const SKIN = ["#f6d3b3", "#eebd97", "#d9a078", "#b97f57", "#8f5c3c", "#6b4329"];
const HAIR = ["#2b2530", "#4a3426", "#6b4a2f", "#a8743b", "#d9b35c", "#8d8d96", "#dcdce4", "#7a3b24"];
const SUIT = ["#3d3f4a", "#56607a", "#6b4f3a", "#7d7f86", "#5d6b47", "#9a865f", "#2b2b33", "#4f5d5a"];

export function partyColor(party: string): string {
  return party === "R" ? PALETTE.partyR : party === "D" ? PALETTE.partyD : PALETTE.partyI;
}

export interface Look {
  seed: string;
  /** "R", "D", anything else for the independent pin, or null for no pin (staff). */
  party: string | null;
  coat?: string;
  cap?: string;
}

/** A 16×24 figure built from seeded parts, seen from the front or the back. It is not a likeness. */
function drawFigure(ctx: CanvasRenderingContext2D, ox: number, oy: number, look: Look, back = false) {
  const random = rng(hash(look.seed));
  const skin = SKIN[Math.floor(random() * SKIN.length)];
  const hair = HAIR[Math.floor(random() * HAIR.length)];
  const suit = look.coat ?? SUIT[Math.floor(random() * SUIT.length)];
  const style = Math.floor(random() * 5);
  const ink = PALETTE.ink;

  // Outline silhouette.
  box(ctx, ox + 4, oy + 1, 8, 10, ink);
  box(ctx, ox + 3, oy + 2, 10, 8, ink);
  box(ctx, ox + 2, oy + 10, 12, 10, ink);
  box(ctx, ox + 4, oy + 19, 8, 5, ink);
  // Head.
  box(ctx, ox + 4, oy + 3, 8, 7, skin);
  box(ctx, ox + 5, oy + 2, 6, 1, skin);
  if (back) {
    // The back of the head is mostly hair.
    if (style !== 4) {
      box(ctx, ox + 4, oy + 2, 8, 6, hair);
      box(ctx, ox + 5, oy + 2, 6, 1, hair);
    } else box(ctx, ox + 4, oy + 6, 8, 2, hair);
    if (style === 1 || style === 3) box(ctx, ox + 4, oy + 8, 8, 2, hair);
    if (style === 3) {
      box(ctx, ox + 3, oy + 3, 1, 7, hair);
      box(ctx, ox + 12, oy + 3, 1, 7, hair);
      box(ctx, ox + 4, oy + 10, 8, 2, hair);
    }
  } else {
    box(ctx, ox + 6, oy + 6, 1, 2, ink);
    box(ctx, ox + 9, oy + 6, 1, 2, ink);
    if (style !== 4) {
      box(ctx, ox + 4, oy + 2, 8, 2, hair);
      box(ctx, ox + 5, oy + 1 + 1, 6, 1, hair);
    }
    if (style === 0) box(ctx, ox + 4, oy + 4, 1, 2, hair);
    if (style === 1) {
      box(ctx, ox + 4, oy + 4, 1, 5, hair);
      box(ctx, ox + 11, oy + 4, 1, 5, hair);
    }
    if (style === 2) box(ctx, ox + 4, oy + 4, 3, 1, hair);
    if (style === 3) {
      box(ctx, ox + 3, oy + 3, 1, 7, hair);
      box(ctx, ox + 12, oy + 3, 1, 7, hair);
      box(ctx, ox + 4, oy + 4, 1, 6, hair);
      box(ctx, ox + 11, oy + 4, 1, 6, hair);
    }
    if (style === 4) {
      box(ctx, ox + 4, oy + 3, 1, 3, hair);
      box(ctx, ox + 11, oy + 3, 1, 3, hair);
    }
  }
  if (look.cap) {
    box(ctx, ox + 4, oy + 1, 8, 3, look.cap);
    box(ctx, ox + 4, oy + 3, 8, 1, ink);
  }
  // Suit; from the front, a shirt and a party pin whose shape differs by party.
  box(ctx, ox + 3, oy + 11, 10, 8, suit);
  if (back) {
    if (style !== 3) box(ctx, ox + 6, oy + 11, 4, 1, PALETTE.white);
    box(ctx, ox + 8, oy + 13, 1, 6, ink);
  } else {
    box(ctx, ox + 7, oy + 11, 2, 4, look.coat ? PALETTE.stoneEdge : PALETTE.white);
    if (look.party !== null) {
      const pin = partyColor(look.party);
      if (look.party === "R") box(ctx, ox + 4, oy + 13, 3, 3, pin);
      else if (look.party === "D") {
        box(ctx, ox + 5, oy + 13, 1, 3, pin);
        box(ctx, ox + 4, oy + 14, 3, 1, pin);
      } else {
        box(ctx, ox + 5, oy + 13, 1, 1, pin);
        box(ctx, ox + 4, oy + 14, 3, 1, pin);
        box(ctx, ox + 5, oy + 15, 1, 1, pin);
      }
    }
  }
  box(ctx, ox + 3, oy + 17, 2, 2, skin);
  box(ctx, ox + 11, oy + 17, 2, 2, skin);
  // Legs and shoes.
  const legs = look.coat ? "#3d3f4a" : suit;
  box(ctx, ox + 5, oy + 19, 2, 4, legs);
  box(ctx, ox + 9, oy + 19, 2, 4, legs);
  box(ctx, ox + 5, oy + 22, 2, 1, ink);
  box(ctx, ox + 9, oy + 22, 2, 1, ink);
}

/** One sheet of figures. Each gets two frames: its key (front) and `${key}:b` (back). */
export function drawFigures(looks: { key: string; look: Look }[]): { canvas: HTMLCanvasElement; frames: Map<string, Rect> } {
  const cols = 32;
  const rows = Math.max(1, Math.ceil(looks.length / cols));
  const [element, ctx] = canvas(cols * SPRITE_W, rows * SPRITE_H * 2);
  const frames = new Map<string, Rect>();
  looks.forEach(({ key, look }, index) => {
    const x = (index % cols) * SPRITE_W;
    const y = Math.floor(index / cols) * SPRITE_H * 2;
    drawFigure(ctx, x, y, look);
    drawFigure(ctx, x, y + SPRITE_H, look, true);
    frames.set(key, { x, y, w: SPRITE_W, h: SPRITE_H });
    frames.set(`${key}:b`, { x, y: y + SPRITE_H, w: SPRITE_W, h: SPRITE_H });
  });
  return { canvas: element, frames };
}

export function drawMembers(members: Member[]): { canvas: HTMLCanvasElement; frames: Map<string, Rect> } {
  return drawFigures(members.map((member) => ({ key: member.id, look: { seed: member.id, party: member.party } })));
}

// ── Small props ──────────────────────────────────────────────────────────────

export function drawPaper(band: string): HTMLCanvasElement {
  const [element, ctx] = canvas(9, 11);
  framed(ctx, 0, 0, 9, 11, PALETTE.white);
  box(ctx, 1, 1, 7, 2, band);
  box(ctx, 2, 5, 5, 1, PALETTE.stoneEdge);
  box(ctx, 2, 7, 5, 1, PALETTE.stoneEdge);
  return element;
}

export function drawCrate(): HTMLCanvasElement {
  const [element, ctx] = canvas(18, 14);
  framed(ctx, 0, 0, 18, 14, PALETTE.wood);
  box(ctx, 1, 4, 16, 1, PALETTE.woodDark);
  box(ctx, 1, 9, 16, 1, PALETTE.woodDark);
  box(ctx, 5, 1, 1, 12, PALETTE.woodDark);
  box(ctx, 12, 1, 1, 12, PALETTE.woodDark);
  return element;
}

export function drawRobot(): HTMLCanvasElement {
  const [element, ctx] = canvas(14, 18);
  box(ctx, 6, 0, 2, 3, PALETTE.ink);
  box(ctx, 5, 0, 4, 2, PALETTE.yellow);
  framed(ctx, 2, 2, 10, 8, PALETTE.steel);
  box(ctx, 4, 4, 6, 3, PALETTE.ink);
  box(ctx, 5, 5, 1, 1, PALETTE.yellow);
  box(ctx, 8, 5, 1, 1, PALETTE.yellow);
  framed(ctx, 1, 9, 12, 6, "#aab6c6");
  box(ctx, 0, 10, 2, 4, PALETTE.steelDark);
  box(ctx, 12, 10, 2, 4, PALETTE.steelDark);
  framed(ctx, 1, 14, 12, 4, PALETTE.steelDark);
  box(ctx, 3, 15, 2, 2, PALETTE.ink);
  box(ctx, 9, 15, 2, 2, PALETTE.ink);
  return element;
}

export function drawBelt(): HTMLCanvasElement {
  const [element, ctx] = canvas(16, 12);
  for (let i = 0; i < 6; i++) {
    box(ctx, 4 + i, i, 3, 1, "#6f7b8f");
    box(ctx, 4 + i, 11 - i, 3, 1, "#6f7b8f");
  }
  return element;
}

export function drawRing(): HTMLCanvasElement {
  const [element, ctx] = canvas(22, 12);
  ctx.strokeStyle = PALETTE.yellow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(11, 6, 9.5, 4.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  return element;
}

export const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];

/** Count badges 1…99 as frames of one texture. */
export function drawBadges(): { canvas: HTMLCanvasElement; frame: (n: number) => Rect } {
  const w = 11;
  const h = 9;
  const [element, ctx] = canvas(w * 10, h * 10);
  for (let n = 1; n < 100; n++) {
    const x = (n % 10) * w;
    const y = Math.floor(n / 10) * h;
    box(ctx, x + 1, y, w - 2, h, PALETTE.ink);
    box(ctx, x, y + 1, w, h - 2, PALETTE.ink);
    const text = String(n);
    let dx = x + Math.floor((w - (text.length * 4 - 1)) / 2);
    for (const char of text) {
      const bits = DIGITS[Number(char)];
      for (let i = 0; i < 15; i++) if (bits[i] === "1") box(ctx, dx + (i % 3), y + 2 + Math.floor(i / 3), 1, 1, PALETTE.yellow);
      dx += 4;
    }
  }
  return { canvas: element, frame: (n) => ({ x: (Math.min(n, 99) % 10) * w, y: Math.floor(Math.min(n, 99) / 10) * h, w, h }) };
}
