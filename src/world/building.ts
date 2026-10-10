// The inside of the House or Senate building: rooms, furniture, the places a
// person can be, and a grid for finding a way between them. Drawn at runtime
// like the rest of the art. The floor plan is invented; it is not the real one.

import type { Member } from "../data/types";
import { PALETTE, box, canvas, framed, hash, rng } from "./art";

export const T = 16;
export type Wing = "House" | "Senate";
export type Face = "up" | "down";
export type SpotKind =
  | "seat"
  | "preside"
  | "speak"
  | "queue"
  | "eat"
  | "desk"
  | "sofa"
  | "read"
  | "chat"
  | "press"
  | "hearing"
  | "gym"
  | "errand";

export interface Spot {
  tx: number;
  ty: number;
  /** Pixel nudge, for places centred between two tiles. */
  dx: number;
  kind: SpotKind;
  face: Face;
  room: string;
  /** Whose cloakroom this is, when that matters. */
  party?: "D" | "R";
  /** A desk that belongs to one member. */
  owner?: string;
  /** For meals: the tile row of the table the tray goes on. */
  table?: number;
  taken: string | null;
}

export interface Room {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StaffSpot {
  frame: string;
  tx: number;
  ty: number;
  dx: number;
  face: Face;
}

export interface Building {
  /** Names this floor plan's textures. */
  key: string;
  wing: Wing;
  w: number;
  h: number;
  ground: HTMLCanvasElement;
  /** Furniture people can stand behind. The scene slices it into rows and sorts them with the figures. */
  over: HTMLCanvasElement;
  rooms: Room[];
  spots: Spot[];
  seats: Map<string, Spot>;
  staff: StaffSpot[];
  pages: number;
  cells: Uint8Array;
  /** Where the bills on the floor are piled, in pixels. */
  clerk: { x: number; y: number };
  /** A wall calendar that can be taken down and read, in pixels. Committee rooms only. */
  calendar?: { x: number; y: number };
}

export interface Leaders {
  speaker?: string;
  majority?: string;
}

const WALL = 0;
const FLOOR = 1;
const BLOCK = 2;
const CHAIR = 3; // somewhere to sit: a destination, not a way through
const DESK = 4; // a seat behind a fixed desk: reached from behind or the side, never over the desk

const SIDE = 17;
const COR = 3;
const NORTH = 10;
const SOUTH = 11;
const LOBBY = 22;

type Floor = "corridor" | "carpet" | "wood" | "tile" | "green" | "marble" | "blue" | "rubber";

const WOOD = PALETTE.wood;
const WOOD_DARK = PALETTE.woodDark;
const WALNUT = "#6f4526";
const LEATHER = "#9a4f3c";
const LEATHER_DARK = "#733726";
const CAP = "#b3aa95";
const BOOKS = ["#b5453c", "#3a6fd8", "#3f8f4a", "#e0aa3e", "#8f5fb0", "#e58a45", "#f4ecd6", "#2f9e8f", "#56607a"];
const FOOD = ["#e58a45", "#74c365", "#d8433b", "#ffd84a", "#f4ecd6", "#b98452"];

export function spotXY(spot: { tx: number; ty: number; dx?: number }): { x: number; y: number } {
  return { x: spot.tx * T + 8 + (spot.dx ?? 0), y: spot.ty * T + 13 };
}

/** The drawing surfaces, the grid, and the furniture every floor plan is built from. */
function makeKit(W: number, H: number, carpet: string, carpetDot: string, seed: number) {
  const [ground, g] = canvas(W * T, H * T);
  const [over, o] = canvas(W * T, H * T);
  const random = rng(seed);
  const pick = <V>(list: readonly V[]) => list[Math.floor(random() * list.length)];

  const cells = new Uint8Array(W * H).fill(FLOOR);
  const floors: Floor[] = new Array<Floor>(W * H).fill("corridor");
  const rooms: Room[] = [];
  const spots: Spot[] = [];
  const staff: StaffSpot[] = [];
  const seats = new Map<string, Spot>();

  const set = (tx: number, ty: number, value: number) => {
    if (tx >= 0 && ty >= 0 && tx < W && ty < H) cells[ty * W + tx] = value;
  };
  const block = (tx: number, ty: number, w = 1, h = 1) => {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) set(x, y, BLOCK);
  };
  const spot = (kind: SpotKind, tx: number, ty: number, face: Face, room: string, extra: Partial<Spot> = {}): Spot => {
    const entry: Spot = { tx, ty, dx: 0, kind, face, room, taken: null, ...extra };
    spots.push(entry);
    return entry;
  };
  const person = (frame: string, tx: number, ty: number, face: Face, dx = 0) => {
    staff.push({ frame, tx, ty, dx, face });
    set(tx, ty, BLOCK);
    if (dx) set(tx + 1, ty, BLOCK);
  };

  // ── Rooms ──────────────────────────────────────────────────────────────────

  for (let x = 0; x < W; x++) {
    set(x, 0, WALL);
    set(x, H - 1, WALL);
  }
  for (let y = 0; y < H; y++) {
    set(0, y, WALL);
    set(W - 1, y, WALL);
  }

