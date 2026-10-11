// The maps of the country and of each state, drawn from their grids with the same palette as the rest.

import { PALETTE, box, canvas, hash, rng } from "../world/art";
import { TERRITORY_BOX } from "./shapes";
import { nationSheet, type Sheet } from "./sheet";

/** Pixels to a square of a grid. */
export const CELL = 8;

export const SEA = "#4f9fdc";
const SEA_LIGHT = "#6db4e8";
const SHALLOWS = "#7cc4f2";
const BORDER = "#3d7048";
/** Land comes in a few tones, so that no two neighbours share one. */
const TONES = ["#7cc86a", "#a6d97c", "#c6dc8c", "#64b45c", "#dcd49a"];
const TONE_SHADE = ["#6dba5c", "#96cc6e", "#b6cd7c", "#57a650", "#cdc488"];

/** A tile of open sea, to lay under a map and out past its edges. */
export function drawSea(): HTMLCanvasElement {
  const [element, ctx] = canvas(96, 48);
  box(ctx, 0, 0, 96, 48, SEA);
  box(ctx, 10, 9, 10, 2, SEA_LIGHT);
  box(ctx, 58, 33, 10, 2, SEA_LIGHT);
  box(ctx, 74, 13, 5, 2, SEA_LIGHT);
  box(ctx, 28, 39, 5, 2, SEA_LIGHT);
  return element;
}

const STAR = ["....#....", "....#....", "...###...", "#########", ".#######.", "..#####..", "..#####..", ".###.###.", ".#.....#."];

/** A capital's star, with a dark edge: `size` pixels to each square of the pattern. */
export function drawStar(size: number, color: string): HTMLCanvasElement {
  const edge = size;
  const [element, ctx] = canvas(9 * size + edge * 2, 9 * size + edge * 2);
  const paint = (dx: number, dy: number, fill: string) =>
    STAR.forEach((line, row) => {
      [...line].forEach((mark, col) => {
        if (mark === "#") box(ctx, edge + col * size + dx, edge + row * size + dy, size, size, fill);
      });
    });
  for (const [dx, dy] of [[-edge, 0], [edge, 0], [0, -edge], [0, edge], [-edge, -edge], [edge, -edge], [-edge, edge], [edge, edge]]) paint(dx, dy, PALETTE.ink);
  paint(0, 0, color);
  return element;
}

/** A sheet's land, borders and coast, with whatever else belongs on it drawn on top. Sea is left clear. */
export function drawLand(sheet: Sheet, extras?: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const { w, h, grid } = sheet;
  const [element, ctx] = canvas(w * CELL, h * CELL);
  const cell = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : grid[y * w + x]);

  // Shallow water round every coast.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cell(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (cell(x + dx, y + dy)) near = true;
      if (near) box(ctx, x * CELL, y * CELL, CELL, CELL, SHALLOWS);
    }
  }

  // Land, with a little grain so that it is not flat.
  for (const shape of sheet.shapes.values()) {
    for (const run of shape.runs) box(ctx, run.x1 * CELL, run.y * CELL, (run.x2 - run.x1 + 1) * CELL, CELL, TONES[shape.tone]);
    const random = rng(hash(shape.id));
    for (const run of shape.runs) {
      for (let x = run.x1; x <= run.x2; x++) {
        if (random() < 0.16) box(ctx, x * CELL + 1 + Math.floor(random() * 5), run.y * CELL + 1 + Math.floor(random() * 5), 2, 2, TONE_SHADE[shape.tone]);
      }
    }
  }

  // Borders between neighbours, then the coast over them.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const own = cell(x, y);
      if (!own) continue;
      const right = cell(x + 1, y);
      const below = cell(x, y + 1);
      if (right && right !== own) box(ctx, x * CELL + CELL - 1, y * CELL, 2, CELL, BORDER);
      if (below && below !== own) box(ctx, x * CELL, y * CELL + CELL - 1, CELL, 2, BORDER);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!cell(x, y)) continue;
      const px = x * CELL;
      const py = y * CELL;
      const west = !cell(x - 1, y);
      const east = !cell(x + 1, y);
      if (west) box(ctx, px, py, 2, CELL, PALETTE.ink);
      if (east) box(ctx, px + CELL - 2, py, 2, CELL, PALETTE.ink);
      if (!cell(x, y + 1)) box(ctx, px, py + CELL - 2, CELL, 2, PALETTE.ink);
      if (!cell(x, y - 1)) {
        box(ctx, px, py, CELL, 2, PALETTE.ink);
        // A lighter rim inside a northern coast, so the land seems to stand a little out of the water.
        box(ctx, px + (west ? 2 : 0), py + 2, CELL - (west ? 2 : 0) - (east ? 2 : 0), 1, "rgba(255,255,255,0.35)");
      }
    }
  }

  extras?.(ctx);
  return element;
}

