// The almanac's own reckoning: which lines fall on a page, and which items a search finds.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SearchIndex } from "../src/data/types.ts";

import { found, pageOf, personName } from "../src/usa/bookwork.ts";

test("a list is cut into pages, and a page past the end is the last one", () => {
  const rows = Array.from({ length: 35 }, (_, n) => n);
  assert.deepEqual(pageOf(rows, 0, 16), { rows: rows.slice(0, 16), page: 0, pages: 3 });
  assert.deepEqual(pageOf(rows, 2, 16), { rows: [32, 33, 34], page: 2, pages: 3 });
  assert.equal(pageOf(rows, 9, 16).page, 2);
  assert.deepEqual(pageOf([], 0, 16), { rows: [], page: 0, pages: 1 });
});

test("a search wants every word, in the number, the title or the sponsor, and gives the latest to move first", () => {
  const index = {
    schema: 1, data_through: "2026-10-09", sponsors: ["A000001", "B000002"], sponsor_names: ["Ann Able (D-CA)", "Bo Baker (R-TX)"], statuses: ["In Committee"], policy_areas: [],
    id: ["119-hr-1", "119-hr-2", "119-s-30"], title: ["Clean Water Act of 2026", "Water Infrastructure Renewal Act", "Roads Act"],
    sponsor: [0, 1, 0], status: [0, 0, 0], policy_area: [0, 0, 0], date: ["2026-01-05", "2026-09-30", "2026-03-01"],
  } satisfies SearchIndex;
  assert.deepEqual(found(index, "water"), { rows: [1, 0], total: 2 });
  assert.deepEqual(found(index, "WATER renewal").rows, [1]);
  assert.deepEqual(found(index, "able").rows, [2, 0]); // by a sponsor's name
  assert.deepEqual(found(index, "hr 2").rows, [1]); // by its number
  assert.deepEqual(found(index, "water", 1), { rows: [1], total: 2 });
  assert.deepEqual(found(index, "   "), { rows: [], total: 0 });
});

test("a person is named with their party and state where they have them", () => {
  const member = { id: "A", name: "Ann Able", party: "D", state: "CA", district: 3, chamber: "House" as const, n_world: 1, n_total: 2 };
  assert.equal(personName(member), "Ann Able (D-CA)");
  assert.equal(personName({ ...member, state: "" }), "Ann Able (D)");
  assert.equal(personName({ ...member, party: "", state: "" }), "Ann Able");
  assert.equal(personName(undefined), "");
});