  /** A walled room; x, y, w, h include the walls. Returns the floor area inside. */
  const room = (key: string, label: string, x: number, y: number, w: number, h: number, floor: Floor) => {
    rooms.push({ key, label, x, y, w, h });
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        const edge = tx === x || ty === y || tx === x + w - 1 || ty === y + h - 1;
        set(tx, ty, edge ? WALL : FLOOR);
        floors[ty * W + tx] = floor;
      }
    }
    return { key, ix: x + 1, iy: y + 1, iw: w - 2, ih: h - 2 };
  };
  const door = (tx: number, ty: number, w = 1, h = 1) => {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        set(x, y, FLOOR);
        floors[y * W + x] = "corridor";
      }
    }
  };


  /** Paint the floors and walls. Call once the rooms and doors are laid out, before any furniture. */
  const paint = () => {
    const isWall = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < W && ty < H && cells[ty * W + tx] === WALL;
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        const x = tx * T;
        const y = ty * T;
        if (isWall(tx, ty)) continue;
        switch (floors[ty * W + tx]) {
          case "corridor":
            box(g, x, y, T, T, (tx + ty) % 2 ? "#e9e3d3" : "#e2dbc9");
            box(g, x, y + T - 1, T, 1, "#d3cbb6");
            box(g, x + T - 1, y, 1, T, "#d3cbb6");
            break;
          case "carpet":
            box(g, x, y, T, T, carpet);
            if ((tx + ty) % 2) box(g, x + 7, y + 7, 2, 2, carpetDot);
            break;
          case "wood":
            box(g, x, y, T, T, "#cfa46d");
            box(g, x, y + 7, T, 1, WOOD);
            box(g, x, y + 15, T, 1, WOOD);
            box(g, x + (tx % 2 ? 4 : 11), y, 1, 7, WOOD);
            box(g, x + (tx % 2 ? 12 : 3), y + 8, 1, 7, WOOD);
            break;
          case "tile":
            box(g, x, y, T, T, (tx + ty) % 2 ? "#f4f1e8" : "#d6e3e6");
            break;
          case "green":
            box(g, x, y, T, T, "#5f9a78");
            box(g, x + 7, y + 3, 2, 2, "#4f8767");
            box(g, x + 3, y + 11, 2, 2, "#73ad8a");
            break;
          case "marble":
            box(g, x, y, T, T, "#f1ebdf");
            box(g, x, y + T - 1, T, 1, "#ddd5c4");
            box(g, x + T - 1, y, 1, T, "#ddd5c4");
            if ((tx + ty) % 2 === 0) box(g, x + 6, y + 6, 3, 3, PALETTE.stoneEdge);
            break;
          case "blue":
            box(g, x, y, T, T, "#8395b8");
            box(g, x + 3, y + 4, 2, 1, "#7486aa");
            box(g, x + 10, y + 11, 2, 1, "#7486aa");
            break;
          case "rubber":
            box(g, x, y, T, T, "#5f6b82");
            box(g, x + 4, y + 5, 1, 1, "#7d8aa3");
            box(g, x + 11, y + 12, 1, 1, "#7d8aa3");
            break;
        }
      }
    }
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        if (!isWall(tx, ty)) continue;
        const x = tx * T;
        const y = ty * T;
        const faces = ty < H - 1 && !isWall(tx, ty + 1); // a wall you see the front of
        box(g, x, y, T, T, CAP);
        if (faces) {
          box(g, x, y + 4, T, T - 4, PALETTE.wall);
          box(g, x, y + 4, T, 1, PALETTE.ink);
          box(g, x, y + T - 3, T, 3, PALETTE.wallShade);
        }
        if (!isWall(tx - 1, ty)) box(g, x, y, 1, T, PALETTE.ink);
        if (!isWall(tx + 1, ty)) box(g, x + T - 1, y, 1, T, PALETTE.ink);
        if (!isWall(tx, ty - 1)) box(g, x, y, T, 1, PALETTE.ink);
        if (ty === H - 1) box(g, x, y + T - 1, T, 1, PALETTE.ink);
      }
    }

  };

  // ── Furniture ──────────────────────────────────────────────────────────────

  const table = (tx: number, ty: number, w: number, top: string = WOOD, edge: string = WOOD_DARK) => {
    const x = tx * T;
    const y = ty * T;
    framed(o, x + 1, y - 7, w * T - 2, 17, top);
    box(o, x + 2, y + 6, w * T - 4, 3, edge);
    box(o, x + 3, y + 10, 2, 4, PALETTE.ink);
    box(o, x + w * T - 5, y + 10, 2, 4, PALETTE.ink);
    block(tx, ty, w);
  };
  /** A chair whose sitter faces us: the back is behind them. */
  const chairDown = (tx: number, ty: number, color: string = WOOD_DARK) => {
    framed(g, tx * T + 3, ty * T - 8, 10, 18, color);
    set(tx, ty, CHAIR);
  };
  /** A chair whose sitter faces away: the back covers them. */
  const chairUp = (tx: number, ty: number, color: string = WOOD_DARK, light: string = WOOD) => {
    const x = tx * T;
    const y = ty * T;
    framed(o, x + 3, y + 4, 10, 10, color);
    box(o, x + 4, y + 5, 8, 2, light);
    box(o, x + 3, y + 14, 2, 2, PALETTE.ink);
    box(o, x + 11, y + 14, 2, 2, PALETTE.ink);
    set(tx, ty, CHAIR);
  };
  const sofa = (tx: number, ty: number, w: number) => {
    const x = tx * T;
    const y = ty * T;
    framed(g, x, y - 9, w * T, 21, LEATHER);
    box(g, x + 1, y - 8, w * T - 2, 3, "#b56450");
    for (let i = 1; i < w; i++) box(g, x + i * T, y - 5, 1, 14, LEATHER_DARK);
    framed(o, x - 1, y - 3, 5, 19, LEATHER_DARK);
    framed(o, x + w * T - 4, y - 3, 5, 19, LEATHER_DARK);
    framed(o, x + 3, y + 10, w * T - 6, 6, LEATHER_DARK);
    for (let i = 0; i < w; i++) set(tx + i, ty, CHAIR);
  };
  const shelf = (tx: number, ty: number, w: number) => {
    const x = tx * T;
    const y = ty * T;
    framed(o, x, y - 13, w * T, 27, WALNUT);
    for (let row = 0; row < 3; row++) {
      const sy = y - 11 + row * 8;
      box(o, x + 2, sy, w * T - 4, 7, "#3b2a1c");
      let bx = x + 2;
      while (bx < x + w * T - 4) {
        const bw = Math.min(2 + Math.floor(random() * 2), x + w * T - 2 - bx);
        if (random() < 0.9) box(o, bx, sy + (random() < 0.3 ? 1 : 0), bw, 7, pick(BOOKS));
        bx += bw;
      }
    }
    block(tx, ty, w);
  };
  const plant = (tx: number, ty: number) => {
    const x = tx * T;
    const y = ty * T;
    framed(o, x + 4, y + 6, 8, 9, PALETTE.orange);
    framed(o, x + 2, y - 10, 12, 17, "#3f8f4a");
    box(o, x + 4, y - 8, 5, 5, "#58a85f");
    box(o, x + 9, y - 2, 3, 4, "#58a85f");
    block(tx, ty);
  };
  const lectern = (tx: number, ty: number) => {
    const x = tx * T;
    const y = ty * T;
    framed(o, x + 5, y, 6, 13, WOOD_DARK);
    framed(o, x + 2, y + 11, 12, 4, WOOD_DARK);
    framed(o, x + 1, y - 8, 14, 10, WOOD);
    box(o, x + 2, y - 7, 12, 2, "#d3a36c");
    box(o, x + 8, y - 12, 1, 5, PALETTE.ink);
    box(o, x + 7, y - 13, 3, 2, PALETTE.ink);
    block(tx, ty);
  };
  const flag = (tx: number, ty: number, banner?: string) => {
    const x = tx * T;
    const y = ty * T;
    box(o, x + 6, y - 20, 1, 33, PALETTE.ink);
    box(o, x + 5, y - 21, 3, 2, PALETTE.gold);
    framed(o, x + 4, y + 11, 6, 4, PALETTE.goldDark);
    if (banner) box(o, x + 7, y - 19, 8, 13, banner);
    else {
      box(o, x + 7, y - 19, 8, 13, PALETTE.partyR);
      for (let stripe = 2; stripe < 13; stripe += 4) box(o, x + 7, y - 19 + stripe, 8, 2, PALETTE.white);
      box(o, x + 7, y - 19, 4, 6, PALETTE.partyD);
    }
    block(tx, ty);
  };
  const vending = (tx: number, ty: number, color: string) => {
    const x = tx * T;
    const y = ty * T;
    framed(o, x + 1, y - 14, 14, 29, color);
    framed(o, x + 3, y - 11, 7, 15, "#2b2530");
    for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) box(o, x + 4 + col * 3, y - 10 + row * 5, 2, 3, pick(FOOD));
    box(o, x + 11, y - 8, 2, 6, PALETTE.white);
    box(o, x + 3, y + 7, 10, 4, PALETTE.ink);
    block(tx, ty);
  };
  const cooler = (tx: number, ty: number) => {
    const x = tx * T;
    const y = ty * T;
    framed(o, x + 4, y - 11, 8, 11, PALETTE.waterLight);
    framed(o, x + 3, y - 1, 10, 15, PALETTE.white);
    box(o, x + 5, y + 3, 2, 2, PALETTE.partyD);
    box(o, x + 9, y + 3, 2, 2, PALETTE.partyR);
    block(tx, ty);
  };
  const coatRack = (tx: number, ty: number) => {
    const x = tx * T;
    const y = ty * T;
    box(o, x + 7, y - 16, 2, 30, WOOD_DARK);
    box(o, x + 3, y - 15, 10, 1, WOOD_DARK);
    framed(o, x + 1, y - 14, 6, 14, "#56607a");
    framed(o, x + 9, y - 14, 6, 12, "#7b4a2b");
    box(o, x + 4, y + 13, 8, 2, PALETTE.ink);
    block(tx, ty);
  };
  const tripod = (tx: number, ty: number) => {
    const x = tx * T;
    const y = ty * T;
    box(o, x + 7, y - 2, 2, 10, PALETTE.ink);
    box(o, x + 3, y + 8, 2, 7, PALETTE.ink);
    box(o, x + 11, y + 8, 2, 7, PALETTE.ink);
    box(o, x + 5, y + 6, 6, 2, PALETTE.ink);
    framed(o, x + 2, y - 12, 12, 10, "#3d3f4a");
    box(o, x + 6, y - 9, 4, 4, PALETTE.window);
    box(o, x + 11, y - 14, 3, 2, PALETTE.partyR);
    block(tx, ty);
  };
  const treadmill = (tx: number, ty: number) => {
    const x = tx * T;
    const y = ty * T;
    framed(g, x + 1, y - 4, 14, 20, "#3d4452");
    for (let line = y - 1; line < y + 14; line += 3) box(g, x + 3, line, 10, 1, "#6f7b8f");
    box(o, x + 1, y + 2, 2, 9, PALETTE.steelDark);
    box(o, x + 13, y + 2, 2, 9, PALETTE.steelDark);
    framed(o, x + 1, y + 9, 14, 6, PALETTE.steel);
    box(o, x + 6, y + 11, 4, 2, PALETTE.yellow);
    set(tx, ty, CHAIR);
  };
  const rug = (tx: number, ty: number, w: number, h: number, color: string, trim: string) => {
    framed(g, tx * T + 2, ty * T + 2, w * T - 4, h * T - 4, color);
    box(g, tx * T + 5, ty * T + 5, w * T - 10, 1, trim);
    box(g, tx * T + 5, (ty + h) * T - 6, w * T - 10, 1, trim);
    box(g, tx * T + 5, ty * T + 5, 1, h * T - 10, trim);
    box(g, (tx + w) * T - 6, ty * T + 5, 1, h * T - 10, trim);
  };
  const picture = (tx: number, wallRow: number, wide = 1) => {
    const x = tx * T;
    const y = wallRow * T;
    framed(g, x + 2, y + 5, wide * T - 4, 9, PALETTE.goldDark);
    box(g, x + 4, y + 7, wide * T - 8, 5, pick(["#6fa0c9", "#7fae6b", "#c98b6f", "#8f79b0"]));
    box(g, x + 4, y + 10, wide * T - 8, 2, pick(["#4f8767", "#5f6a7a", "#8a5d36"]));
  };
  const windowAt = (tx: number, wallRow: number) => {
    const x = tx * T;
    const y = wallRow * T;
    framed(g, x + 2, y + 5, 12, 9, PALETTE.window);
    box(g, x + 7, y + 6, 2, 7, PALETTE.ink);
    box(g, x + 3, y + 6, 3, 2, PALETTE.white);
  };
  const papers = (x: number, y: number) => {
    framed(o, x, y, 7, 5, PALETTE.white);
    box(o, x + 2, y + 2, 3, 1, PALETTE.stoneEdge);
  };
  const monitor = (x: number, y: number) => {
    framed(o, x, y, 9, 7, "#2b2530");
    box(o, x + 1, y + 1, 7, 4, PALETTE.window);
    box(o, x + 3, y + 7, 3, 2, PALETTE.ink);
  };

  const bust = (tx: number, ty: number) => {
    const x = tx * T;
    const y = ty * T;
    framed(o, x + 2, y + 2, 12, 13, PALETTE.stone);
    box(o, x + 3, y + 11, 10, 3, PALETTE.stoneEdge);
    framed(o, x + 4, y - 11, 8, 14, "#cfd3d6");
    framed(o, x + 5, y - 18, 6, 8, "#cfd3d6");
    block(tx, ty);
  };
  return {
    ground, over, g, o, cells, rooms, spots, staff, seats, pick, set, block, spot, person, room, door, paint,
    table, chairDown, chairUp, sofa, shelf, plant, lectern, flag, vending, cooler, coatRack, tripod, treadmill,
    rug, picture, windowAt, papers, monitor, bust,
  };
}

