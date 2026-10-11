// Checks on the maps of the United States that need no page: the grid of the country, the fifty
// state files, and how places are named. Run with `npm test`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CAPITALS, CODES, GRID_H, GRID_W, stateGrid } from "../src/usa/shapes.ts";
import { STATES, countyName, countyWords, hasCounties, stateOfCounty } from "../src/usa/states.ts";

interface StateFile {
  code: string;
  w: number;
  h: number;
  capital: [number, number];
  ids: string[];
  names: string[];
  runs: number[];
}

const fileOf = (code: string): StateFile => JSON.parse(readFileSync(new URL(`../public/usa/${code}.json`, import.meta.url), "utf8"));

function gridOf(file: StateFile): Uint16Array {
  const grid = new Uint16Array(file.w * file.h);
  let at = 0;
  for (let i = 0; i + 1 < file.runs.length; i += 2) {
    grid.fill(file.runs[i], at, at + file.runs[i + 1]);
    at += file.runs[i + 1];
  }
  assert.equal(at, grid.length, `${file.code}: the runs fill the grid exactly`);
  return grid;
}

test("the country's grid has every place the list of places has, and no other", () => {
  assert.deepEqual([...CODES].sort(), STATES.map((place) => place.code).sort());
  const grid = stateGrid();
  assert.equal(grid.length, GRID_W * GRID_H);
  const squares = new Map<string, number>();
  for (const state of grid) if (state) squares.set(CODES[state - 1], (squares.get(CODES[state - 1]) ?? 0) + 1);
  for (const code of CODES) assert.ok((squares.get(code) ?? 0) > 0, `${code} has squares`);
});

test("every capital's star stands on its own state, or just off its coast", () => {
  const grid = stateGrid();
  for (const place of STATES) {
    const [x, y] = CAPITALS[place.code];
    const near = new Set<string>();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.add(CODES[grid[(Math.floor(y) + dy) * GRID_W + Math.floor(x) + dx] - 1]);
    assert.ok(near.has(place.code), `${place.capital} is in ${place.name}`);
  }
});

test("every state has a map of its own, with a square for each county and its capital on one of them", () => {
  let counties = 0;
  for (const place of STATES.filter(hasCounties)) {
    const file = fileOf(place.code);
    const grid = gridOf(file);
    assert.equal(file.ids.length, file.names.length);
    assert.equal(new Set(file.ids).size, file.ids.length, `${place.code}: no county twice`);
    const seen = new Set(grid);
    file.ids.forEach((fips, n) => {
      assert.equal(stateOfCounty(fips), place, `${fips} is in ${place.code}`);
      assert.ok(seen.has(n + 1), `${fips} ${file.names[n]} has a square`);
    });
    const under = grid[Math.floor(file.capital[1]) * file.w + Math.floor(file.capital[0])];
    assert.ok(under > 0, `${place.capital} stands on a county of ${place.name}`);
    counties += file.ids.length;
  }
  assert.equal(counties, 3141); // every county in the Census file but the District of Columbia
});

test("a few capitals are in the counties they are known to be in", () => {
  const countyOfCapital = (code: string) => {
    const file = fileOf(code);
    return file.names[gridOf(file)[Math.floor(file.capital[1]) * file.w + Math.floor(file.capital[0])] - 1];
  };
  assert.equal(countyOfCapital("CA"), "Sacramento");
  assert.equal(countyOfCapital("TX"), "Travis");
  assert.equal(countyOfCapital("AK"), "Juneau");
  assert.equal(countyOfCapital("HI"), "Honolulu");
  assert.equal(countyOfCapital("FL"), "Leon");
  assert.equal(countyOfCapital("VA"), "Richmond");
});

test("counties are named the way their state names them", () => {
  assert.deepEqual(countyName("06037", "Los Angeles"), { name: "Los Angeles County", kind: "County" });
  assert.deepEqual(countyName("22071", "Orleans"), { name: "Orleans Parish", kind: "Parish" });
  assert.deepEqual(countyName("02020", "Anchorage"), { name: "Anchorage", kind: "Borough or census area" });
  assert.deepEqual(countyName("51760", "Richmond"), { name: "Richmond (city)", kind: "Independent city" });
  assert.deepEqual(countyName("51159", "Richmond"), { name: "Richmond County", kind: "County" });
  assert.deepEqual(countyName("32510", "Carson City"), { name: "Carson City", kind: "Independent city" });
  assert.deepEqual(countyWords("LA"), ["parish", "parishes"]);
  assert.equal(stateOfCounty("48453")?.code, "TX");
  assert.equal(stateOfCounty("99999"), undefined);
});
