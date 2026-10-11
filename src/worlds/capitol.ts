// Capitol Hill: Congress and its bills. Its data loaders are the defaults in ../data/load.

import { loadCongressLine } from "../data/load";
import { ordinal } from "../data/types";
import { buildLayout } from "../world/layout";
import type { WorldDef } from "./types";

export const capitol: WorldDef = {
  key: "capitol",
  name: "Capitol World",
  periodParam: "congress",
  provider: null,
  layout: (world) => buildLayout(world.committees),
  line: loadCongressLine,
  periodLabel: (entry) => `${ordinal(entry.congress)} Congress · ${entry.years[0]}–${entry.years[1] ?? "now"}`,
  tabs: { roster: true },
  doors: [{ site: "president", to: "whitehouse", label: "Go to the White House →" }],
  words: {
    item: "bill",
    items: "bills",
    period: (world) => `${ordinal(world.congress)} Congress${world.years ? ` (${world.years[0]}–${world.years[1]})` : ""}`,
    stamp: (world, through) => (world.final ? `Final record · last action ${through}` : `Data through ${through}`),
    stages: {},
    overview: (world) =>
      world.final
        ? {
            title: `What the ${ordinal(world.congress)} Congress${world.years ? ` (${world.years[0]}–${world.years[1]})` : ""} did`,
            lead: `${world.counts.total.toLocaleString()} bills and resolutions were introduced in the ${ordinal(world.congress)} Congress${world.years ? ` (${world.years[0]}–${world.years[1]})` : ""}. Each one is on the map, at the place where it ended.`,
            where: "Where those bills ended",
          }
        : {
            title: "What Congress is working on",
            lead: `${world.counts.world.toLocaleString()} bills had an action in the 30 days up to ${new Date(`${world.data_through}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}. Each sheet of paper on the map is one of them, sitting where its latest action left it.`,
            where: "Where those bills are",
          },
    kicker: (site) => (site.wing === "Center" ? "Shared" : site.wing),
    person: "Sponsor",
    deadOnly: "Dead bills only",
    searchHint: "Bill number, title words, or a name",
  },
};
