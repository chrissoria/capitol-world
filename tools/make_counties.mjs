// Turns the Census Bureau's county and city outlines into one grid of squares for each county of a
// state: the cities as shapes, and the land in no city as one more. Written to
// public/usa/<STATE>/<county>.json, in the shape a state's own file has, and fetched when the county
// is opened.
//
// The outlines are the Census Bureau's cartographic boundary files (public domain), at 1:500,000:
//
//   curl -LO https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip
//   curl -LO https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_06_place_500k.zip     (06 is California)
//   unzip both, then:
//   node tools/make_counties.mjs CA cb_2023_us_county_500k cb_2023_06_place_500k
//
// A place file holds cities and towns, and also "census designated places", which are names the
// Bureau gives to settled land that has no government of its own. Only the first are shapes here.
// The second are read too, because a county's seat is sometimes one of them.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const LONG = 150; // squares along a county's longer side
const MARGIN = 5; // squares of margin round it
const SUB = 4; // samples across a square
const LAND = 5; // samples of 16 that make a square part of the county

const FIPS = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17",
  IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30",
  NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
};

// Where each county's government sits, by the last three digits of the county's code. The name is the
// Census Bureau's for the place; a few seats are not cities.
const SEATS = {
  CA: {
    "001": "Oakland", "003": "Markleeville", "005": "Jackson", "007": "Oroville", "009": "San Andreas", "011": "Colusa", "013": "Martinez",
    "015": "Crescent City", "017": "Placerville", "019": "Fresno", "021": "Willows", "023": "Eureka", "025": "El Centro", "027": "Independence",
    "029": "Bakersfield", "031": "Hanford", "033": "Lakeport", "035": "Susanville", "037": "Los Angeles", "039": "Madera", "041": "San Rafael",
    "043": "Mariposa", "045": "Ukiah", "047": "Merced", "049": "Alturas", "051": "Bridgeport", "053": "Salinas", "055": "Napa",
    "057": "Nevada City", "059": "Santa Ana", "061": "Auburn", "063": "Quincy", "065": "Riverside", "067": "Sacramento", "069": "Hollister",
    "071": "San Bernardino", "073": "San Diego", "075": "San Francisco", "077": "Stockton", "079": "San Luis Obispo", "081": "Redwood City",
    "083": "Santa Barbara", "085": "San Jose", "087": "Santa Cruz", "089": "Redding", "091": "Downieville", "093": "Yreka", "095": "Fairfield",
    "097": "Santa Rosa", "099": "Modesto", "101": "Yuba City", "103": "Red Bluff", "105": "Weaverville", "107": "Visalia", "109": "Sonora",
    "111": "San Buenaventura (Ventura)", "113": "Woodland", "115": "Marysville",
  },
};
// Where the county's own building stands, where that is known and the seat is a city too large for its middle to say: latitude, longitude.
const SEAT_POINTS = { "06073": [32.7215, -117.172], "06037": [34.0537, -118.2428] };

// ── The projection the other maps use: Albers, as d3's geoAlbersUsa draws the country ───────────────
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
const PROJECTIONS = {
  AK: conic([55, 65], 154, [-2, 58.5], K * 0.35, [487.5 - 0.307 * K, 305 + 0.201 * K]),
  HI: conic([8, 18], 157, [-3, 19.9], K, [487.5 - 0.205 * K, 305 + 0.212 * K]),
};
const lower48 = conic([29.5, 45.5], 96, [-0.6, 38.7], K, [487.5, 305]);

// ── Reading a shapefile: the outlines (.shp) and the table beside them (.dbf) ────────────────────────
function readTable(path) {
  const bytes = readFileSync(path);
  const count = bytes.readUInt32LE(4);
  const headerLength = bytes.readUInt16LE(8);
  const recordLength = bytes.readUInt16LE(10);
  const fields = [];
  for (let at = 32; bytes[at] !== 0x0d; at += 32) fields.push({ name: bytes.toString("latin1", at, at + 11).replace(/\0.*$/, ""), length: bytes[at + 16] });
  const rows = [];
  for (let n = 0; n < count; n++) {
    let at = headerLength + n * recordLength + 1;
    const row = {};
    for (const field of fields) {
      row[field.name] = bytes.toString("utf8", at, at + field.length).trim();
      at += field.length;
    }
    rows.push(row);
  }
  return rows;
}