/** What the map of the whole country has besides land: the box round the territories, and a compass. */
export function nationExtras(ctx: CanvasRenderingContext2D) {
  // The territories are not where the map puts them, so they get a box, as Alaska and Hawaii do on a wall map.
  const frame = { x: TERRITORY_BOX.x * CELL, y: TERRITORY_BOX.y * CELL, w: TERRITORY_BOX.w * CELL, h: TERRITORY_BOX.h * CELL };
  for (let x = frame.x; x < frame.x + frame.w; x += 12) {
    box(ctx, x, frame.y, 7, 2, PALETTE.ink);
    box(ctx, x, frame.y + frame.h - 2, 7, 2, PALETTE.ink);
  }
  for (let y = frame.y; y < frame.y + frame.h; y += 12) {
    box(ctx, frame.x, y, 2, 7, PALETTE.ink);
    box(ctx, frame.x + frame.w - 2, y, 2, 7, PALETTE.ink);
  }
  compass(ctx, 229 * CELL, 190 * CELL);
}

/** A compass rose, for the empty middle of the Gulf of Mexico. */
function compass(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  // Each point is a long triangle, light on one side and dark on the other.
  const point = (dx: number, dy: number, length: number, dark: string) => {
    for (let i = 0; i < length; i++) {
      const half = Math.max(1, Math.round(((length - i) / length) * 7));
      if (dx === 0) {
        const y = cy + dy * i - (dy < 0 ? 1 : 0);
        box(ctx, cx - half - 1, y, half * 2 + 2, 1, PALETTE.ink);
        box(ctx, cx - half, y, half, 1, PALETTE.wall);
        box(ctx, cx, y, half, 1, dark);
      } else {
        const x = cx + dx * i - (dx < 0 ? 1 : 0);
        box(ctx, x, cy - half - 1, 1, half * 2 + 2, PALETTE.ink);
        box(ctx, x, cy - half, 1, half, PALETTE.wall);
        box(ctx, x, cy, 1, half, dark);
      }
    }
  };
  point(0, -1, 46, PALETTE.partyR);
  point(0, 1, 34, PALETTE.stoneEdge);
  point(-1, 0, 34, PALETTE.stoneEdge);
  point(1, 0, 34, PALETTE.stoneEdge);
  box(ctx, cx - 4, cy - 4, 8, 8, PALETTE.ink);
  box(ctx, cx - 2, cy - 2, 4, 4, PALETTE.gold);
}

/** The map of the country very small, for the board that stands by the way to it in another world. */
export function drawSmallNation(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const sheet = nationSheet();
  const tones: number[] = [];
  for (const shape of sheet.shapes.values()) tones[shape.index] = shape.tone;
  box(ctx, x, y, w, h, SEA);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const own = sheet.grid[Math.floor(((py + 0.5) / h) * sheet.h) * sheet.w + Math.floor(((px + 0.5) / w) * sheet.w)];
      if (own) box(ctx, x + px, y + py, 1, 1, TONES[tones[own]]);
    }
  }
}