export function buildBuilding(wing: Wing, members: Member[], leaders: Leaders): Building {
  const order = (list: Member[]) => [...list].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  const left = order(members.filter((m) => m.party !== "R"));
  const right = order(members.filter((m) => m.party === "R"));
  const bc = members.length > 200 ? 10 : 5; // seats across one block
  const rows = Math.max(3, Math.ceil(Math.max(left.length, right.length) / (2 * bc)));
  const cw = 4 * bc + 6;
  const ch = 9 + 2 * rows;
  const CW = cw + 2;
  const CH = ch + 2;
  const W = 2 * SIDE + 2 * COR + CW;
  const H = NORTH + 2 * COR + CH + SOUTH;
  const house = wing === "House";
  const accent = house ? PALETTE.house : PALETTE.senate;
  const accentDark = house ? PALETTE.houseDark : PALETTE.senateDark;
  const carpet = house ? PALETTE.houseCarpet : PALETTE.senateCarpet;
  const carpetDot = house ? "#b5dccd" : "#d2c0e3";

  const kit = makeKit(W, H, carpet, carpetDot, house ? 435 : 100);
  const { ground, over, g, o, cells, rooms, spots, staff, seats, set, block, spot, person, room, door } = kit;
  const { table, chairDown, chairUp, sofa, shelf, plant, lectern, flag, vending, cooler, coatRack, tripod, treadmill } = kit;
  const { rug, picture, windowAt, papers, monitor, pick } = kit;

  const chamberX = SIDE + COR;
  const chamberY = NORTH + COR;
  const southY = H - SOUTH;
  const topH = Math.ceil((CH + 1) / 2);
  const lowY = chamberY + topH - 1;
  const lowH = CH - topH + 1;
  const eastX = W - SIDE;
  const lobbyX = Math.floor((W - LOBBY) / 2);
  const pressX = lobbyX + LOBBY - 1;
  const pressW = Math.floor((W - pressX + 1) / 2);
  const gymX = pressX + pressW - 1;

  const officeCount = Math.round((W - 1) / 11);
  const officeNames: { label: string; owner?: string; clerk?: boolean }[] = [];
  for (let i = 0; i < officeCount; i++) officeNames.push({ label: "Members’ Offices" });
  const centre = Math.floor(officeCount / 2);
  if (house) {
    officeNames[centre - 1] = { label: "Speaker’s Office", owner: leaders.speaker };
    officeNames[centre] = { label: "Majority Leader’s Office", owner: leaders.majority };
    officeNames[centre + 1] = { label: "Clerk’s Office", clerk: true };
  } else {
    officeNames[centre - 1] = { label: "Majority Leader’s Office", owner: leaders.majority };
    officeNames[centre] = { label: "Secretary’s Office", clerk: true };
  }
  const offices = officeNames.map((info, i) => {
    const x1 = Math.round((i * (W - 1)) / officeCount);
    const x2 = Math.round(((i + 1) * (W - 1)) / officeCount);
    return { info, inner: room(`office-${i}`, info.label, x1, 0, x2 - x1 + 1, NORTH, "wood"), x1, x2 };
  });
  const cloakD = room("cloak-d", "Democratic Cloakroom", 0, chamberY, SIDE, topH, "green");
  const library = room("library", "Library", 0, lowY, SIDE, lowH, "wood");
  const cloakR = room("cloak-r", "Republican Cloakroom", eastX, chamberY, SIDE, topH, "green");
  const hearing = room("hearing", "Hearing Room", eastX, lowY, SIDE, lowH, "blue");
  const cafe = room("cafeteria", "Cafeteria", 0, southY, lobbyX + 1, SOUTH, "tile");
  const lobby = room("rotunda", "Rotunda", lobbyX, southY, LOBBY, SOUTH, "marble");
  const press = room("press", "Press Room", pressX, southY, pressW, SOUTH, "blue");
  const gym = room("gym", "Gym", gymX, southY, W - gymX, SOUTH, "rubber");
  const hall = room("chamber", `${wing} Chamber`, chamberX, chamberY, CW, CH, "carpet");

  const mid = hall.ix + 2 * bc + 2; // left column of the centre aisle
  const crossRow = hall.iy + 6;
  for (const office of offices) door(office.x1 + Math.floor((office.x2 - office.x1) / 2), NORTH - 1);
  door(SIDE - 1, chamberY + Math.floor(topH / 2), 1, 2);
  door(SIDE - 1, lowY + Math.floor(lowH / 2), 1, 2);
  door(eastX, chamberY + Math.floor(topH / 2), 1, 2);
  door(eastX, lowY + Math.floor(lowH / 2), 1, 2);
  door(mid, chamberY + CH - 1, 2);
  door(chamberX, crossRow);
  door(chamberX + CW - 1, crossRow);
  door(cafe.ix + Math.max(6, Math.min(10, Math.floor(cafe.iw * 0.32))) + 1, southY, 2);
  door(cafe.ix + cafe.iw - 5, southY, 2);
  door(lobby.ix + lobby.iw / 2 - 4, southY, 8);
  door(press.ix + press.iw - 1, southY);
  door(gym.ix + 1, southY);

  kit.paint();

  // Offices along the north side.
  for (const { info, inner } of offices) {
    const { key, ix, iy, iw, ih } = inner;
    const cx = ix + Math.floor(iw / 2);
    windowAt(ix + 1, 0);
    windowAt(ix + iw - 2, 0);
    picture(cx - 1, 0, 2);
    plant(ix + iw - 1, iy);
    if (info.owner !== undefined || info.clerk) {
      shelf(ix, iy, 2);
      rug(cx - 2, iy + 3, 5, 3, info.clerk ? "#7f90b4" : accent, info.clerk ? "#c8d1e4" : carpet);
      chairDown(cx, iy + 1, LEATHER_DARK);
      table(cx - 1, iy + 2, 3, WALNUT, "#4f2f18");
      papers(cx * T - 11, (iy + 2) * T - 4);
      monitor(cx * T + 18, (iy + 2) * T - 9);
      flag(ix + 2, iy);
      if (info.clerk) person("clerk-0", cx, iy + 1, "down");
      else spot("desk", cx, iy + 1, "down", key, { owner: info.owner ?? "nobody" });
      chairUp(cx - 1, iy + 4);
      chairUp(cx + 1, iy + 4);
      spot("desk", cx - 1, iy + 4, "up", key);
      spot("desk", cx + 1, iy + 4, "up", key);
      spot("errand", cx, iy + ih - 1, "up", key);
    } else {
      shelf(ix, iy, 1);
      for (const [row, face] of [
        [iy + 2, "down"],
        [iy + 5, "down"],
      ] as const) {
        for (const tx of [ix + 1, ix + iw - 4]) {
          chairDown(tx + 1, row - 1);
          table(tx, row, 3);
          monitor(tx * T + 30, row * T - 9);
          papers(tx * T + 5, row * T - 4);
          spot("desk", tx + 1, row - 1, face, key);
        }
      }
      spot("errand", cx, iy + ih - 1, "up", key);
    }
  }

  // Party cloakrooms: sofas round low tables.
  const furnishCloak = (inner: typeof cloakD, party: "D" | "R") => {
    const { key, ix, iy, iw, ih } = inner;
    coatRack(ix, iy);
    coatRack(ix + 1, iy);
    cooler(ix + iw - 1, iy);
    plant(ix + Math.floor(iw / 2), iy);
    picture(ix + 3, iy - 1, 2);
    picture(ix + iw - 5, iy - 1, 2);
    for (let row = iy + 2; row + 2 <= iy + ih - 1; row += 5) {
      for (const gx of [ix + 2, ix + iw - 5]) {
        sofa(gx, row, 3);
        const x = gx * T;
        const y = (row + 1) * T;
        framed(o, x + 4, y - 2, 3 * T - 8, 12, WALNUT);
        box(o, x + 6, y, 3 * T - 12, 2, "#8a5d36");
        papers(x + 12, y + 2);
        block(gx, row + 1, 3);
        for (let i = 0; i < 3; i++) spot("sofa", gx + i, row, "down", key, { party });
        for (const tx of [gx, gx + 2]) {
          chairUp(tx, row + 2, LEATHER_DARK, LEATHER);
          spot("sofa", tx, row + 2, "up", key, { party });
        }
      }
    }
  };
  furnishCloak(cloakD, "D");
  furnishCloak(cloakR, "R");

  // Library: shelves to browse and a table to read at.
  {
    const { ix, iy, iw, ih } = library;
    shelf(ix, iy, iw);
    const tableRow = iy + ih - 2;
    for (let row = iy + 3; row + 1 < tableRow - 1; row += 3) {
      for (const sx of [ix + 1, ix + 8]) {
        shelf(sx, row, 5);
        spot("read", sx + 1, row + 1, "up", "library");
        spot("read", sx + 3, row + 1, "up", "library");
      }
    }
    table(ix + 1, tableRow, 5);
    for (let i = 0; i < 5; i += 2) {
      chairDown(ix + 1 + i, tableRow - 1);
      spot("read", ix + 1 + i, tableRow - 1, "down", "library");
    }
    for (let i = 1; i < 5; i += 2) {
      chairUp(ix + 1 + i, tableRow + 1);
      spot("read", ix + 1 + i, tableRow + 1, "up", "library");
    }
    for (let i = 0; i < 4; i++) papers((ix + 1) * T + 6 + i * 18, tableRow * T - 4);
    table(ix + 9, tableRow, 4, WALNUT, "#4f2f18");
    monitor((ix + 9) * T + 6, tableRow * T - 9);
    person("librarian-0", ix + 11, tableRow - 1, "down");
    plant(ix + iw - 1, tableRow + 1);
  }

  // Hearing room: members on the dais, a witness, and rows for the public.
  {
    const { ix, iy, iw, ih } = hearing;
    const cx = ix + Math.floor(iw / 2);
    flag(ix, iy);
    flag(ix + iw - 1, iy, accent);
    picture(cx - 1, iy - 1, 3);
    framed(g, (cx - 5) * T - 4, iy * T + 2, 11 * T + 8, 3 * T + 2, "#c9a06a");
    table(cx - 5, iy + 2, 11, WALNUT, "#4f2f18");
    for (let tx = cx - 4; tx <= cx + 4; tx += 2) {
      chairDown(tx, iy + 1, LEATHER_DARK);
      spot("hearing", tx, iy + 1, "down", "hearing");
      box(o, tx * T + 4, (iy + 2) * T - 3, 8, 3, PALETTE.gold);
    }
    table(cx - 1, iy + 5, 3);
    box(o, cx * T + 7, (iy + 5) * T - 11, 1, 6, PALETTE.ink);
    chairUp(cx, iy + 6);
    spot("hearing", cx, iy + 6, "up", "hearing");
    for (let row = iy + 8; row <= iy + ih - 1; row += 2) {
      for (const sx of [ix + 2, ix + iw - 6]) {
        for (let i = 0; i < 4; i++) {
          chairUp(sx + i, row);
          if ((i + row) % 2 === 0) spot("hearing", sx + i, row, "up", "hearing");
        }
      }
    }
  }

  // Cafeteria: a serving line and tables.
  {
    const { ix, iy, iw, ih } = cafe;
    const cwide = Math.max(6, Math.min(10, Math.floor(iw * 0.32)));
    const x = (ix + 1) * T;
    const y = (iy + 1) * T;
    framed(o, x, y - 6, cwide * T, 20, "#eef1f2");
    box(o, x + 1, y + 7, cwide * T - 2, 6, PALETTE.steel);
    box(o, x, y - 8, cwide * T, 2, PALETTE.window);
    for (let i = 0; i < cwide - 1; i++) framed(o, x + i * T + 3, y - 4, 11, 8, pick(FOOD));
    framed(o, x + (cwide - 1) * T + 2, y - 5, 11, 9, "#3d3f4a");
    box(o, x + (cwide - 1) * T + 4, y - 3, 7, 3, PALETTE.yellow);
    block(ix + 1, iy + 1, cwide);
    block(ix, iy, cwide + 1);
    person("server-0", ix + 2, iy, "down");
    person("server-1", ix + cwide - 2, iy, "down");
    for (let i = 0; i < Math.min(6, cwide - 2); i++) spot("queue", ix + 2 + i, iy + 2, "up", "cafeteria");
    vending(ix + iw - 1, iy, PALETTE.partyR);
    vending(ix + iw - 2, iy, PALETTE.partyD);
    cooler(ix + iw - 3, iy);
    plant(ix, iy + ih - 1);
    for (let i = ix + cwide + 3; i < ix + iw - 4; i += 4) picture(i, iy - 1, 2);
    const seatTable = (tx: number, row: number) => {
      table(tx, row, 2, "#e9e2cf", "#b9b1a0");
      for (const cx of [tx, tx + 1]) {
        chairDown(cx, row - 1, PALETTE.orangeDark);
        spot("eat", cx, row - 1, "down", "cafeteria", { table: row });
        chairUp(cx, row + 1, PALETTE.orangeDark, PALETTE.orange);
        spot("eat", cx, row + 1, "up", "cafeteria", { table: row });
      }
    };
    const firstRight = ix + cwide + 3;
    for (let tx = firstRight; tx + 1 <= ix + iw - 2; tx += 3) seatTable(tx, iy + 2);
    for (let tx = ix + 2; tx + 1 <= ix + iw - 2; tx += 3) seatTable(tx, iy + 6);
  }

  // Rotunda: the way in, with a statue to meet under.
  {
    const { ix, iy, iw, ih } = lobby;
    const c = ix + iw / 2 - 1;
    const cxPx = (c + 1) * T;
    const cyPx = (iy + 4) * T;
    for (const [radius, color] of [
      [58, PALETTE.stoneEdge],
      [55, "#f7f2e8"],
      [40, accent],
      [37, "#f7f2e8"],
    ] as const) {
      for (let dy = -radius; dy < radius; dy++) {
        const half = Math.round(Math.sqrt(radius * radius - (dy + 0.5) * (dy + 0.5)) * 1.25);
        box(g, cxPx - half, cyPx + dy, half * 2, 1, color);
      }
    }
    const sx = c * T;
    const sy = (iy + 3) * T;
    framed(o, sx + 1, sy + 1, 30, 14, PALETTE.stone);
    box(o, sx + 2, sy + 11, 28, 3, PALETTE.stoneEdge);
    box(o, sx + 9, sy + 5, 14, 3, PALETTE.gold);
    framed(o, sx + 10, sy - 27, 12, 30, "#cfd3d6");
    framed(o, sx + 11, sy - 36, 10, 11, "#cfd3d6");
    framed(o, sx + 21, sy - 24, 5, 12, "#cfd3d6");
    box(o, sx + 12, sy - 14, 8, 1, "#aab0b5");
    box(o, sx + 15, sy - 13, 2, 14, "#aab0b5");
    block(c, iy + 3, 2);
    for (const bx of [ix + 1, ix + iw - 4]) {
      sofa(bx, iy + 1, 3);
      for (let i = 0; i < 3; i++) spot("chat", bx + i, iy + 1, "down", "rotunda");
    }
    plant(ix, iy + 1);
    plant(ix + iw - 1, iy + 1);
    for (const tx of [ix + 3, ix + iw - 5, c - 3, c + 4]) {
      spot("chat", tx, iy + 6, "down", "rotunda");
      spot("chat", tx + 1, iy + 6, "down", "rotunda");
    }
    // The front doors, with a guard beside them.
    const doorX = c * T;
    const doorY = (iy + ih) * T;
    framed(g, doorX - 4, doorY - 2, 40, 18, PALETTE.gold);
    framed(g, doorX - 1, doorY, 17, 16, PALETTE.door);
    framed(g, doorX + 16, doorY, 17, 16, PALETTE.door);
    box(g, doorX + 12, doorY + 7, 2, 3, PALETTE.yellow);
    box(g, doorX + 18, doorY + 7, 2, 3, PALETTE.yellow);
    rug(c - 1, iy + ih - 1, 4, 1, PALETTE.partyR, PALETTE.gold);
    flag(c - 2, iy + ih - 1);
    flag(c + 3, iy + ih - 1, accent);
    person("guard-0", c + 5, iy + ih - 1, "down");
    spot("errand", c - 4, iy + ih - 2, "down", "rotunda");
  }

  // Press room: a podium, a backdrop and reporters.
  {
    const { ix, iy, iw, ih } = press;
    const cx = ix + Math.floor(iw / 2);
    framed(g, (cx - 3) * T, (iy - 1) * T + 5, 7 * T, 10, PALETTE.partyD);
    for (let i = 0; i < 7; i++) box(g, (cx - 3) * T + 6 + i * T, (iy - 1) * T + 8, 3, 3, PALETTE.white);
    flag(cx - 2, iy);
    flag(cx + 2, iy, accent);
    spot("press", cx, iy + 1, "down", "press");
    lectern(cx, iy + 2);
    let reporter = 0;
    for (const row of [iy + 4, iy + 6]) {
      for (let tx = cx - 3; tx <= cx + 3; tx += 2) {
        if (tx < ix + 1 || tx > ix + iw - 2) continue;
        chairUp(tx, row, "#3d3f4a", "#56607a");
        if ((tx + row) % 3 !== 0 && reporter < 6) {
          staff.push({ frame: `reporter-${reporter++}`, tx, ty: row, dx: 0, face: "up" });
        }
      }
    }
    tripod(ix, iy + ih - 2);
    tripod(ix + iw - 1, iy + ih - 3);
    spot("errand", ix + 1, iy + ih - 1, "up", "press");
  }

  // Gym: treadmills and mats.
  {
    const { ix, iy, iw, ih } = gym;
    framed(g, (ix + 3) * T, (iy - 1) * T + 5, (iw - 4) * T, 10, PALETTE.window);
    for (let i = 0; i < iw - 4; i += 2) box(g, (ix + 3 + i) * T + 4, (iy - 1) * T + 6, 2, 8, PALETTE.white);
    for (let tx = ix + 3; tx <= ix + iw - 2; tx += 2) {
      treadmill(tx, iy + 1);
      spot("gym", tx, iy + 1, "down", "gym");
    }
    for (const [i, color] of [PALETTE.partyD, PALETTE.orange, PALETTE.grassDark].entries()) {
      const tx = ix + 1 + i * 3;
      if (tx + 1 > ix + iw - 3) break;
      framed(g, tx * T + 1, (iy + 5) * T + 2, 2 * T - 2, T - 3, color);
      spot("gym", tx, iy + 5, "down", "gym", { dx: 8 });
    }
    // A rack of weights along the bottom wall.
    const rx = (ix + 1) * T;
    const ry = (iy + ih - 1) * T;
    framed(o, rx, ry - 2, 4 * T, 14, PALETTE.steelDark);
    for (let i = 0; i < 5; i++) {
      box(o, rx + 4 + i * 12, ry + 1, 3, 8, PALETTE.ink);
      box(o, rx + 7 + i * 12, ry + 4, 4, 2, PALETTE.steel);
      box(o, rx + 11 + i * 12, ry + 1, 3, 8, PALETTE.ink);
    }
    block(ix + 1, iy + ih - 1, 4);
    cooler(ix + iw - 1, iy + ih - 1);
  }

  // The chamber itself.
  {
    const { ix, iy } = hall;
    const wallY = (iy - 1) * T;
    // Drapes behind the rostrum, flags either side.
    framed(g, (mid - 5) * T, wallY + 5, 12 * T, 11, accent);
    for (let fold = 0; fold < 12 * T; fold += 6) box(g, (mid - 5) * T + fold, wallY + 6, 1, 9, accentDark);
    for (let tx = ix + 2; tx < mid - 7; tx += 5) picture(tx, iy - 1, 2);
    for (let tx = mid + 9; tx < ix + cw - 3; tx += 5) picture(tx, iy - 1, 2);
    flag(mid - 5, iy);
    flag(mid + 6, iy, accent);
    // Rostrum: the chair, then the clerks' desk below it.
    framed(g, (mid - 5) * T - 6, iy * T, 12 * T + 12, 4 * T + 4, "#c9a06a");
    framed(g, (mid - 3) * T - 6, iy * T, 8 * T + 12, 2 * T + 4, "#d8b27e");
    framed(g, mid * T + 9, iy * T - 12, 14, 24, accentDark);
    spot("preside", mid, iy, "down", "chamber", { dx: 8 });
    set(mid, iy, CHAIR);
    set(mid + 1, iy, BLOCK);
    table(mid - 2, iy + 1, 6, WALNUT, "#4f2f18");
    framed(o, (mid + 2) * T + 2, (iy + 1) * T - 5, 9, 4, WOOD_DARK); // gavel block
    box(o, (mid + 2) * T + 5, (iy + 1) * T - 8, 3, 3, WOOD);
    person("clerk-1", mid - 2, iy + 2, "down", 8);
    person("clerk-2", mid + 2, iy + 2, "down", 8);
    table(mid - 4, iy + 3, 10, WOOD, WOOD_DARK);
    if (house) {
      // The hopper, where House bills are dropped.
      framed(o, (mid - 4) * T + 4, (iy + 3) * T - 12, 14, 10, WOOD_DARK);
      box(o, (mid - 4) * T + 7, (iy + 3) * T - 10, 8, 2, PALETTE.ink);
    }
    spot("errand", mid - 5, iy + 4, "up", "chamber");
    // Lecterns in the well.
    for (const tx of [mid - 7, mid + 8]) {
      spot("speak", tx, iy + 4, "down", "chamber");
      lectern(tx, iy + 5);
    }
    // Aisle runners.
    box(g, ix * T, crossRow * T + 2, cw * T, T - 4, accent);
    box(g, mid * T + 3, crossRow * T + 2, 2 * T - 6, (ch - 6) * T - 2, accent);
    for (let dash = crossRow * T + 8; dash < (iy + ch) * T - 6; dash += 12) box(g, mid * T + T - 1, dash, 2, 6, carpet);

    const starts = [ix + 1, ix + bc + 2, ix + 2 * bc + 4, ix + 3 * bc + 5];
    const leftSeats: Spot[] = [];
    const rightSeats: Spot[] = [];
    for (let row = 0; row < rows; row++) {
      const ty = iy + 7 + 2 * row;
      for (const [index, bx] of starts.entries()) {
        box(g, bx * T, ty * T - 7, bc * T, 1, PALETTE.ink);
        box(g, bx * T, ty * T - 6, bc * T, 5, WOOD);
        box(g, bx * T, ty * T - 2, bc * T, 2, WOOD_DARK);
        box(g, bx * T, ty * T - 7, 1, 7, PALETTE.ink);
        box(g, (bx + bc) * T - 1, ty * T - 7, 1, 7, PALETTE.ink);
        for (let i = 0; i < bc; i++) {
          chairUp(bx + i, ty, LEATHER_DARK, LEATHER);
          set(bx + i, ty, DESK);
          (index < 2 ? leftSeats : rightSeats).push(spot("seat", bx + i, ty, "up", "chamber"));
        }
      }
    }
    // Fill from the front row back and from the centre aisle outward.
    const nearAisle = (a: Spot, b: Spot) => a.ty - b.ty || Math.abs(a.tx - mid) - Math.abs(b.tx - mid);
    leftSeats.sort(nearAisle);
    rightSeats.sort(nearAisle);
    left.forEach((member, i) => leftSeats[i] && seats.set(member.id, leftSeats[i]));
    right.forEach((member, i) => rightSeats[i] && seats.set(member.id, rightSeats[i]));
    for (const [id, seat] of seats) seat.owner = id;

    const back = iy + ch - 1;
    for (const tx of [ix + 2, ix + bc + 3, ix + 3 * bc, ix + cw - 4]) {
      spot("chat", tx, back, "down", "chamber");
      spot("chat", tx + 1, back, "down", "chamber");
    }
  }

  // Corridors: somewhere to stop and talk, and a little greenery.
  for (const tx of [Math.round(W * 0.2), Math.round(W * 0.5), Math.round(W * 0.8)]) {
    spot("chat", tx, NORTH + 1, "down", "corridor");
    spot("chat", tx + 1, NORTH + 1, "down", "corridor");
  }
  for (const tx of [SIDE + 1, eastX - 2]) {
    spot("chat", tx, chamberY + Math.floor(CH * 0.3), "down", "corridor");
    spot("chat", tx, chamberY + Math.floor(CH * 0.3) + 1, "down", "corridor");
    plant(tx === SIDE + 1 ? SIDE : eastX - 1, chamberY + CH - 2);
  }
  for (const tx of [chamberX + 3, chamberX + CW - 5]) {
    spot("chat", tx, southY - 2, "down", "corridor");
    spot("chat", tx + 1, southY - 2, "down", "corridor");
  }
  for (const office of offices) picture(office.x1 + 2, NORTH - 1, 2);

  return {
    key: wing,
    wing,
    w: W,
    h: H,
    ground,
    over,
    rooms,
    spots,
    seats,
    staff,
    pages: house ? 5 : 3,
    cells,
    clerk: { x: (mid + 1) * T, y: (hall.iy + 3) * T - 2 },
  };
}

