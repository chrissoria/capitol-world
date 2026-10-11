// Checks on the maps of the United States that need no page: the grid of the country and how places
// are named. Run with `npm test`. The maps of the states and counties are made, and checked, with the
// us-places dataset (build_boundaries.py in cat-pol-datasets).

import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPITALS, CODES, GRID_H, GRID_W, stateGrid } from "../src/usa/shapes.ts";
import { STATES, countyName, countyWords, hasCounties, stateOfCounty } from "../src/usa/states.ts";

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
