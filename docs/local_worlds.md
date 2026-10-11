# Counties and cities: the map down to the city, and a one-room world

Written 2026-10-10 as a plan. Steps 1 to 3 of the order of work at the end
were built on 2026-10-11, with San Diego County as the first body:

- `build_chamber_snapshot.py` (cat-pol-datasets) writes `world/chamber.json.gz`
  beside a body's dataset, and `build_sd_county.py` runs it after publishing.
- `src/worlds/chamber.ts` is the one-room world, `buildCouncilRoom` its room,
  and `public/usa/chambers.json` the registry. The address is
  `?world=chamber&place=06073`.
- `tools/make_counties.mjs` writes a map of each county's cities from the
  Census Bureau's boundary files; California's 58 are in `public/usa/CA/`.
  A click on a California county opens its map; the address is
  `?world=usa#county=06073`, or `#city=06073.0666000` for one city on it.

Where what was built differs from the plan below: a county's seat is a
triangle on the county's own map, and on the state's map only a county whose
board has a room wears one; the Stats tab is the shared one, so it counts
items filed and passed but not yet how often a vote was unanimous or who
dissented; and re-staging a meeting seats the members now serving, not
those who voted.

To add a body: publish its `world/chamber.json.gz`, and add its Census code
to `public/usa/chambers.json`. To add a state's county maps: run
`tools/make_counties.mjs` for it, give it a table of county seats there, and
add its code to `CITY_MAPS` in `src/usa/states.ts`.

## The map: country, state, county, city

Today a click on a state opens the state's map with its counties, and a click
on a county opens a card. The plan adds one more level.

- **A click on a county opens the county's own map**, drawn the way a state's
  is, with each incorporated city as a shape. The land in no city is one more
  shape, "Unincorporated", which is the county government's own ground.
- **Markers say what kind of government sits where.** A star is a capitol, as
  now. A triangle is a county seat and leads to the county's board. A dot is a
  city hall and leads to the city's council. Gold means there is a world behind
  it; white means not yet. On a state's map every county seat gets its
  triangle, so a county's board can be reached without opening the county.
- **The address** gains `#city=<Census place code>`, and `#county=06073` opens
  the county's map where today it selects the county.

What this needs:

- City outlines. us-atlas, which the state maps come from, has no cities. The
  Census Bureau's cartographic boundary files for places do
  (`cb_<year>_<state>_place_500k`), one shapefile per state. `tools/make_usmap.mjs`
  already projects and rasterises; it gains a step that cuts each state's
  places by county and writes `public/usa/<STATE>/<county>.json`, fetched when
  the county is opened. Only states with something to show need generating:
  California first, 58 files.
- County seats. No Census file marks them. California's 58 are a short table
  by hand; other states when they are wanted.
- `src/usa/`: the sheet, the drawing and the scene already take any grid of
  shapes, so a county's map is a third `SheetView` and a third level in
  `index.ts` (`showCounty`), with "← California" on the back button. The
  marker textures gain a triangle and a dot.

## The world: one room

A county board or a city council does not need the Capitol's map. It is one
body in one room, and the app already has that room: a committee's hearing
room has a dais for the members, a table and microphone in front of it, and
seats for the public (`buildCommitteeRoom`). A local world opens straight into
it.

- **On the dais:** the members now serving, in seat or district order, the
  chair in the middle. Figures are generated, not likenesses, as everywhere.
- **In the room:** people come in, sit, go up to the microphone and leave. This
  is animation. Who spoke at a meeting is not in the data, and the About box
  says so, as it does for the chambers.
- **Everything else is the side panel**, which is the existing one with other
  contents:
  - *Overview*: what the body is working on. Items filed lately, the next
    meeting's agenda, the last meeting's results.
  - *Meetings*: the calendar the committee rooms already have, with each
    meeting's items, what was done, and the vote. "Re-stage" seats the members
    who voted and steps through the agenda.
  - *Search*: every item, by number or words.
  - *Stats*: items a year, how many passed, by subject, how often the vote was
    unanimous, and who dissented how often.
  - *Roster*: the members now serving. Each one's card lists how they voted.

What this needs:

- **A common shape for a local body's data**, which `sd-county-ordinances` now
  has: `items`, `meetings`, `agenda_items`, `votes`, and the members with their
  dates. A snapshot script writes one small file per body in the app's shapes:
  the members as `members`, the items as `bills`, and the meetings in the
  committee file's shape, which the panel's calendar already reads.
- **`src/worlds/chamber.ts`: a second template**, beside the legislature one. A
  definition gives the body's name ("Board of Supervisors"), what a member is
  called ("Supervisor"), what a seat is called ("District 3"), and where the
  file is. The scene starts in the room instead of on a map.
- **A registry instead of a list in the code.** There are thousands of local
  governments, so they cannot each be a `WorldKey`. One file,
  `public/usa/chambers.json`, maps a county's or city's Census code to its
  definition, and the address is `?world=chamber&place=06073`. Adding a body is
  then a line in that file and its data. No code.

## The data, for more than one county

San Diego County publishes through Legistar, and so do many counties and
cities (this repository already reads Oakland, Long Beach, Fresno and others
from it, for ordinances only). `build_sd_county.py` is written against the
Legistar API and nothing in it is San Diego's except the address, the district
table and the rule for picking an item's document. Made to take the client's
name, it builds the same five tables for any Legistar body. Bodies on other
systems (the City of San Diego is one) need their own reader into the same
tables.

Not in any of these sources, and so nice to have rather than planned: everyone
who ever sat on a body, with the dates they were elected and left. Legistar
gives the members since the body started using it (2017 for the County).

## Order of work

1. Finish and publish San Diego County's tables; write its snapshot.
2. The chamber template and registry, with San Diego County's board as the
   first room, reached by address.
3. County maps with cities for California, the triangle and dot markers, and
   the door from San Diego County's triangle into its room.
4. A city from Legistar through the same builder, to prove a new body is data
   and one line.
