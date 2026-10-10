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

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const element = document.createElement("canvas");
  element.width = w;
  element.height = h;
  const ctx = element.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [element, ctx];
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function framed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
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
    case "bin":
      return [PALETTE.steel, PALETTE.steelDark];
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
  if (entry.style === "whitehouse" || entry.style === "archive" || entry.style === "hall") {
    for (let cx = x + 6; cx < x + w - 6; cx += 14) {
      if (cx + 4 > doorX - 2 && cx < doorX + doorW + 2) continue;
      framed(ctx, cx, y + roofH - 2, 5, h - roofH + 2, PALETTE.white);
    }
    // Pediment.
    const mid = x + w / 2;
    for (let i = 0; i < 9; i++) box(ctx, mid - 18 + i * 2, y + roofH - 4 - i, 36 - i * 4, 1, i === 8 ? PALETTE.ink : PALETTE.white);
  }
  if (entry.style === "whitehouse") {
    box(ctx, x + w / 2, y - 12, 1, 12, PALETTE.ink);
    box(ctx, x + w / 2 + 1, y - 12, 8, 5, PALETTE.partyR);
    box(ctx, x + w / 2 + 1, y - 12, 4, 3, PALETTE.partyD);
    box(ctx, x + w / 2 + 1, y - 9, 8, 1, PALETTE.white);
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

function drawSmall(ctx: CanvasRenderingContext2D, entry: Site) {
  const { x, y, w, h } = scale(entry.rect);
  if (entry.style === "bin") {
    framed(ctx, x + 8, y + 14, w - 16, h - 14, PALETTE.steel);
    framed(ctx, x + 4, y + 8, w - 8, 8, PALETTE.steelDark);
    for (let bx = x + 16; bx < x + w - 14; bx += 10) box(ctx, bx, y + 22, 2, h - 28, PALETTE.steelDark);
    return;
  }
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

function drawChamber(ctx: CanvasRenderingContext2D, entry: Site) {
  const { x, y, w, h } = scale(entry.rect);
  const senate = entry.wing === "Senate";
  const accent = senate ? PALETTE.senate : PALETTE.house;
  const accentDark = senate ? PALETTE.senateDark : PALETTE.houseDark;
  const wall = TILE;
  framed(ctx, x, y, w, h, PALETTE.wall);
  box(ctx, x + 1, y + 1, w - 2, 5, accent);
  box(ctx, x + 1, y + 6, w - 2, 1, accentDark);
  // Carpeted floor.
  framed(ctx, x + wall - 1, y + wall + 7, w - wall * 2 + 2, h - wall * 2 - 5, senate ? PALETTE.senateCarpet : PALETTE.houseCarpet);
  const floorTop = y + wall + 8;
  const floorH = h - wall * 2 - 7;
  for (let cy = floorTop + 14; cy < floorTop + floorH; cy += 16) box(ctx, x + wall, cy, w - wall * 2, 1, PALETTE.wallShade);
  // Centre aisle and rostrum.
  box(ctx, x + w / 2 - 20, floorTop, 40, floorH, PALETTE.path);
  framed(ctx, x + w / 2 - 44, floorTop + 6, 88, 20, PALETTE.wood);
  framed(ctx, x + w / 2 - 22, floorTop + 2, 44, 12, PALETTE.woodDark);
  box(ctx, x + w / 2 - 2, floorTop - 12, 1, 14, PALETTE.ink);
  box(ctx, x + w / 2 - 1, floorTop - 12, 9, 6, accent);
  // Columns along the walls and a doorway at the bottom.
  for (let cx = x + 10; cx < x + w - 10; cx += 28) framed(ctx, cx, y + h - wall, 6, wall, PALETTE.white);
  box(ctx, x + w / 2 - 14, y + h - wall, 28, wall, PALETTE.path);
  box(ctx, x + w / 2 - 15, y + h - wall, 1, wall, PALETTE.ink);
  box(ctx, x + w / 2 + 14, y + h - wall, 1, wall, PALETTE.ink);
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

export function drawGround(layout: Layout): HTMLCanvasElement {
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
  const pool = scale(layout.pool);
  framed(ctx, pool.x - 3, pool.y - 3, pool.w + 6, pool.h + 6, PALETTE.stone);
  framed(ctx, pool.x, pool.y, pool.w, pool.h, PALETTE.water);
  for (let wy = pool.y + 6; wy < pool.y + pool.h - 4; wy += 9)
    for (let wx = pool.x + 5 + ((wy / 9) % 2) * 8; wx < pool.x + pool.w - 8; wx += 20) box(ctx, wx, wy, 7, 1, PALETTE.waterLight);
  block(layout.pool, 1);

  // Conveyor beds (the moving chevrons are sprites on top).
  for (const belt of Object.values(layout.conveyors)) {
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
    else if (["inbox", "desk", "hopper", "bin"].includes(entry.style)) drawSmall(ctx, entry);
    else drawRoofed(ctx, entry);
  }

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
  return element;
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

/** A 16×24 figure built from seeded parts. It is not a likeness of the member. */
function drawFigure(ctx: CanvasRenderingContext2D, ox: number, oy: number, member: Member) {
  const random = rng(hash(member.id));
  const skin = SKIN[Math.floor(random() * SKIN.length)];
  const hair = HAIR[Math.floor(random() * HAIR.length)];
  const suit = SUIT[Math.floor(random() * SUIT.length)];
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
  box(ctx, ox + 6, oy + 6, 1, 2, ink);
  box(ctx, ox + 9, oy + 6, 1, 2, ink);
  // Hair.
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
  // Suit, shirt, and a party pin whose shape differs by party.
  box(ctx, ox + 3, oy + 11, 10, 8, suit);
  box(ctx, ox + 7, oy + 11, 2, 4, PALETTE.white);
  const pin = partyColor(member.party);
  if (member.party === "R") box(ctx, ox + 4, oy + 13, 3, 3, pin);
  else if (member.party === "D") {
    box(ctx, ox + 5, oy + 13, 1, 3, pin);
    box(ctx, ox + 4, oy + 14, 3, 1, pin);
  } else {
    box(ctx, ox + 5, oy + 13, 1, 1, pin);
    box(ctx, ox + 4, oy + 14, 3, 1, pin);
    box(ctx, ox + 5, oy + 15, 1, 1, pin);
  }
  box(ctx, ox + 3, oy + 17, 2, 2, skin);
  box(ctx, ox + 11, oy + 17, 2, 2, skin);
  // Legs and shoes.
  box(ctx, ox + 5, oy + 19, 2, 4, suit);
  box(ctx, ox + 9, oy + 19, 2, 4, suit);
  box(ctx, ox + 5, oy + 22, 2, 1, ink);
  box(ctx, ox + 9, oy + 22, 2, 1, ink);
}

export function drawMembers(members: Member[]): { canvas: HTMLCanvasElement; frames: Map<string, Rect> } {
  const cols = 32;
  const rows = Math.max(1, Math.ceil(members.length / cols));
  const [element, ctx] = canvas(cols * SPRITE_W, rows * SPRITE_H);
  const frames = new Map<string, Rect>();
  members.forEach((member, index) => {
    const x = (index % cols) * SPRITE_W;
    const y = Math.floor(index / cols) * SPRITE_H;
    drawFigure(ctx, x, y, member);
    frames.set(member.id, { x, y, w: SPRITE_W, h: SPRITE_H });
  });
  return { canvas: element, frames };
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

const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];

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
