# Capitol World

A pixel-art map of where the active bills of the U.S. Congress are right now.
Legislators sit in their chambers; each sheet of paper is a bill, stacked at the
committee, calendar, floor or desk its latest action left it at. On load, the
map replays the latest day of activity: sponsors walk new bills to the hopper,
committee chairs carry reported bills to the calendar, and robots move the rest.

Live at <https://christophersoria.com/capitol-world/>.

## Data

The app has no backend. It reads two files that a daily job writes next to the
public dataset
[chrissoria/federal-bills-active](https://huggingface.co/datasets/chrissoria/federal-bills-active):

- `world/world.json`: members, committees, the bills with an action in the last
  30 days and where each sits, and the moves of the last 7 days
- `world/search.json.gz`: every bill of the Congress, for the search box

Both are built by `build_world_snapshot.py` in
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
- `src/world/layout.ts` the map: sites, streets, seats and routes
- `src/world/art.ts` all artwork, drawn at runtime from one palette (no image files)
- `src/world/scene.ts` the Phaser scene: camera, bills at their sites, the replay
- `src/ui/panel.ts` the side panel: inspector, search, filters, about

The figures are generated at random from each member's ID and are not likenesses.
Bill summaries are machine-written. Not affiliated with Congress.

License: GPL-3.0-or-later.
