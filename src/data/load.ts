import type { CommitteeFile } from "./meetings";
import type { CongressList, SearchIndex, World } from "./types";

const ROOT = "https://huggingface.co/datasets/chrissoria/federal-bills-active/resolve/main/world/";
const BUNDLED = `${import.meta.env.BASE_URL}fixtures/`;

/** The finished Congress the address asks for with `?congress=118`, or null for the current one. */
export function congressInAddress(): number | null {
  const asked = Number(new URLSearchParams(location.search).get("congress"));
  return Number.isInteger(asked) && asked > 0 ? asked : null;
}

/** The finished Congress on show, or null for the current one. */
export let archived: number | null = congressInAddress();

/** Show another Congress (null for the current one). Its files load again when they are next asked for. */
export function setCongress(congress: number | null) {
  archived = congress;
  committeeFile = undefined;
}

// A finished Congress is built once and kept in its own folder; it has no bundled copy.
const remote = () => (archived ? `${ROOT}archive/${archived}/` : ROOT);

export type DataSource = "live" | "bundled";

/** `?data=live` or `?data=bundled` overrides the default (bundled in dev, live in production). */
function preferred(): DataSource {
  const asked = new URLSearchParams(location.search).get("data");
  if (asked === "live" || asked === "bundled") return asked;
  return import.meta.env.DEV ? "bundled" : "live";
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Some hosts decompress .gz for us and some do not, so look at the bytes.
  const gzipped = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const text = gzipped
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

async function fromEither<T>(file: string): Promise<{ data: T; source: DataSource }> {
  if (archived) return { data: await fetchJson<T>(remote() + file), source: "live" };
  return currentFile<T>(file);
}

/** A file of the current Congress: live or bundled, whichever is preferred, with the other as a fallback. */
async function currentFile<T>(file: string): Promise<{ data: T; source: DataSource }> {
  const order: DataSource[] = preferred() === "live" ? ["live", "bundled"] : ["bundled", "live"];
  let lastError: unknown;
  for (const source of order) {
    try {
      return { data: await fetchJson<T>((source === "live" ? ROOT : BUNDLED) + file), source };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function loadWorld(): Promise<{ world: World; source: DataSource }> {
  const { data, source } = await fromEither<World>(archived ? "world.json.gz" : "world.json");
  if (data.schema !== 1 || !Array.isArray(data.bills) || !Array.isArray(data.members)) {
    throw new Error("world.json is not in the expected format");
  }
  return { world: data, source };
}

/** The finished Congresses that can be opened, newest first. Empty if the list cannot be read. */
export function loadCongresses(): Promise<CongressList["archive"]> {
  return fetchJson<CongressList>(`${ROOT}congresses.json`).then((list) => list.archive ?? [], () => []);
}

let committeeFile: Promise<CommitteeFile> | undefined;

/** Committee rosters and meetings, loaded the first time a committee is opened. */
export function loadCommittees(): Promise<CommitteeFile> {
  committeeFile ??= fromEither<CommitteeFile>(archived ? "committees.json.gz" : "committees.json").then((result) => result.data);
  return committeeFile;
}

const searchIndexes = new Map<number | null, Promise<SearchIndex>>();

/** Every bill of one Congress (null for the current one). Kept once loaded, whichever Congress is on show. */
export function loadSearchOf(congress: number | null): Promise<SearchIndex> {
  let index = searchIndexes.get(congress);
  if (!index) {
    index = congress
      ? fetchJson<SearchIndex>(`${ROOT}archive/${congress}/search.json.gz`)
      : currentFile<SearchIndex>("search.json.gz").then((result) => result.data);
    index.catch(() => searchIndexes.delete(congress)); // so a failed load can be tried again
    searchIndexes.set(congress, index);
  }
  return index;
}

/** Every bill of the Congress on show, loaded the first time the search box is used. */
export function loadSearch(): Promise<SearchIndex> {
  return loadSearchOf(archived);
}

export interface CongressEntry {
  congress: number;
  /** First and last year; the last is null for the Congress still under way. */
  years: [number, number | null];
  live: boolean;
}

let congressLine: Promise<CongressEntry[]> | undefined;

/** Every Congress that can be opened, the current one first. Empty if the list cannot be read. */
export function loadCongressLine(): Promise<CongressEntry[]> {
  congressLine ??= loadCongresses().then((list) => {
    if (!list.length) return [];
    const current = Math.max(...list.map((item) => item.congress)) + 1;
    return [
      { congress: current, years: [1789 + 2 * (current - 1), null], live: true },
      ...list.map((item) => ({ congress: item.congress, years: item.years, live: false }) satisfies CongressEntry),
    ];
  });
  return congressLine;
}
