// What is known of a place as a whole: how many people live there and how old they are, what they
// earn, what a home is worth, how they voted. None of it is in the app. It is read from the
// us-places dataset (build_places.py in cat-pol-datasets), which keeps one row for the country and
// for each state, county, city, community and congressional district, under the Census Bureau's
// code. The Stats tab lists a world's place, and the whiteboard draws it beside the places it is
// part of.

import { stateOfCounty } from "../usa/states";
import { fetchJson } from "./load";

const INDEX = "https://huggingface.co/datasets/chrissoria/us-places/resolve/main/index/";
/** The Census Bureau's code for the country as a whole. */
export const NATION = "00";

type Value = string | number | null;
/** One place: its code, and each of the dataset's columns that the app is given. */
export type PlaceFacts = { id: string; name: string; kind: string; parent_id: string | null } & Record<string, Value>;

interface IndexFile {
  schema: number;
  columns: string[];
  places: Record<string, Value[]>;
}

const files = new Map<string, Promise<IndexFile>>();
function indexFile(name: string): Promise<IndexFile> {
  let file = files.get(name);
  if (!file) {
    file = fetchJson<IndexFile>(INDEX + name).then((loaded) => {
      if (loaded.schema !== 1 || !Array.isArray(loaded.columns)) throw new Error("the places file is not in the expected format");
      return loaded;
    });
    file.catch(() => files.delete(name));
    files.set(name, file);
  }
  return file;
}

const rowOf = (file: IndexFile, id: string): PlaceFacts | null => {
  const values = file.places[id];
  if (!values) return null;
  return { id, ...Object.fromEntries(file.columns.map((column, n) => [column, values[n] ?? null])) } as PlaceFacts;
};

/** The file a place's row is in: the country's and the states' share one, and each state has one for everything in it. */
function fileOf(id: string): string | null {
  if (id.length === 2) return "US.json";
  // A district's code is the Census Bureau's full one, with the state after "US".
  const state = stateOfCounty(id.includes("US") ? id.slice(id.indexOf("US") + 2) : id);
  return state ? `${state.code}.json.gz` : null;
}

/** A place and then each place it is part of, up to the country: a city, its county, its state, the United States. */
export async function loadPlace(id: string): Promise<PlaceFacts[]> {
  const chain: PlaceFacts[] = [];
  for (let next: string | null = id; next && chain.length < 5; ) {
    const name = fileOf(next);
    const row: PlaceFacts | null = name ? rowOf(await indexFile(name), next) : null;
    if (!row) break;
    chain.push(row);
    next = row.parent_id;
  }
  if (!chain.length) throw new Error(`nothing is known of place ${id}`);
  return chain;
}

/** Every place in one state, by the state's postal code: its counties, its cities and communities, its districts. */
export async function loadPlacesIn(code: string): Promise<PlaceFacts[]> {
  const file = await indexFile(`${code}.json.gz`);
  return Object.keys(file.places).map((id) => rowOf(file, id)!);
}

/** The fifty states and the District, for setting the country's own figures beside. */
export async function loadStates(): Promise<PlaceFacts[]> {
  const file = await indexFile("US.json");
  return Object.keys(file.places).map((id) => rowOf(file, id)!).filter((place) => place.kind === "state" || place.kind === "district");
}

// ── Charts ───────────────────────────────────────────────────────────────────

export interface PlaceBar {
  label: string;
  value: number;
  /** A party's colour, where the bar is a party's. */
  party?: "R" | "D" | "I";
}

/** One chart of a place, ready for the whiteboard. */
export interface PlaceChart {
  key: "ages" | "vote" | "income" | "home" | "density";
  title: string;
  caption: string;
  bars: PlaceBar[];
  unit: "percent" | "dollars" | "number";
  /** Bars laid on their side, for long names. */
  sideways?: boolean;
}

const num = (place: PlaceFacts, column: string): number | null => (typeof place[column] === "number" ? (place[column] as number) : null);
const AGES: [string, string][] = [
  ["age_under_1", "Under 1"], ["age_1_4", "1–4"], ["age_5_12", "5–12"], ["age_13_17", "13–17"], ["age_under_18", "Under 18"], ["age_18_24", "18–24"],
  ["age_25_34", "25–34"], ["age_35_44", "35–44"], ["age_45_54", "45–54"], ["age_55_64", "55–64"], ["age_65_74", "65–74"], ["age_75_79", "75–79"], ["age_80_plus", "80+"],
];
const PARTIES: [string, string, PlaceBar["party"]][] = [
  ["republican", "Republican", "R"], ["democrat", "Democrat", "D"], ["independent", "Independent", "I"], ["libertarian", "Libertarian", undefined], ["green", "Green", undefined], ["other", "Other", undefined],
];

/** The year of the last vote for president the place's row has: its columns end with it. */
export function voteYear(place: PlaceFacts): string | null {
  const column = Object.keys(place).find((key) => /^vote_republican_\d{4}$/.test(key) && place[key] !== null);
  return column ? column.slice(-4) : null;
}

const possessive = (name: string) => `${name}’s`;

/**
 * The charts there are of a place. `chain` is the place and what it is part of (loadPlace); `states` is every state, which
 * the country is set beside, having nothing it is part of.
 */
