// Turns the Census Bureau's state outlines into the grid of squares the map of the whole country is
// drawn from, in src/usa/shapes.ts. The maps of each state and each county are not made here: they
// come from the us-places dataset (build_boundaries.py in cat-pol-datasets).
//
// The outlines come from us-atlas (https://github.com/topojson/us-atlas, ISC licence), which
// repackages the Census Bureau's public-domain cartographic boundary files already projected, with
// Alaska and Hawaii moved in below the Southwest. Run this again only to change a map's scale:
//
//   curl -LO https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-albers-10m.json
//   node tools/make_usmap.mjs counties-albers-10m.json
//
// The five territories are not in that file. They are small hand-drawn islands in a box of their
// own, placed by the table below. State capitals are placed by their latitude and longitude.

import { readFileSync, writeFileSync } from "node:fs";

// ── The whole country ────────────────────────────────────────────────────────
const CELL = 3; // projected units to a square
const X0 = -70;
const Y0 = -4;
const W = 362;
const H = 214;
const SUB = 4; // samples across a square
const LAND = 5; // samples of 16 that make a square land

const FIPS = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL",
  "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME",
  "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
  "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
  "56": "WY",
};

// Where each state's capitol stands: latitude, longitude.
const CAPITALS = {
  AL: [32.377, -86.3], AK: [58.302, -134.42], AZ: [33.448, -112.097], AR: [34.746, -92.289], CA: [38.577, -121.494],
  CO: [39.739, -104.985], CT: [41.764, -72.682], DE: [39.158, -75.524], DC: [38.89, -77.009], FL: [30.438, -84.281],
  GA: [33.749, -84.388], HI: [21.307, -157.858], ID: [43.617, -116.2], IL: [39.798, -89.654], IN: [39.768, -86.163],
  IA: [41.591, -93.604], KS: [39.048, -95.678], KY: [38.187, -84.875], LA: [30.457, -91.187], ME: [44.307, -69.782],
  MD: [38.979, -76.491], MA: [42.358, -71.064], MI: [42.734, -84.555], MN: [44.955, -93.102], MS: [32.303, -90.182],
  MO: [38.579, -92.173], MT: [46.586, -112.018], NE: [40.808, -96.7], NV: [39.164, -119.766], NH: [43.207, -71.538],
  NJ: [40.22, -74.77], NM: [35.682, -105.94], NY: [42.653, -73.757], NC: [35.78, -78.639], ND: [46.821, -100.783],
  OH: [39.961, -82.999], OK: [35.492, -97.503], OR: [44.938, -123.03], PA: [40.264, -76.884], RI: [41.831, -71.415],
  SC: [34.0, -81.033], SD: [44.367, -100.346], TN: [36.166, -86.784], TX: [30.275, -97.74], UT: [40.777, -111.888],
  VT: [44.262, -72.581], VA: [37.539, -77.434], WA: [47.036, -122.905], WV: [38.336, -81.612], WI: [43.075, -89.384],
  WY: [41.14, -104.82],
};

// The territories, as rows of squares: `x`, `y` is the top left corner, and each string is one row ("#" is land).
// `star` is where the capital's star goes, in squares.
const TERRITORIES = [
  { code: "PR", x: 316, y: 174, rows: [".#########.", "###########", "###########", ".#########."], star: [323, 174.6] },
  { code: "VI", x: 338, y: 175, rows: ["##.#", "....", ".###"], star: [338.8, 175.5] },
  { code: "GU", x: 316, y: 189, rows: [".##", "###", "###", "##.", "##."], star: [317.2, 191.5] },
  { code: "MP", x: 329, y: 188, rows: ["#.", "..", "#.", "..", "##", "##"], star: [330, 193] },
  { code: "AS", x: 340, y: 191, rows: ["###...#", "###...."], star: [341.5, 192] },
];
const TERRITORY_BOX = { x: 311, y: 162, w: 40, h: 42 };

