import type { CommitteeFile } from "./meetings";
import type { CongressList, MemberFacts, MemberFile, SearchIndex, World } from "./types";

const ROOT = "https://huggingface.co/datasets/chrissoria/federal-bills-active/resolve/main/world/";
const BUNDLED = `${import.meta.env.BASE_URL}fixtures/`;
/** Who each member is and when they served: the app's file in the congress-members dataset (build_congress_members.py). */
const MEMBERS_URL = "https://huggingface.co/datasets/chrissoria/congress-members/resolve/main/world/members.json";

/** The finished Congress the address asks for with `?congress=118`, or null for the current one. */
export function congressInAddress(): number | null {
  const query = new URLSearchParams(location.search);
  const raw = query.get("congress") ?? query.get("term");
  const asked = raw === null || raw === "" ? NaN : Number(raw);
  return Number.isInteger(asked) && asked >= 0 ? asked : null;
}

/** The finished Congress on show, or null for the current one. */
export let archived: number | null = congressInAddress();

/** Show another Congress (null for the current one). Its files load again when they are next asked for. */
export function setCongress(congress: number | null) {
  archived = congress;
  committeeFile = undefined;
}

/** Where another world's data comes from, in the shapes the Capitol's files have. */
export interface DataProvider {
  world(period: number | null): Promise<World>;
  search(period: number | null): Promise<SearchIndex>;
  line(): Promise<CongressEntry[]>;
  /** The fuller text of an item whose summary on the map was cut short; null when there is none. */
  text?(id: string): Promise<string | null>;
}

let provider: DataProvider | null = null;

/** Read from another world's data (null for the Capitol's own files). */
export function useProvider(next: DataProvider | null) {
  provider = next;
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

export async function fetchJson<T>(url: string): Promise<T> {
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
  if (provider) return { world: await provider.world(archived), source: "live" };
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

const TEXT_FILES = 16; // build_world_snapshot.py: a finished Congress's long summaries, by bill number modulo this
const textFiles = new Map<string, Promise<Record<string, string>>>();

/**
 * The whole of a summary that the map file cut short ("…"), fetched when the item is opened.
 * Null when there is nothing longer to show.
 */
export function loadText(id: string): Promise<string | null> {
  if (provider) return provider.text ? provider.text(id).catch(() => null) : Promise.resolve(null);
  const [congress, , number] = id.split("-");
  if (!archived || Number(congress) !== archived || !/^\d+$/.test(number ?? "")) return Promise.resolve(null);
  const url = `${ROOT}archive/${congress}/text/${Number(number) % TEXT_FILES}.json.gz`;
  let file = textFiles.get(url);
  if (!file) textFiles.set(url, (file = fetchJson<Record<string, string>>(url)));
  return file.then((texts) => texts[id] ?? null, () => (textFiles.delete(url), null));
}

let memberFile: Promise<MemberFile | null> | undefined;

/**
 * What is known about a member beyond the map file (website, time in office, birth date), fetched when
 * the first member's card is opened. Null when the file cannot be read or does not have the member, and
 * the card then shows what it always has. Like the map's own files, the copy in fixtures/ is read first
 * in development and as a fallback otherwise.
 */
export function loadMemberFacts(id: string): Promise<MemberFacts | null> {
  if (provider) return Promise.resolve(null);
  memberFile ??= (async () => {
    const bundled = `${BUNDLED}members.json`;
    for (const url of preferred() === "live" ? [MEMBERS_URL, bundled] : [bundled, MEMBERS_URL]) {
      try {
        const file = await fetchJson<MemberFile>(url);
        if (file.schema === 1 && file.members && typeof file.members === "object") return file;
      } catch {
        // try the other copy
      }
    }
    return null;
  })();
  return memberFile.then((file) => file?.members[id] ?? null);
}

let committeeFile: Promise<CommitteeFile> | undefined;

/** Committee rosters and meetings, loaded the first time a committee is opened. */
export function loadCommittees(): Promise<CommitteeFile> {
  if (provider) return Promise.reject(new Error("this world has no committees"));
  committeeFile ??= fromEither<CommitteeFile>(archived ? "committees.json.gz" : "committees.json").then((result) => result.data);
  return committeeFile;
}

const searchIndexes = new Map<number | null, Promise<SearchIndex>>();

/** Every bill of one Congress (null for the current one). Kept once loaded, whichever Congress is on show. */
export function loadSearchOf(congress: number | null): Promise<SearchIndex> {
  if (provider) return provider.search(congress);
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
  if (provider) return provider.line();
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
