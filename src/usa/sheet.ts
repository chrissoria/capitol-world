// A sheet is one map made of squares: the whole country, where each shape is a state, or one state,
// where each shape is a county. Both are drawn, pointed at and clicked the same way.

import { fetchJson } from "../data/load";
import { CODES, GRID_H, GRID_W, stateGrid } from "./shapes";

export interface Shape {
  /** A state's postal code, or a county's five-digit Census code. */
  id: string;
  /** Its number in the grid. */
  index: number;
  cells: number;
  /** The squares it covers, as runs along each row: x2 is the last square of the run. */
  runs: { y: number; x1: number; x2: number }[];
  box: { x: number; y: number; w: number; h: number };
  /** The square where its name goes; how far that is from the edge; and the room to each side of it. */
  heart: { x: number; y: number };
  depth: number;
  halfWidth: number;
  /** Which of the land's few tones it is painted in: never the same as a neighbour's. */
  tone: number;
}

export interface Sheet {
  /** "usa", or a state's postal code. */
  key: string;
  w: number;
  h: number;
  /** Which shape each square belongs to, row by row; 0 is sea. */
  grid: Uint16Array;
  shapes: Map<string, Shape>;
  /** The shape at a square; null out at sea. */
  at(x: number, y: number): string | null;
}

/** How many tones the land is painted in. */
export const TONE_COUNT = 5;

export function makeSheet(key: string, w: number, h: number, grid: Uint16Array, ids: string[]): Sheet {
  const cell = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : grid[y * w + x]);
  const shapes = new Map<string, Shape>();
  const byIndex: Shape[] = [];
  ids.forEach((id, n) => {
    const shape: Shape = { id, index: n + 1, cells: 0, runs: [], box: { x: w, y: h, w: 0, h: 0 }, heart: { x: 0, y: 0 }, depth: 0, halfWidth: 0, tone: 0 };
    shapes.set(id, shape);
    byIndex[n + 1] = shape;
  });

  const neighbours = new Map<number, Set<number>>();
  const far = { x: new Map<number, number>(), y: new Map<number, number>() }; // the right and bottom edges, while the boxes are measured
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const own = cell(x, y);
      if (!own) continue;
      const shape = byIndex[own];
      shape.cells++;
      const last = shape.runs[shape.runs.length - 1];
      if (last && last.y === y && last.x2 === x - 1) last.x2 = x;
      else shape.runs.push({ y, x1: x, x2: x });
      shape.box.x = Math.min(shape.box.x, x);
      shape.box.y = Math.min(shape.box.y, y);
      far.x.set(own, Math.max(far.x.get(own) ?? 0, x));
      far.y.set(own, Math.max(far.y.get(own) ?? 0, y));
      for (const other of [cell(x + 1, y), cell(x, y + 1)]) {
        if (!other || other === own) continue;
        if (!neighbours.has(own)) neighbours.set(own, new Set());
        if (!neighbours.has(other)) neighbours.set(other, new Set());
        neighbours.get(own)!.add(other);
        neighbours.get(other)!.add(own);
      }
    }
  }
  for (const shape of byIndex) {
    if (!shape) continue;
    shape.box.w = (far.x.get(shape.index) ?? shape.box.x) - shape.box.x + 1;
    shape.box.h = (far.y.get(shape.index) ?? shape.box.y) - shape.box.y + 1;
  }

  // How deep inside its shape each square is: 1 at the edge, counted inward from there.
  const depth = new Uint16Array(grid.length);
  let ring: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const own = cell(x, y);
      if (!own) continue;
      if (cell(x - 1, y) !== own || cell(x + 1, y) !== own || cell(x, y - 1) !== own || cell(x, y + 1) !== own) {
        depth[y * w + x] = 1;
        ring.push(y * w + x);
      }
    }
  }
  for (let level = 2; ring.length; level++) {
    const next: number[] = [];
    for (const at of ring) {
      for (const step of [-1, 1, -w, w]) {
        const to = at + step;
        if (to < 0 || to >= grid.length || grid[to] !== grid[at] || depth[to]) continue;
        if (Math.abs(step) === 1 && Math.floor(to / w) !== Math.floor(at / w)) continue;
        depth[to] = level;
        next.push(to);
      }
    }
    ring = next;
  }
  // A name is wider than it is tall, so the best square for it is deep and has room to both sides.
  // "Room" is the least of it over a band of rows, since a name is some rows tall.
  const room = (x: number, y: number, own: number) => {
    let least = w;
    for (let row = y - 2; row <= y + 2; row++) {
      let left = 0;
      let right = 0;
      while (cell(x - left - 1, row) === own) left++;
      while (cell(x + right + 1, row) === own) right++;
      least = Math.min(least, cell(x, row) === own ? Math.min(left, right) + 0.5 : 0);
    }
    return least;
  };
  for (const shape of byIndex) {
    if (!shape) continue;
    let best = -1;
    for (const run of shape.runs) {
      for (let x = run.x1; x <= run.x2; x++) {
        const deep = depth[run.y * w + x];
        if ((deep + 1) * 100 < best) continue; // too near the edge to beat the best so far
        const half = room(x, run.y, shape.index);
        const score = Math.min(deep, half / 1.6) * 100 + half;
        if (score <= best) continue;
        best = score;
        shape.heart = { x, y: run.y };
        shape.depth = deep;
        shape.halfWidth = half;
      }
    }
  }

  // Tones: each shape takes the one its neighbours have used least, in a fixed order.
  const used = new Array<number>(TONE_COUNT).fill(0);
  const all = Array.from({ length: TONE_COUNT }, (_, tone) => tone);
  for (const shape of byIndex) {
    if (!shape) continue;
    const taken = new Set([...(neighbours.get(shape.index) ?? [])].map((other) => (other < shape.index ? byIndex[other].tone : -1)));
    const free = all.filter((tone) => !taken.has(tone));
    shape.tone = (free.length ? free : all).sort((a, b) => used[a] - used[b] || a - b)[0];
    used[shape.tone]++;
  }

  return { key, w, h, grid, shapes, at: (x, y) => ids[cell(Math.floor(x), Math.floor(y)) - 1] ?? null };
}