// ── The projection us-atlas uses: d3's geoAlbersUsa at scale 1300, centred on (487.5, 305) ─────────
const RAD = Math.PI / 180;
function conic(parallels, rotate, center, scale, translate) {
  const n = (Math.sin(parallels[0] * RAD) + Math.sin(parallels[1] * RAD)) / 2;
  const c = 1 + Math.sin(parallels[0] * RAD) * (2 * n - Math.sin(parallels[0] * RAD));
  const raw = (lon, lat) => {
    const r = Math.sqrt(c - 2 * n * Math.sin(lat * RAD)) / n;
    return [r * Math.sin(n * lon * RAD), Math.sqrt(c) / n - r * Math.cos(n * lon * RAD)];
  };
  const middle = raw(center[0], center[1]);
  return (lat, lon) => {
    const [x, y] = raw(lon + rotate, lat);
    return [translate[0] + scale * (x - middle[0]), translate[1] - scale * (y - middle[1])];
  };
}
const K = 1300;
const lower48 = conic([29.5, 45.5], 96, [-0.6, 38.7], K, [487.5, 305]);
const alaska = conic([55, 65], 154, [-2, 58.5], K * 0.35, [487.5 - 0.307 * K, 305 + 0.201 * K]);
const hawaii = conic([8, 18], 157, [-3, 19.9], K, [487.5 - 0.205 * K, 305 + 0.212 * K]);
const project = (code, [lat, lon]) => (code === "AK" ? alaska : code === "HI" ? hawaii : lower48)(lat, lon);

// ── Reading the outlines ─────────────────────────────────────────────────────
const [, , source] = process.argv;
if (!source) throw new Error("usage: node tools/make_usmap.mjs counties-albers-10m.json");
const topo = JSON.parse(readFileSync(source, "utf8"));
const { scale, translate } = topo.transform;
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => [(x += dx) * scale[0] + translate[0], (y += dy) * scale[1] + translate[1]]);
});
const ring = (indices) => indices.flatMap((index, n) => (index >= 0 ? arcs[index] : [...arcs[~index]].reverse()).slice(n ? 1 : 0));
/** Every edge of a shape's outline, as pairs of points. */
function edgesOf(shape) {
  const edges = [];
  for (const polygon of shape.type === "Polygon" ? [shape.arcs] : shape.arcs) {
    for (const indices of polygon) {
      const points = ring(indices);
      for (let i = 0; i + 1 < points.length; i++) edges.push([points[i], points[i + 1]]);
    }
  }
  return edges;
}

/**
 * Lay shapes on a grid of squares. Each square goes to the shape that covers most of it, if enough of
 * it is covered at all; a shape too small to win any square is given the one at its middle.
 */
function rasterize(shapes, x0, y0, cell, w, h) {
  const samples = new Uint16Array(w * SUB * h * SUB); // which shape each sample point is in, plus one
  const middles = [];
  shapes.forEach((edges, n) => {
    let minY = Infinity;
    let maxY = -Infinity;
    let sumX = 0;
    let sumY = 0;
    for (const [[x1, y1]] of edges) {
      minY = Math.min(minY, y1);
      maxY = Math.max(maxY, y1);
      sumX += x1;
      sumY += y1;
    }
    middles.push([sumX / edges.length, sumY / edges.length]);
    const first = Math.max(0, Math.floor(((minY - y0) * SUB) / cell) - 1);
    const last = Math.min(h * SUB - 1, Math.ceil(((maxY - y0) * SUB) / cell) + 1);
    for (let row = first; row <= last; row++) {
      const y = y0 + ((row + 0.5) * cell) / SUB;
      const crossings = [];
      for (const [[x1, y1], [x2, y2]] of edges) {
        if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const from = Math.max(0, Math.ceil(((crossings[i] - x0) * SUB) / cell - 0.5));
        const to = Math.min(w * SUB - 1, Math.floor(((crossings[i + 1] - x0) * SUB) / cell - 0.5));
        for (let col = from; col <= to; col++) samples[row * w * SUB + col] = n + 1;
      }
    }
  });
  const grid = new Uint16Array(w * h);
  const won = new Set();
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const tally = new Map();
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const shape = samples[(cy * SUB + sy) * w * SUB + cx * SUB + sx];
          if (shape) tally.set(shape, (tally.get(shape) ?? 0) + 1);
        }
      }
      const total = [...tally.values()].reduce((a, b) => a + b, 0);
      if (total < LAND) continue;
      grid[cy * w + cx] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
      won.add(grid[cy * w + cx]);
    }
  }
  // The nearest square that is sea, or that its owner can spare.
  const held = new Map();
  for (const shape of grid) if (shape) held.set(shape, (held.get(shape) ?? 0) + 1);
  shapes.forEach((_, n) => {
    if (won.has(n + 1)) return;
    const cx = Math.min(w - 1, Math.max(0, Math.floor((middles[n][0] - x0) / cell)));
    const cy = Math.min(h - 1, Math.max(0, Math.floor((middles[n][1] - y0) / cell)));
    for (let reach = 0; reach < Math.max(w, h); reach++) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== reach) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const owner = grid[y * w + x];
          if (owner && held.get(owner) < 2) continue;
          if (owner) held.set(owner, held.get(owner) - 1);
          grid[y * w + x] = n + 1;
          held.set(n + 1, 1);
          return;
        }
      }
    }
  });
  return grid;
}

