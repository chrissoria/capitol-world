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

Live at <https://christophersoria.com/capitol-world/>.

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

## Develop

```bash
npm install
npm run dev      # http://localhost:5183, uses the bundled data
npm run build    # type-check and build into dist/
```

Add `?data=live` or `?data=bundled` to the URL to choose the data source.

## Layout

- `src/data/` snapshot types and loading
- `src/world/layout.ts` the map: sites, streets and routes
- `src/world/art.ts` map artwork and figures, drawn at runtime from one palette (no image files)
- `src/world/scene.ts` the map scene: camera, bills at their sites, the replay
- `src/world/building.ts` floor plans (the two chambers, six committee-room templates), furniture, places to be, path finding
- `src/data/meetings.ts` committee rosters and meetings
- `src/world/interior.ts` the inside scene: who is where and what they do next
- `src/world/camera.ts` pan and zoom, shared by both scenes
- `src/ui/panel.ts` the side panel: inspector (with a Back trail), search, filters, and the About dialog
- `src/ui/calendar.ts` the wall calendar from a committee room: every meeting of the Congress, month by month
- `src/ui/roster.ts` the Roster tab: every member, where their figure is, and a click to go there
- `src/ui/explain.ts` the folded "What happens here?" notes on each building's part in the process
- `src/ui/stats.ts` the Stats tab: introductions by period, party and member, and how far they got
- `src/audio/music.ts` chiptune music synthesised with Web Audio (no audio files)

The music is two public-domain tunes ("Yankee Doodle" and "America the
Beautiful") in arrangements written for this project and played by oscillators
in the browser, so there are no recordings to license. It starts on the first
click, and the ♪ button turns it off.

The figures are generated at random from each member's ID and are not likenesses.
Bill summaries are machine-written. Not affiliated with Congress.

License: GPL-3.0-or-later.