export interface CommitteeSeat {
  id: string;
  side: string; // "majority" or "minority"
  rank: number;
  title: string;
}

export interface CommitteeRoomSpec {
  code: string;
  name: string;
  chamber: string;
  seats: CommitteeSeat[];
  /** Set when a meeting is being shown: who is at the witness table and how full the room is. */
  session: { id: string; witnesses: number } | null;
}

/** Six looks for a hearing room. Each committee always gets the same one. */
const ROOM_TEMPLATES = [
  { name: "classic", floor: "carpet", wall: "drapes", sides: "plants", public: "rows" },
  { name: "library", floor: "wood", wall: "shelves", sides: "shelves", public: "rows" },
  { name: "marble hall", floor: "marble", wall: "portraits", sides: "busts", public: "benches" },
  { name: "press room", floor: "blue", wall: "banners", sides: "press", public: "blocks" },
  { name: "club room", floor: "green", wall: "portraits", sides: "armchairs", public: "rows" },
  { name: "modern", floor: "tile", wall: "screens", sides: "tables", public: "desks" },
] as const;

/** A committee's hearing room: the members' dais, a witness table, and seats for the public. */
export function buildCommitteeRoom(spec: CommitteeRoomSpec): Building {
  const wing: Wing = spec.chamber === "Senate" ? "Senate" : "House";
  const house = wing === "House";
  const accent = house ? PALETTE.house : PALETTE.senate;
  const accentDark = house ? PALETTE.houseDark : PALETTE.senateDark;
  const majority = spec.seats.filter((seat) => seat.side === "majority").sort((a, b) => a.rank - b.rank);
  const minority = spec.seats.filter((seat) => seat.side !== "majority").sort((a, b) => a.rank - b.rank);
  const total = majority.length + minority.length;
  // Big committees sit in two tiers, the senior members behind.
  const tiers = total > 16 ? 2 : 1;
  const perTier = Math.max(1, Math.ceil(total / tiers));
  const backMajority = tiers === 1 ? majority.length : Math.min(majority.length, Math.round((perTier * majority.length) / Math.max(1, total)));
  const backMinority = tiers === 1 ? minority.length : Math.min(minority.length, perTier - backMajority);
  const left = Math.max(backMajority, majority.length - backMajority, 3);
  const right = Math.max(backMinority, minority.length - backMinority, 3);
  const iw = Math.max(28, left + right + 11); // room at the right of the dais for the calendar board
  const lastDesk = tiers * 2; // row of the front desk, counted from the first floor row
  const ih = lastDesk + 15;
  const W = iw + 2;
  const H = ih + 2;

  const template = ROOM_TEMPLATES[hash(spec.code) % ROOM_TEMPLATES.length];
  const kit = makeKit(W, H, house ? PALETTE.houseCarpet : PALETTE.senateCarpet, house ? "#b5dccd" : "#d2c0e3", hash(spec.code));
  const { ground, over, g, o, cells, rooms, spots, staff, seats, block, spot, person, room, door } = kit;
  const { table, chairDown, chairUp, plant, flag, cooler, tripod, picture, papers, rug, shelf, bust, coatRack, monitor } = kit;

  const { ix, iy } = room("room", spec.name, 0, 0, W, H, template.floor);
  const boundary = ix + 4 + left + Math.floor((iw - 11 - left - right) / 2); // first minority seat
  const centre = ix + Math.floor(iw / 2);
  door(centre - 1, H - 1, 2);
  kit.paint();

  // The wall behind the dais: a seal in the middle, and the template's own treatment either side.
  const wallY = (iy - 1) * T;
  if (template.wall === "drapes") {
    framed(g, (boundary - 4) * T, wallY + 5, 8 * T, 11, accent);
    for (let fold = 0; fold < 8 * T; fold += 6) box(g, (boundary - 4) * T + fold, wallY + 6, 1, 9, accentDark);
  }
  framed(g, boundary * T - 6, wallY + 4, 12, 12, PALETTE.gold);
  box(g, boundary * T - 3, wallY + 7, 6, 6, PALETTE.goldDark);
  const wallSpots: number[] = [];
  for (let tx = ix + 3; tx < boundary - 6; tx += 5) wallSpots.push(tx);
  for (let tx = boundary + 6; tx < ix + iw - 8; tx += 5) wallSpots.push(tx);
  for (const tx of wallSpots) {
    const x = tx * T;
    if (template.wall === "shelves") shelf(tx, iy, 2);
    else if (template.wall === "banners") {
      framed(g, x + 4, wallY + 4, 10, 12, tx % 2 ? accent : PALETTE.gold);
      framed(g, x + 18, wallY + 4, 10, 12, tx % 2 ? PALETTE.gold : accent);
    } else if (template.wall === "screens") {
      framed(g, x + 2, wallY + 4, 28, 12, "#2b2530");
      box(g, x + 4, wallY + 6, 24, 8, PALETTE.window);
      box(g, x + 6, wallY + 8, 10, 1, PALETTE.white);
      box(g, x + 6, wallY + 11, 16, 1, PALETTE.white);
    } else picture(tx, iy - 1, 2);
  }
  flag(ix + 1, iy);
  flag(ix + iw - 2, iy, accent);
  // The committee's calendar, on a board by the dais.
  const boardX = (ix + iw - 6) * T;
  const boardY = iy * T;
  box(o, boardX + 6, boardY + 10, 2, 5, PALETTE.ink);
  box(o, boardX + 40, boardY + 10, 2, 5, PALETTE.ink);
  framed(o, boardX, boardY - 18, 48, 30, PALETTE.white);
  box(o, boardX + 1, boardY - 17, 46, 7, PALETTE.partyR);
  for (let ring = 5; ring < 46; ring += 9) box(o, boardX + ring, boardY - 20, 2, 4, PALETTE.ink);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 7; col++) {
      const mark = (row * 7 + col + spec.code.charCodeAt(3)) % 6;
      box(o, boardX + 4 + col * 6, boardY - 7 + row * 6, 4, 4, mark === 0 ? accent : mark === 3 && row === 2 ? PALETTE.yellow : PALETTE.stoneEdge);
    }
  }
  block(ix + iw - 6, iy, 3);

  // The dais. Majority to the left of the middle, minority to the right, senior members nearest it.
  framed(g, (boundary - left - 1) * T - 4, iy * T + 4, (left + right + 2) * T + 8, (lastDesk + 1) * T, "#c9a06a");
  const tierSeats: { seat: CommitteeSeat; tx: number }[][] = [];
  for (let tier = 0; tier < tiers; tier++) {
    const back = tier === 0;
    const mine = back ? majority.slice(0, backMajority) : majority.slice(backMajority);
    const theirs = back ? minority.slice(0, backMinority) : minority.slice(backMinority);
    tierSeats.push([
      ...mine.map((seat, i) => ({ seat, tx: boundary - 1 - i })),
      ...theirs.map((seat, i) => ({ seat, tx: boundary + i })),
    ]);
  }
  tierSeats.forEach((row, tier) => {
    if (!row.length) return;
    const chairs = iy + 1 + tier * 2;
    const from = Math.min(...row.map((entry) => entry.tx));
    const to = Math.max(...row.map((entry) => entry.tx));
    for (const { seat, tx } of row) {
      chairDown(tx, chairs, LEATHER_DARK);
      seats.set(seat.id, spot("seat", tx, chairs, "down", "room", { owner: seat.id }));
    }
    table(from, chairs + 1, to - from + 1, WALNUT, "#4f2f18");
    for (const { seat, tx } of row) {
      const lead = seat.rank === 1;
      box(o, tx * T + 4, (chairs + 1) * T - 4, 8, 3, lead ? PALETTE.gold : PALETTE.wall);
      if (lead && seat.side === "majority") {
        framed(o, tx * T + 3, (chairs + 1) * T + 1, 9, 4, WOOD_DARK); // the gavel
        box(o, tx * T + 6, (chairs + 1) * T - 1, 3, 2, WOOD);
      }
    }
  });

  // The well: the clerk with the committee's bills, the witness table, the press.
  const well = iy + lastDesk + 1;
  table(ix + 2, well + 2, 4, WOOD, WOOD_DARK);
  person("clerk-0", ix + 3, well + 1, "down");
  const witnessSeats = Math.max(2, Math.min(6, spec.session?.witnesses || 3));
  const tableWidth = witnessSeats * 2 + 1;
  const tableX = centre - Math.floor(tableWidth / 2);
  rug(tableX - 1, well + 2, tableWidth + 2, 4, accent, house ? PALETTE.houseCarpet : PALETTE.senateCarpet);
  table(tableX, well + 3, tableWidth);
  for (let i = 0; i < witnessSeats; i++) {
    const tx = tableX + 1 + i * 2;
    chairUp(tx, well + 4);
    box(o, tx * T + 7, (well + 3) * T - 11, 1, 6, PALETTE.ink); // microphone
    papers(tx * T + 3, (well + 3) * T - 3);
    if (spec.session && i < spec.session.witnesses) staff.push({ frame: `guest-${i % 8}`, tx, ty: well + 4, dx: 0, face: "up" });
  }
  tripod(ix + iw - 3, well + 2);
  tripod(ix + iw - 2, well + 4);
  spot("errand", ix + 6, well + 1, "up", "room");
  spot("errand", ix + iw - 5, well + 1, "up", "room");

  // The public seats. A meeting fills them; otherwise a couple of staff wait about.
  const publicSeats: { tx: number; ty: number }[] = [];
  const first = well + 7;
  if (template.public === "desks") {
    // Rows of shared desks, each with chairs behind it.
    for (const row of [first, first + 3]) {
      for (let tx = ix + 3; tx + 2 <= ix + iw - 4; tx += 4) {
        if (tx + 2 >= centre - 2 && tx <= centre + 1) continue;
        table(tx, row, 3, "#e9e2cf", "#b9b1a0");
        monitor(tx * T + 18, row * T - 9);
        for (let i = 0; i < 3; i++) {
          chairUp(tx + i, row + 1, "#3d3f4a", "#56607a");
          publicSeats.push({ tx: tx + i, ty: row + 1 });
        }
      }
    }
  } else {
    const benches = template.public === "benches";
    for (let row = first; row <= first + 4; row += 2) {
      for (let tx = ix + 3; tx <= ix + iw - 4; tx++) {
        const third = Math.floor((iw - 6) / 3);
        const aisle = template.public === "blocks" ? (tx - ix - 3) % (third + 1) === third : tx >= centre - 2 && tx <= centre + 1;
        if (aisle) continue;
        chairUp(tx, row, benches ? WOOD_DARK : "#3d3f4a", benches ? WOOD : "#56607a");
        if (benches) box(o, tx * T, row * T + 4, T, 2, WOOD_DARK); // one long bench
        publicSeats.push({ tx, ty: row });
      }
    }
  }
  let guest = 0;
  publicSeats.forEach(({ tx, ty }, index) => {
    const taken = spec.session ? (tx * 7 + ty * 13 + spec.session.id.length) % 5 < 2 : index === 4 || index === publicSeats.length - 3;
    if (taken) staff.push({ frame: `guest-${guest++ % 8}`, tx, ty, dx: 0, face: "up" });
  });

  // Along the side walls, whatever suits the room.
  for (const [tx, edge] of [[ix, ix], [ix + iw - 2, ix + iw - 1]] as const) {
    for (const row of [first, first + 3]) {
      if (template.sides === "plants") plant(edge, row);
      else if (template.sides === "shelves") shelf(tx, row, 2);
      else if (template.sides === "busts") bust(edge, row);
      else if (template.sides === "press") tripod(edge, row);
      else if (template.sides === "armchairs") {
        chairUp(edge, row, LEATHER_DARK, LEATHER);
        chairUp(edge, row + 1, LEATHER_DARK, LEATHER);
      } else {
        table(tx, row, 2);
        papers(tx * T + 10, row * T - 3);
      }
    }
  }
  if (template.sides === "armchairs") coatRack(ix + iw - 1, first - 2);
  plant(ix, iy + ih - 1);
  plant(ix + iw - 1, iy + ih - 1);
  cooler(ix, well + 5);
  spot("errand", centre - 3, iy + ih - 1, "up", "room");

  return {
    key: `${spec.code}:${spec.session?.id ?? "idle"}`,
    wing,
    w: W,
    h: H,
    ground,
    over,
    rooms,
    spots,
    seats,
    staff,
    pages: 1,
    cells,
    clerk: { x: (ix + 4) * T, y: (well + 2) * T - 2 },
    calendar: { x: boardX + 24, y: boardY - 3 },
  };
}