/** Runs along the rows of a grid: which shape, then how many squares, and so on. */
function runsOf(grid) {
  const runs = [];
  for (let at = 0; at < grid.length; ) {
    let end = at;
    while (end < grid.length && grid[end] === grid[at]) end++;
    runs.push(grid[at], end - at);
    at = end;
  }
  return runs;
}

const round = (value) => Math.round(value * 100) / 100;

// ── The whole country ────────────────────────────────────────────────────────
const stateShapes = topo.objects.states.geometries;
const codes = [...Object.values(FIPS), ...TERRITORIES.map((t) => t.code)].sort();
const landed = [...Object.values(FIPS)].sort();
const nation = rasterize(
  landed.map((code) => edgesOf(stateShapes.find((shape) => FIPS[shape.id] === code))),
  X0,
  Y0,
  CELL,
  W,
  H,
);
const grid = new Uint8Array(W * H);
for (let at = 0; at < grid.length; at++) if (nation[at]) grid[at] = codes.indexOf(landed[nation[at] - 1]) + 1;

const capitals = {};
for (const code of landed) {
  const [x, y] = project(code, CAPITALS[code]);
  capitals[code] = [round((x - X0) / CELL), round((y - Y0) / CELL)];
  const under = grid[Math.floor(capitals[code][1]) * W + Math.floor(capitals[code][0])];
  // A capital on the coast can fall a square out to sea; anywhere else it would mean the projection is wrong.
  if (under && codes[under - 1] !== code && code !== "DC") throw new Error(`the capital of ${code} lands in ${codes[under - 1]}`);
}

// The District of Columbia is smaller than a square: give it four, where it is.
const dcX = Math.round(capitals.DC[0]);
const dcY = Math.round(capitals.DC[1]);
for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) grid[(dcY + dy) * W + dcX + dx] = codes.indexOf("DC") + 1;
capitals.DC = [dcX, dcY];

for (const territory of TERRITORIES) {
  territory.rows.forEach((line, dy) => {
    [...line].forEach((mark, dx) => {
      if (mark !== "#") return;
      const at = (territory.y + dy) * W + territory.x + dx;
      if (grid[at]) throw new Error(`${territory.code} lands on ${codes[grid[at] - 1]}`);
      grid[at] = codes.indexOf(territory.code) + 1;
    });
  });
  capitals[territory.code] = territory.star;
}

const counts = new Map();
for (const state of grid) if (state) counts.set(codes[state - 1], (counts.get(codes[state - 1]) ?? 0) + 1);
for (const code of codes) if (!counts.get(code)) throw new Error(`${code} has no squares`);

// Written as a mark for the state, then how many squares.
const MARKS = ".ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&*+";
if (codes.length >= MARKS.length) throw new Error("more states than marks");
let runs = "";
const pairs = runsOf(grid);
for (let i = 0; i < pairs.length; i += 2) runs += MARKS[pairs[i]] + pairs[i + 1];

writeFileSync(
  new URL("../src/usa/shapes.ts", import.meta.url),
  `// Written by tools/make_usmap.mjs from the Census Bureau's state outlines (by way of us-atlas). Do not edit.

/** The map is a grid of squares this wide and this tall. */
export const GRID_W = ${W};
export const GRID_H = ${H};
/** The states, the District and the territories, in the order the grid numbers them from 1; 0 is sea. */
export const CODES = ${JSON.stringify(codes)};
/** Where each capital is, in squares across and down. */
export const CAPITALS: Record<string, [number, number]> = ${JSON.stringify(capitals)};
/** The box the territories are drawn in, in squares. */
export const TERRITORY_BOX = ${JSON.stringify(TERRITORY_BOX)};
const MARKS = ${JSON.stringify(MARKS)};
const RUNS =
  ${JSON.stringify(runs)};

/** Which state each square belongs to, row by row. */
export function stateGrid(): Uint8Array {
  const grid = new Uint8Array(GRID_W * GRID_H);
  let at = 0;
  for (const [, mark, length] of RUNS.matchAll(/(\\D)(\\d+)/g)) {
    grid.fill(MARKS.indexOf(mark), at, at + Number(length));
    at += Number(length);
  }
  return grid;
}
`,
);
console.log(`country: ${W}×${H} squares, ${runs.length} characters; smallest:`, [...counts.entries()].sort((a, b) => a[1] - b[1]).slice(0, 8).map(([c, n]) => `${c} ${n}`).join(", "));