/** Each record's rings of [longitude, latitude] points. Every record here is a polygon. */
function readShapes(path) {
  const bytes = readFileSync(path);
  const shapes = [];
  for (let at = 100; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at + 4) * 2;
    const from = at + 8;
    const rings = [];
    if (bytes.readInt32LE(from) === 5) {
      const parts = bytes.readInt32LE(from + 36);
      const points = bytes.readInt32LE(from + 40);
      const starts = Array.from({ length: parts }, (_, n) => bytes.readInt32LE(from + 44 + n * 4));
      const first = from + 44 + parts * 4;
      starts.forEach((start, n) => {
        const end = n + 1 < parts ? starts[n + 1] : points;
        rings.push(Array.from({ length: end - start }, (_, k) => [bytes.readDoubleLE(first + (start + k) * 16), bytes.readDoubleLE(first + (start + k) * 16 + 8)]));
      });
    }
    shapes.push(rings);
    at = from + length;
  }
  return shapes;
}

// ── From outlines to squares ─────────────────────────────────────────────────
const edgesOf = (rings, project) => rings.flatMap((ring) => {
  const points = ring.map(([lon, lat]) => project(lat, lon));
  return points.slice(1).map((point, n) => [points[n], point]);
});

/** Mark every sample point inside a shape: `mark(row, from, to)` for each run of them. */
function scan(edges, x0, y0, cell, w, h, mark) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [[, y1], [, y2]] of edges) {
    minY = Math.min(minY, y1, y2);
    maxY = Math.max(maxY, y1, y2);
  }
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
      if (to >= from) mark(row, from, to);
    }
  }
}

/** The middle of a shape, weighing each of its rings by its area: a city of several pieces is where most of it is. */
function middleOf(rings, project) {
  let area = 0;
  let sumX = 0;
  let sumY = 0;
  for (const ring of rings) {
    const points = ring.map(([lon, lat]) => project(lat, lon));
    for (let i = 0; i + 1 < points.length; i++) {
      const cross = points[i][0] * points[i + 1][1] - points[i + 1][0] * points[i][1];
      area += cross;
      sumX += (points[i][0] + points[i + 1][0]) * cross;
      sumY += (points[i][1] + points[i + 1][1]) * cross;
    }
  }
  return area ? [sumX / (3 * area), sumY / (3 * area)] : project(rings[0][0][1], rings[0][0][0]);
}

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

// ── One state ────────────────────────────────────────────────────────────────
const [, , code, countyFile, placeFile] = process.argv;
if (!FIPS[code] || !countyFile || !placeFile) throw new Error("usage: node tools/make_counties.mjs CA <county shapefile, no extension> <place shapefile, no extension>");
const project = PROJECTIONS[code] ?? lower48;
const countyRows = readTable(`${countyFile}.dbf`);
const countyShapes = readShapes(`${countyFile}.shp`);
const placeRows = readTable(`${placeFile}.dbf`);
const placeShapes = readShapes(`${placeFile}.shp`);
const places = placeRows.map((row, n) => ({
  id: row.GEOID,
  name: row.NAME,
  kind: row.NAMELSAD.slice(row.NAME.length).trim(), // "city", "town", "CDP"
  city: row.LSAD !== "57",
  edges: edgesOf(placeShapes[n], project),
  middle: middleOf(placeShapes[n], project),
}));