const NEIGHBOURS = [0, 1, 0, -1];

/** Tiles to walk through from one place to another, corners only. Null when there is no way. */
export function findPath(building: Building, fromX: number, fromY: number, toX: number, toY: number): { tx: number; ty: number }[] | null {
  const { w, h, cells } = building;
  const start = fromY * w + fromX;
  const goal = toY * w + toX;
  if (start === goal) return [];
  const next = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = goal;
  next[goal] = goal;
  search: while (head < tail) {
    const cell = queue[head++];
    const cx = cell % w;
    const cy = (cell - cx) / w;
    for (let i = 0; i < 4; i++) {
      const nx = cx + NEIGHBOURS[i];
      const ny = cy + NEIGHBOURS[(i + 3) % 4];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (next[n] !== -1 || (cells[n] !== FLOOR && n !== start)) continue;
      // Nobody climbs over a desk: those seats open only to the back and sides.
      if ((i === 0 && cells[cell] === DESK) || (i === 2 && cells[n] === DESK)) continue;
      next[n] = cell;
      if (n === start) break search;
      queue[tail++] = n;
    }
  }
  if (next[start] === -1) return null;
  const path: { tx: number; ty: number }[] = [];
  let cell = start;
  let lastDx = 0;
  let lastDy = 0;
  while (cell !== goal) {
    const step = next[cell];
    const dx = (step % w) - (cell % w);
    const dy = Math.floor(step / w) - Math.floor(cell / w);
    if (path.length && dx === lastDx && dy === lastDy) path.pop();
    path.push({ tx: step % w, ty: Math.floor(step / w) });
    lastDx = dx;
    lastDy = dy;
    cell = step;
  }
  return path;
}