let nation: Sheet | undefined;

/** The whole country: fifty states, the District and the territories. */
export function nationSheet(): Sheet {
  nation ??= makeSheet("usa", GRID_W, GRID_H, Uint16Array.from(stateGrid()), CODES);
  return nation;
}

/**
 * The maps of the states and their counties are not in the app. They are made from the Census Bureau's outlines by
 * build_boundaries.py in cat-pol-datasets and kept with the us-places dataset, where every other fact about a place is.
 */
const MAPS = "https://huggingface.co/datasets/chrissoria/us-places/resolve/main/maps/";

/** One state's file: maps/states/CA.json. */
export interface StateFile {
  code: string;
  w: number;
  h: number;
  /** Where the capital is, in squares across and down. */
  capital: [number, number];
  /** The counties' Census codes and names, in the order the grid numbers them from 1. */
  ids: string[];
  names: string[];
  /** The grid as runs along its rows: which county, how many squares, and so on. */
  runs: number[];
}

/** A state cut into its congressional districts, on the same grid as its counties: maps/congress/CA.json. */
export interface DistrictFile extends StateFile {
  /** What the lines were drawn for: "119th Congress". */
  session: string;
  /** Each district's number alone ("52", "At Large"), and its people, median household income and median home value. */
  short: string[];
  people: (number | null)[];
  income: (number | null)[];
  home: (number | null)[];
}

const districtFiles = new Map<string, Promise<DistrictFile>>();

/** A state's congressional districts, fetched the first time they are asked for. */
export function loadDistricts(code: string): Promise<DistrictFile> {
  let file = districtFiles.get(code);
  if (!file) {
    file = fetchJson<DistrictFile>(`${MAPS}congress/${code}.json`);
    file.catch(() => districtFiles.delete(code));
    districtFiles.set(code, file);
  }
  return file;
}

/** One county's map: its cities and its named communities as shapes, and the land in neither as one more. */
export interface CountyFile {
  /** The county's five-digit Census code, and its name as the Census has it: "San Diego". */
  code: string;
  name: string;
  w: number;
  h: number;
  /** The places' Census codes, names and kinds ("city", "town", or "community" for one with no government), in the order the grid numbers them from 1. The land in none of them, if there is any, comes last as "<county>-u". */
  ids: string[];
  names: string[];
  kinds: string[];
  /** Where the county's government sits: the place's name, its code if it is a city here, and the square. */
  seat: { name: string; place: string; at: [number, number] } | null;
  runs: number[];
}

/** Whether a shape on a county's map is the land in no city and no named community. */
export const isUnincorporated = (id: string) => id.endsWith("-u");
/** Whether the nth shape on a county's map is a city or town, with a government of its own. */
export const isCity = (file: CountyFile, n: number) => !isUnincorporated(file.ids[n]) && file.kinds[n] !== "community";

/** maps/counties/CA.json.gz: every county of one state. */
interface CountyPack {
  schema: number;
  counties: Record<string, CountyFile>;
}
const countyPacks = new Map<string, Promise<CountyPack>>();

/** A county's map. Those of a whole state come together, the first time one of its counties is opened. `state` is the state's postal code. */
export function loadCounty(state: string, fips: string): Promise<CountyFile> {
  let pack = countyPacks.get(state);
  if (!pack) {
    pack = fetchJson<CountyPack>(`${MAPS}counties/${state}.json.gz`);
    pack.catch(() => countyPacks.delete(state));
    countyPacks.set(state, pack);
  }
  return pack.then((loaded) => {
    const file = loaded.counties?.[fips];
    if (!file) throw new Error(`no map of county ${fips}`);
    return file;
  });
}

export function stateSheet(file: Pick<StateFile, "code" | "w" | "h" | "ids" | "runs">): Sheet {
  const grid = new Uint16Array(file.w * file.h);
  let at = 0;
  for (let i = 0; i + 1 < file.runs.length; i += 2) {
    grid.fill(file.runs[i], at, at + file.runs[i + 1]);
    at += file.runs[i + 1];
  }
  return makeSheet(file.code, file.w, file.h, grid, file.ids);
}

const files = new Map<string, Promise<StateFile>>();

/** A state's counties, fetched the first time the state is opened. */
export function loadState(code: string): Promise<StateFile> {
  let file = files.get(code);
  if (!file) {
    file = fetchJson<StateFile>(`${MAPS}states/${code}.json`);
    file.catch(() => files.delete(code)); // so a failed load can be tried again
    files.set(code, file);
  }
  return file;
}
