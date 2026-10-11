# Capitol World

A pixel-art map of where the active bills of the U.S. Congress are right now.
Each sheet of paper is a bill, stacked at the committee, calendar, floor or desk
its latest action left it at. On load, the map replays the latest day of
activity: sponsors walk new bills to the hopper, committee chairs carry reported
bills to the calendar, and robots move the rest.

Click the House or the Senate to go inside. Every member has a seat in the
chamber, and the building around it has offices, party cloakrooms, a library, a
hearing room, a cafeteria, a rotunda, a press room and a gym. Members get up,
walk somewhere, do something and come back. That bustle is ambient animation on
an invented floor plan; only the bills, where they are and who carried them come
from the data.

Every committee building opens as well, into one of six hearing-room designs
sized to its membership. The panel shows the committee's calendar (meetings
scheduled and held, the bills taken up, recorded decisions), and the room fills
with its members when a meeting is under way or when a past one is re-staged.
That comes from `world/committees.json`, built from the
[chrissoria/federal-committees](https://huggingface.co/datasets/chrissoria/federal-committees)
dataset.

The Stats tab counts every measure of the Congress by the date it was
introduced (the latest day, 7 days, 30 days, 12 months or the whole Congress)
and shows how far those measures have got, split by the sponsor's party.

The picker under the title opens a finished Congress, back to the 113th
(2013–2015). A finished Congress shows every one of its bills at the place it
ended, with the official Congressional Research Service summaries; `?congress=118`
in the URL does the same, and a link to a bill opens the Congress it belongs to.

The Bill Memorial stands for the bills that are finished without having
succeeded. Bills that were vetoed or lost a floor vote are laid there, and its
panel counts every dead bill by the way it died: in a finished Congress, where
it stood on the last day; in the current one, a year without action, after
which 96 in 100 bills of the last six Congresses never moved again.

Search looks through every Congress, and the Stats tab takes any run of them,
from one Congress to all of them. The Stats tab is also a building: the Library
of Congress, where a teacher at a whiteboard draws any of its figures as a chart, stroke by
stroke, and the chart can be changed on the board (by party, over time, by
Congress, by policy area). A few small objects on the lawns (a ballot
box, a shutdown barricade, a server rack) place each Congress in its years;
they are scenery with a caption, listed in `src/world/era.ts`.

## Worlds

Capitol Hill is one of four worlds. The White House world is about executive
orders. Click the White House to go inside: the President at the desk in the
Oval Office with the orders on it, the cabinet at its table, the senior staff at
their desks, the mess and the briefing room. The orders are listed by the
department each mostly directs, revoked orders are kept apart, and a picker goes
by presidency back to 1791. The agencies around the White House are placeholders
for now, drawn as building sites. The floor plan is invented, and so is what the
figures do; who is on the roster comes from
[executive-branch-roster](https://huggingface.co/datasets/chrissoria/executive-branch-roster).
The President's figure takes its hair, suit and tie colours from the person;
nothing else about any figure is a likeness. The White House on the Capitol map has a door
to it, and its gate leads back; the address (`?world=whitehouse&term=39`) says
which world and period is on show.

The Supreme Court world is about the Court's cases, a term at a time back to
1946 (`?world=court&term=2025`). A case waits on the argument calendar, sits in
the Court once argued, and then goes to the building for how it came out:
affirmed, reversed, vacated, or another way. Emergency applications that asked
for more than extra time have a docket building of their own. Click the Court
to go inside, where the justices who sat that term are on the bench. A case's
card gives the question it asked, what was held, how each justice voted and its
record. The data is `world/court.json.gz` and `world/text/<term>.json.gz` beside
[chrissoria/supreme-court-cases](https://huggingface.co/datasets/chrissoria/supreme-court-cases),
which joins the Supreme Court Database, Oyez and the Court's own docket and is
licensed CC BY-NC. Subjects and outcomes are the database's coding and are
missing for the term in progress.

California Capitol World (`?world=california`, and `&session=2023` for the
2023–2024 session) is the California Legislature: the same map as Capitol Hill
with the Assembly in the west wing, the Senate in the east, the Governor's
Office where the White House stands, and California's own words for every step.
It has every session back to 1999–2000. A measure's place is read from its
history, in which the Legislature records where each action left it, so nothing
is guessed from wording; for sessions before 2007–2008 the record says only how
a measure ended, and those that did not pass lie together at the memorial.
Summaries are the Legislative Counsel's Digest. California gives bills no
policy area, so the first committee a bill was sent to for its subject stands
in for one. Committee rooms list their members, taken from the committee's most
recent roll call; hearings are not shown yet. The data is in `world/` beside
[chrissoria/california-bills](https://huggingface.co/datasets/chrissoria/california-bills),
refreshed daily.

A world is described by one definition in `src/worlds/` (see `types.ts`): where
its data comes from, how its buildings are laid out, its words, and what its
whiteboard can plot. The scene, panel, search, statistics, whiteboard and travel
are shared, so a new world is a data adapter, a layout and a vocabulary.

### Another state's capitol

A state legislature is not a new kind of world. It is Congress's kind, so it
uses the Capitol's map, loaders and panel, and gives only what differs:

1. Its data, in the shapes Congress's files have: `world.json.gz`,
   `search.json.gz`, `committees.json.gz`, `text/<n>.json.gz` and a list of
   sessions (`build_california_snapshot.py` in cat-pol-datasets is the model).
   The lower house is written as `"House"`, the wing it fills on the map.
2. A definition like `src/worlds/california.ts`: where the files are (`source`),
   what the houses, the executive and a session are called (`legislature`), the
   buildings across the top and the names of the shared ones (a `Plan` for
   `buildLayout`), what each building does (`explain`), and the words for the
   Stats tab and the whiteboard.
3. Its name in `WorldKey` and `WORLDS` (`src/worlds/`), and in the state's
   `world` in `src/usa/states.ts`, which turns the star on its capital gold.

`docs/state_worlds.md` has what is left to do for California and how the other
states' data might be had.

Live at <https://christophersoria.com/capitol-world/>.

### A county board or a city council

A local body is one room and no map (`src/worlds/chamber.ts`): the members on
the dais, the public coming to the microphone, and the meetings, items and
votes in the side panel. It opens with `?world=chamber&place=06073`, where the
place is a Census code. San Diego County's Board of Supervisors is the first.

A new body is data and a line, with no code: publish its
`world/chamber.json.gz` (`build_chamber_snapshot.py` in cat-pol-datasets) and
add its Census code to `public/usa/chambers.json`. `docs/local_worlds.md` has
the plan and what is built.

## The map of the United States

The worlds are reached from a map of the country (`?world=usa`), and the board
on the lawn left of the White House leads out to it. It is not a world: nothing
on it moves, and it has no data of its own beyond who each place sends to
Congress, which it reads from Capitol World's file.

- Click a state to open that state's own map, with its counties; click a
  county for its card. A county's name shows beside the pointer.
- In California a county opens to a map of its own, with its cities
  (`tools/make_counties.mjs` makes them from the Census Bureau's boundary
  files). A triangle is where the county's government sits and a dot is a
  city hall; a gold one leads into that body's room.
- A star marks each capital. A gold one leads straight into a world: so far
  Washington's, into Capitol World, and Sacramento's, into California Capitol
  World. A white one opens the capital's card, which says its world is not
  built yet.
- The District and the five territories have no map of their own; a click
  opens their card.
- The address can name a state (`#state=CA`), a county by its Census code
  (`#county=06037`), a city by its county and its own code
  (`#city=06073.0666000`) or a capital (`#capital=CA`).

To give a state capitol or a county a world, build the world as the others are
built and name it in `src/usa/states.ts`: in the state's `world`, or in
`COUNTY_WORLDS`.

The shapes come from the Census Bureau's cartographic boundary files, by way of
[us-atlas](https://github.com/topojson/us-atlas) (ISC licence), turned into
grids of squares by `tools/make_usmap.mjs`: the country in
`src/usa/shapes.ts`, and each state in `public/usa/<code>.json`, fetched when
the state is opened. The outlines are from before 2019, so Connecticut has its
eight counties rather than the planning regions that replaced them, and
Alaska's Valdez-Cordova census area, since divided in two, is whole. The
territories are hand-drawn islands in a box, not to scale or in place.

## Data

The app has no backend. It reads two files that a daily job writes next to the
public dataset
[chrissoria/federal-bills-active](https://huggingface.co/datasets/chrissoria/federal-bills-active):

- `world/world.json`: members, committees, the bills with an action in the last
  30 days and where each sits, and the moves of the last 7 days
- `world/search.json.gz`: every bill of the Congress, for the search box
- `world/congresses.json` and `world/archive/<congress>/`: the finished
  Congresses, built once by `build_congress_archive.py` from GovInfo's Bill
  Status bulk data and loaded only when one is picked

The first two are built by `build_world_snapshot.py` in
[cat-pol-datasets](https://github.com/chrissoria/cat-pol-datasets) from the
Congress.gov API. Committee chairs and chamber leaders come from the
public-domain [congress-legislators](https://github.com/unitedstates/congress-legislators)
project. A copy of both files is bundled in `public/fixtures/` for development
and as a fallback.

A member's card also shows the official website, the time in office and the
birth date. Those come from `world/members.json` in the congress-members
dataset (`build_congress_members.py` in cat-pol-datasets, from the same
congress-legislators project), fetched when the first card is opened. The
address is `MEMBERS_URL` in `src/data/load.ts`. A copy is bundled as
`public/fixtures/members.json`; to try a newly built file, copy it there and
run `npm run dev`. Without either copy the card shows what the map file has.

## Develop

```bash
npm install
npm run dev      # http://localhost:5183, uses the bundled data
npm run build    # type-check and build into dist/
```

Add `?data=live` or `?data=bundled` to the URL to choose the data source.

## Layout

- `src/worlds/` one definition per world (Capitol Hill, the White House, the Supreme Court, California's Capitol) and the shape they share
- `src/usa/` the map of the United States and of each state: places, grids, drawing, scene and panel
- `tools/make_usmap.mjs` builds those grids from the Census outlines
- `src/data/` snapshot types and loading
- `src/world/layout.ts` the map: sites, streets and routes
- `src/world/era.ts` the signs of the times drawn on the lawns of each Congress
- `src/world/art.ts` map artwork and figures, drawn at runtime from one palette (no image files)
- `src/world/scene.ts` the map scene: camera, bills at their sites, the replay
- `src/world/building.ts` floor plans (the two chambers, six committee-room templates), furniture, places to be, path finding
- `src/data/meetings.ts` committee rosters and meetings
- `src/world/interior.ts` the inside scene: who is where and what they do next
- `src/world/camera.ts` pan and zoom, shared by both scenes
- `src/ui/panel.ts` the side panel: inspector (with a Back trail), search, filters, and the About dialog
- `src/ui/calendar.ts` the wall calendar from a committee room: every meeting of the Congress, month by month
- `src/ui/roster.ts` the Roster tab: every member, where their figure is, and a click to go there
- `src/ui/member.ts` the lines of a member's card that come from `world/members.json`: website, time in office, birth date
- `src/ui/explain.ts` the folded "What happens here?" notes on each building's part in the process
- `src/ui/stats.ts` the Stats tab: introductions by period, party and member, and how far they got
- `src/ui/whiteboard.ts` the whiteboard in the Library of Congress: charts drawn with marker strokes
- `src/audio/music.ts` chiptune music synthesised with Web Audio (no audio files)

The music is played by oscillators in the browser, so there are no recordings
to license. The map has a shuffle written for this project; the committee rooms
("Yankee Doodle"), the chambers ("America the Beautiful") and the library
("Shenandoah") have public-domain tunes in arrangements written for it. It starts on the first
click, and the ♪ button turns it off.

The figures are generated at random from each member's ID and are not likenesses.
Bill summaries are machine-written. Not affiliated with Congress.

License: GPL-3.0-or-later.
