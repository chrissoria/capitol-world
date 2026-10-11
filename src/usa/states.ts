// The places on the maps of the United States: fifty states, the District of Columbia, the five
// territories that send someone to Congress, and the counties inside each state.
//
// To give a state capitol a world of its own:
//   1. build the world the way the others are built (see ../worlds/types.ts) and add it to ../worlds;
//   2. name it here in the state's `world`.
// The star on its capital then turns gold and leads straight in, as the District's does for Capitol
// World. A county's world is named in COUNTY_WORLDS, and its card then offers the way in.

import type { WorldKey } from "../worlds/types";

export type PlaceKind = "state" | "district" | "territory";

export interface StateInfo {
  /** The postal abbreviation, which is also how Congress's data names the place. */
  code: string;
  name: string;
  kind: PlaceKind;
  capital: string;
  /** The year it joined the Union, and its place in the order of joining. States only. */
  joined?: number;
  order?: number;
  /** The world behind the star on its capital, once there is one. */
  world?: WorldKey;
  /** Too small for its name: the name stands in a column out at sea, with a line back. This is its place in the column, from the top. */
  callout?: number;
  /** Where the name of a place made of small islands goes: beside or under them. */
  label?: { x: number; y: number };
}

const state = (code: string, name: string, capital: string, joined: number, order: number, callout?: number): StateInfo => ({
  code,
  name,
  kind: "state",
  capital,
  joined,
  order,
  callout,
});
const territory = (code: string, name: string, capital: string, label: StateInfo["label"]): StateInfo => ({ code, name, kind: "territory", capital, label });

export const STATES: StateInfo[] = [
  state("AL", "Alabama", "Montgomery", 1819, 22),
  state("AK", "Alaska", "Juneau", 1959, 49),
  state("AZ", "Arizona", "Phoenix", 1912, 48),
  state("AR", "Arkansas", "Little Rock", 1836, 25),
  { ...state("CA", "California", "Sacramento", 1850, 31), world: "california" },
  state("CO", "Colorado", "Denver", 1876, 38),
  state("CT", "Connecticut", "Hartford", 1788, 5, 1),
  state("DE", "Delaware", "Dover", 1787, 1, 3),
  { code: "DC", name: "District of Columbia", kind: "district", capital: "Washington", world: "capitol", callout: 5 },
  state("FL", "Florida", "Tallahassee", 1845, 27),
  state("GA", "Georgia", "Atlanta", 1788, 4),
  { ...state("HI", "Hawaii", "Honolulu", 1959, 50), label: { x: 104, y: 197 } },
  state("ID", "Idaho", "Boise", 1890, 43),
  state("IL", "Illinois", "Springfield", 1818, 21),
  state("IN", "Indiana", "Indianapolis", 1816, 19),
  state("IA", "Iowa", "Des Moines", 1846, 29),
  state("KS", "Kansas", "Topeka", 1861, 34),
  state("KY", "Kentucky", "Frankfort", 1792, 15),
  state("LA", "Louisiana", "Baton Rouge", 1812, 18),
  state("ME", "Maine", "Augusta", 1820, 23),
  state("MD", "Maryland", "Annapolis", 1788, 7, 4),
  state("MA", "Massachusetts", "Boston", 1788, 6),
  state("MI", "Michigan", "Lansing", 1837, 26),
  state("MN", "Minnesota", "Saint Paul", 1858, 32),
  state("MS", "Mississippi", "Jackson", 1817, 20),
  state("MO", "Missouri", "Jefferson City", 1821, 24),
  state("MT", "Montana", "Helena", 1889, 41),
  state("NE", "Nebraska", "Lincoln", 1867, 37),
  state("NV", "Nevada", "Carson City", 1864, 36),
  state("NH", "New Hampshire", "Concord", 1788, 9),
  state("NJ", "New Jersey", "Trenton", 1787, 3, 2),
  state("NM", "New Mexico", "Santa Fe", 1912, 47),
  state("NY", "New York", "Albany", 1788, 11),
  state("NC", "North Carolina", "Raleigh", 1789, 12),
  state("ND", "North Dakota", "Bismarck", 1889, 39),
  state("OH", "Ohio", "Columbus", 1803, 17),
  state("OK", "Oklahoma", "Oklahoma City", 1907, 46),
  state("OR", "Oregon", "Salem", 1859, 33),
  state("PA", "Pennsylvania", "Harrisburg", 1787, 2),
  state("RI", "Rhode Island", "Providence", 1790, 13, 0),
  state("SC", "South Carolina", "Columbia", 1788, 8),
  state("SD", "South Dakota", "Pierre", 1889, 40),
  state("TN", "Tennessee", "Nashville", 1796, 16),
  state("TX", "Texas", "Austin", 1845, 28),
  state("UT", "Utah", "Salt Lake City", 1896, 45),
  state("VT", "Vermont", "Montpelier", 1791, 14),
  state("VA", "Virginia", "Richmond", 1788, 10),
  state("WA", "Washington", "Olympia", 1889, 42),
  state("WV", "West Virginia", "Charleston", 1863, 35),
  state("WI", "Wisconsin", "Madison", 1848, 30),
  state("WY", "Wyoming", "Cheyenne", 1890, 44),
  territory("AS", "American Samoa", "Pago Pago", { x: 343.5, y: 199 }),
  territory("GU", "Guam", "Hagåtña", { x: 317.5, y: 199 }),
  territory("MP", "Northern Mariana Islands", "Saipan", { x: 330, y: 199 }),
  territory("PR", "Puerto Rico", "San Juan", { x: 321.5, y: 182 }),
  territory("VI", "U.S. Virgin Islands", "Charlotte Amalie", { x: 340, y: 182 }),
];

export const STATE: Record<string, StateInfo> = Object.fromEntries(STATES.map((place) => [place.code, place]));

/** The Census Bureau's two-digit number for each state, which begins the code of every county in it. */
const FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17",
  IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30",
  NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56",
};

/** Whether a place has a map of its own to open, with its counties on it. The District and the territories do not. */
export const hasCounties = (place: StateInfo) => place.kind === "state";

/** The state a county is in, from the county's five-digit code. */
export function stateOfCounty(fips: string): StateInfo | undefined {
  return STATES.find((place) => FIPS[place.code] === fips.slice(0, 2));
}

/** Whether a place's counties have maps of their own, with the cities on them. Every state's do. */
export const hasCities = (place: StateInfo) => hasCounties(place);

/** Worlds that counties have, by the county's five-digit code. None yet. */
export const COUNTY_WORLDS: Record<string, WorldKey> = {};

/** What a state calls its counties: one, and several. */
export function countyWords(code: string): [string, string] {
  if (code === "LA") return ["parish", "parishes"];
  if (code === "AK") return ["borough or census area", "boroughs and census areas"];
  return ["county", "counties"];
}

/**
 * A county's name as people say it. The Census file has "Orleans", "Los Angeles" and "Richmond", which
 * are a parish, a county and (in Virginia, with a code of 510 or more) a city that belongs to no county.
 */
export function countyName(fips: string, name: string): { name: string; kind: string } {
  const state = stateOfCounty(fips)?.code;
  if (state === "LA") return { name: `${name} Parish`, kind: "Parish" };
  if (state === "AK") return { name, kind: "Borough or census area" };
  if (Number(fips.slice(2)) >= 510 && (state === "VA" || state === "MD" || state === "MO" || state === "NV")) {
    return { name: /city$/i.test(name) ? name : `${name} (city)`, kind: "Independent city" };
  }
  return { name: `${name} County`, kind: "County" };
}