const out = new URL(`../public/usa/${code}/`, import.meta.url);
mkdirSync(out, { recursive: true });
let bytes = 0;
let files = 0;
const notes = [];
countyRows.forEach((row, n) => {
  if (row.STATEFP !== FIPS[code]) return;
  const fips = row.GEOID;
  const border = edgesOf(countyShapes[n], project);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [[x, y]] of border) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const cell = Math.max(maxX - minX, maxY - minY) / LONG;
  const w = Math.ceil((maxX - minX) / cell) + MARGIN * 2;
  const h = Math.ceil((maxY - minY) / cell) + MARGIN * 2;
  const x0 = minX - MARGIN * cell;
  const y0 = minY - MARGIN * cell;
  const square = ([x, y]) => [(x - x0) / cell, (y - y0) / cell];

  const inside = new Uint8Array(w * SUB * h * SUB);
  scan(border, x0, y0, cell, w, h, (r, from, to) => inside.fill(1, r * w * SUB + from, r * w * SUB + to + 1));
  const within = ([x, y]) => {
    const col = Math.floor(((x - x0) * SUB) / cell);
    const r = Math.floor(((y - y0) * SUB) / cell);
    return col >= 0 && r >= 0 && col < w * SUB && r < h * SUB && inside[r * w * SUB + col] === 1;
  };

  // The cities whose outline comes near the county at all, and which sample points each covers.
  const near = places.filter((place) => place.city && place.edges.some(([[x, y]]) => x >= minX && x <= maxX && y >= minY && y <= maxY));
  const owner = new Uint16Array(w * SUB * h * SUB);
  near.forEach((place, k) => scan(place.edges, x0, y0, cell, w, h, (r, from, to) => {
    for (let col = from; col <= to; col++) if (inside[r * w * SUB + col]) owner[r * w * SUB + col] = k + 1;
  }));

  // Each square of the county goes to whichever covers most of it: one of the cities, or no city.
  const grid = new Uint16Array(w * h);
  const NONE = near.length + 1;
  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const tally = new Map();
      let land = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const at = (cy * SUB + sy) * w * SUB + cx * SUB + sx;
          if (!inside[at]) continue;
          land++;
          tally.set(owner[at] || NONE, (tally.get(owner[at] || NONE) ?? 0) + 1);
        }
      }
      if (land >= LAND) grid[cy * w + cx] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
  }
  // A city too small to win a square is given the one at its middle, if that is in this county.
  const held = new Set(grid);
  near.forEach((place, k) => {
    if (held.has(k + 1) || !within(place.middle)) return;
    const [x, y] = square(place.middle).map(Math.floor);
    grid[y * w + x] = k + 1;
    held.add(k + 1);
  });

  // Number the shapes again, leaving out cities that have no square here; the land in no city comes last.
  const kept = near.map((place, k) => ({ place, old: k + 1 })).filter(({ old }) => held.has(old)).sort((a, b) => a.place.name.localeCompare(b.place.name));
  const renumber = new Map(kept.map(({ old }, k) => [old, k + 1]));
  const open = [...grid].some((value) => value === NONE);
  if (open) renumber.set(NONE, kept.length + 1);
  for (let at = 0; at < grid.length; at++) if (grid[at]) grid[at] = renumber.get(grid[at]);

  const seatName = SEATS[code]?.[fips.slice(2)];
  const seatPlace = seatName ? places.filter((place) => place.name === seatName && within(place.middle)).sort((a, b) => Number(b.city) - Number(a.city))[0] : undefined;
  if (seatName && !seatPlace) notes.push(`${row.NAME}: the seat, ${seatName}, was not found`);
  const point = SEAT_POINTS[fips] ? project(...SEAT_POINTS[fips]) : seatPlace?.middle;
  const file = JSON.stringify({
    code: fips,
    name: row.NAME,
    w,
    h,
    ids: [...kept.map(({ place }) => place.id), ...(open ? [`${fips}-u`] : [])],
    names: [...kept.map(({ place }) => place.name), ...(open ? ["Unincorporated"] : [])],
    kinds: [...kept.map(({ place }) => place.kind), ...(open ? [""] : [])],
    seat: point ? { name: seatName.replace(/^San Buenaventura \((.+)\)$/, "$1"), place: seatPlace?.city ? seatPlace.id : "", at: square(point).map(round) } : null,
    runs: runsOf(grid),
  });
  bytes += file.length;
  files++;
  writeFileSync(new URL(`${fips}.json`, out), file);
});
console.log(`${code}: ${files} counties, ${Math.round(bytes / 1024)} KB in all`);
for (const note of notes) console.log(`  ${note}`);