export function placeCharts(chain: PlaceFacts[], states: PlaceFacts[] = []): PlaceChart[] {
  const place = chain[0];
  const charts: PlaceChart[] = [];

  const aged = chain.find((entry) => num(entry, "age_18_24") !== null);
  if (aged) {
    // Where the four bands under 18 are known they are shown, and the one band that sums them is not; otherwise the one.
    const fine = num(aged, "age_under_1") !== null;
    const bars = AGES.filter(([column]) => (column === "age_under_18" ? !fine : true))
      .map(([column, label]) => ({ label, value: (num(aged, column) ?? NaN) * 100 }))
      .filter((bar) => Number.isFinite(bar.value));
    charts.push({ key: "ages", title: `How old ${possessive(aged.name)} people are`, caption: `Share of its people at each age, ${aged.age_year ?? ""}`.trim(), bars, unit: "percent" });
  }

  const voted = chain.find((entry) => voteYear(entry));
  if (voted) {
    const year = voteYear(voted)!;
    const bars = PARTIES.map(([key, label, party]) => ({ label, party, value: (num(voted, `vote_${key}_${year}`) ?? 0) * 100 })).filter((bar) => bar.value >= 0.05);
    const cast = num(voted, `votes_cast_${year}`);
    const whose = voted === place ? "" : ` · the vote is not counted for ${place.name} alone`;
    charts.push({ key: "vote", title: `How ${voted.name} voted for president, ${year}`, caption: `${cast ? `${cast.toLocaleString()} votes cast` : "Share of the votes cast"}${whose}`, bars, unit: "percent" });
  }

  // A figure of the place beside the same figure of each place it is part of; or, for the country, its highest states.
  const beside = (key: PlaceChart["key"], column: string, title: string, caption: (entry: PlaceFacts) => string, unit: PlaceChart["unit"]) => {
    const known = chain.filter((entry) => num(entry, column) !== null);
    if (known[0] !== place) return;
    if (known.length > 1) {
      charts.push({ key, title, caption: caption(place), bars: known.map((entry) => ({ label: entry.name, value: num(entry, column)! })), unit });
      return;
    }
    const top = states.filter((entry) => num(entry, column) !== null).sort((a, b) => num(b, column)! - num(a, column)!).slice(0, 9);
    if (!top.length) return;
    charts.push({ key, title: `${title}: ${place.name} and its highest states`, caption: caption(place), bars: [{ label: place.name, value: num(place, column)! }, ...top.map((entry) => ({ label: entry.name, value: num(entry, column)! }))], unit, sideways: true });
  };
  const survey = (entry: PlaceFacts) => `Census Bureau, American Community Survey, ${String(entry.income_years ?? "").replace("-", "–")}`;
  beside("income", "median_household_income", "Median household income", survey, "dollars");
  beside("home", "median_home_value", "Median home value", (entry) => `What owners say their homes are worth · ${survey(entry)}`, "dollars");
  beside("density", "density_per_sq_mi", "People to a square mile of land", (entry) => `Census Bureau, ${entry.population_year ?? ""}`.trim(), "number");
  return charts;
}

/** A place's headline figures, for a list: what each is called, what it is, and the chart that shows it, if one does. */
export function placeFigures(chain: PlaceFacts[]): { label: string; value: string; chart?: PlaceChart["key"] }[] {
  const place = chain[0];
  const figures: { label: string; value: string; chart?: PlaceChart["key"] }[] = [];
  const whole = (column: string) => num(place, column)?.toLocaleString() ?? "";
  const share = (value: number | null) => (value === null ? "" : `${(value * 100).toFixed(1)}%`);
  const dollars = (column: string) => (num(place, column) === null ? "" : `$${num(place, column)!.toLocaleString()}`);
  const older = ["age_65_74", "age_75_79", "age_80_plus"].map((column) => num(place, column));
  const voted = chain.find((entry) => voteYear(entry));
  const year = voted ? voteYear(voted)! : "";
  const push = (label: string, value: string, chart?: PlaceChart["key"]) => value && figures.push({ label, value, chart });
  push(`People${place.population_year ? `, ${place.population_year}` : ""}`, whole("population"));
  push("People to a square mile", whole("density_per_sq_mi"), "density");
  push("Under 18", share(num(place, "age_under_18")), "ages");
  push("65 and over", older.every((value) => value !== null) ? share(older.reduce<number>((sum, value) => sum + value!, 0)) : "", "ages");
  push("Median household income", dollars("median_household_income"), "income");
  push("Median home value", dollars("median_home_value"), "home");
  push("Income inequality (Gini, 0 to 1)", num(place, "gini_index")?.toFixed(2) ?? "");
  push(`Economy for each person${place.gdp_year ? `, ${place.gdp_year}` : ""}`, dollars("gdp_per_capita"));
  push("Living in urban areas", share(num(place, "urban_population_share")));
  push(`Violent crimes for each 100,000 people${place.crime_year ? `, ${place.crime_year}` : ""}`, whole("violent_crime_rate"));
  if (voted) {
    // The party that won the most, and its share: the chart has the rest.
    const [label, value] = PARTIES.map(([key, name]) => [name, num(voted, `vote_${key}_${year}`) ?? 0] as [string, number]).sort((a, b) => b[1] - a[1])[0];
    push(`Vote for president, ${year}${voted === place ? "" : ` (${voted.name})`}`, `${label} ${(value * 100).toFixed(1)}%`, "vote");
  }
  return figures;
}
