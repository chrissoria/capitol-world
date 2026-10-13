import type { CommitteeFile } from "./meetings";
import type { CongressList, MemberFacts, MemberFile, SearchIndex, World } from "./types";

const BUNDLED = `${import.meta.env.BASE_URL}fixtures/`;

/**
 * Where a legislature's map files are. Congress's are the default; a state's have the same shapes
 * (build_california_snapshot.py), so the loaders below read either.
 */
export interface Source {
  /** The folder holding the files of the period in progress, with `archive/<period>/` for finished ones. */
  root: string;
  /** The file in that folder listing the finished periods. */
  list: string;
  /** Whether the period in progress is kept gzipped, as finished ones always are. */
  gzipped: boolean;
  /** Whether a copy of the period in progress ships with the app, for development and as a fallback. */
  bundled: boolean;
  /** Who each member is and when they served; null where there is no such file. */
  members: string | null;
  /** Whether the period in progress has longer summaries in `text/`, as finished ones do. */
  currentText: boolean;
  /** The periods that can be opened, the one in progress first, where they are not numbered as Congresses are. */
  line?(): Promise<CongressEntry[]>;
}

const CONGRESS: Source = {
  root: "https://huggingface.co/datasets/chrissoria/federal-bills-active/resolve/main/world/",
  list: "congresses.json",
  gzipped: false,
  bundled: true,
  // The app's file in the congress-members dataset (build_congress_members.py).
  members: "https://huggingface.co/datasets/chrissoria/congress-members/resolve/main/world/members.json",
  currentText: false,
};
let source = CONGRESS;

/** The finished Congress the address asks for with `?congress=118`, or null for the current one. */
export function congressInAddress(): number | null {
  const query = new URLSearchParams(location.search);
  const raw = query.get("congress") ?? query.get("term") ?? query.get("session");
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
  /** Rosters and meetings, for a world that has rooms to hold them in. */
  committees?(): Promise<CommitteeFile>;
}

let provider: DataProvider | null = null;

/** Read from another world's data (null for the Capitol's own files). */
export function useProvider(next: DataProvider | null) {
  provider = next;
  committeeFile = undefined;
}

/** Read another legislature's files (nothing for Congress's). What was loaded from the last one is forgotten. */
export function useSource(next?: Source) {
  if ((next ?? CONGRESS) === source) return;
  source = next ?? CONGRESS;
  committeeFile = undefined;
  memberFile = undefined;
  congressLine = undefined;
  searchIndexes.clear();
  textFiles.clear();
}

// A finished Congress is built once and kept in its own folder; it has no bundled copy.
const remote = () => (archived ? `${source.root}archive/${archived}/` : source.root);

export type DataSource = "live" | "bundled";

/** `?data=live` or `?data=bundled` overrides the default (bundled in dev, live in production). */
function preferred(): DataSource {
  if (!source.bundled) return "live";
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
  const order: DataSource[] = !source.bundled ? ["live"] : preferred() === "live" ? ["live", "bundled"] : ["bundled", "live"];
  let lastError: unknown;
  for (const from of order) {
    try {
      return { data: await fetchJson<T>((from === "live" ? source.root : BUNDLED) + file), source: from };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** One of a legislature's files from where they are kept, or from the copy that ships with the app, whichever comes. */
async function fileFrom<T>(from: Source, file: string): Promise<T> {
  const asked = new URLSearchParams(location.search).get("data");
  const bundledFirst = from.bundled && (asked === "bundled" || (asked !== "live" && import.meta.env.DEV));
  const folders = !from.bundled ? [from.root] : bundledFirst ? [BUNDLED, from.root] : [from.root, BUNDLED];
  let lastError: unknown;
  for (const folder of folders) {
    try {
      return await fetchJson<T>(folder + file);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * A legislature's map file for the period in progress, read whichever world the page is on: the book on the map of
 * the United States reads several without going into any of them. Congress's when no source is named.
 */
export async function loadWorldFrom(from: Source = CONGRESS): Promise<World> {
  const data = await fileFrom<World>(from, from.gzipped ? "world.json.gz" : "world.json");
  if (data.schema !== 1 || !Array.isArray(data.bills) || !Array.isArray(data.members)) throw new Error("world.json is not in the expected format");
  return data;
}

/** Every item of a legislature's period in progress, read the same way. */
export function loadSearchFrom(from: Source = CONGRESS): Promise<SearchIndex> {
  return fileFrom<SearchIndex>(from, "search.json.gz");
}

export async function loadWorld(): Promise<{ world: World; source: DataSource }> {
  if (provider) return { world: await provider.world(archived), source: "live" };
  const { data, source: from } = await fromEither<World>(archived || source.gzipped ? "world.json.gz" : "world.json");
  if (data.schema !== 1 || !Array.isArray(data.bills) || !Array.isArray(data.members)) {
    throw new Error("world.json is not in the expected format");
  }
  return { world: data, source: from };
}

/** The finished Congresses that can be opened, newest first. Empty if the list cannot be read. */
export function loadCongresses(): Promise<CongressList["archive"]> {
  return fetchJson<CongressList>(source.root + source.list).then((list) => list.archive ?? [], () => []);
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
  if (!/^\d+$/.test(number ?? "") || (archived ? Number(congress) !== archived : !source.currentText)) return Promise.resolve(null);
  const url = `${remote()}text/${Number(number) % TEXT_FILES}.json.gz`;
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
  const members = source.members;
  if (provider || !members) return Promise.resolve(null);
  memberFile ??= (async () => {
    const bundled = `${BUNDLED}members.json`;
    for (const url of preferred() === "live" ? [members, bundled] : [bundled, members]) {
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
  if (provider) return provider.committees ? (committeeFile ??= provider.committees()) : Promise.reject(new Error("this world has no committees"));
  committeeFile ??= fromEither<CommitteeFile>(archived || source.gzipped ? "committees.json.gz" : "committees.json").then((result) => result.data);
  return committeeFile;
}

const searchIndexes = new Map<number | null, Promise<SearchIndex>>();

/** Every bill of one Congress (null for the current one). Kept once loaded, whichever Congress is on show. */
export function loadSearchOf(congress: number | null): Promise<SearchIndex> {
  if (provider) return provider.search(congress);
  let index = searchIndexes.get(congress);
  if (!index) {
    index = congress
      ? fetchJson<SearchIndex>(`${source.root}archive/${congress}/search.json.gz`)
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
  /** Whether this is the period in progress, whose files are the ones kept current. */
  live: boolean;
  /** Set for a period in progress whose work is over: a session after the Governor's last day to sign. */
  ended?: boolean;
}

let congressLine: Promise<CongressEntry[]> | undefined;

/** Every Congress that can be opened, the current one first. Empty if the list cannot be read. */
export function loadCongressLine(): Promise<CongressEntry[]> {
  if (provider) return provider.line();
  if (source.line) return (congressLine ??= source.line().catch(() => []));
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
