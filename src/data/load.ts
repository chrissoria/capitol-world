import type { CommitteeFile } from "./meetings";
import type { CongressList, SearchIndex, World } from "./types";

const ROOT = "https://huggingface.co/datasets/chrissoria/federal-bills-active/resolve/main/world/";
const BUNDLED = `${import.meta.env.BASE_URL}fixtures/`;

/** A finished Congress asked for with `?congress=118`, or null for the current one. */
export const archived: number | null = (() => {
  const asked = Number(new URLSearchParams(location.search).get("congress"));
  return Number.isInteger(asked) && asked > 0 ? asked : null;
})();
// A finished Congress is built once and kept in its own folder; it has no bundled copy.
const REMOTE = archived ? `${ROOT}archive/${archived}/` : ROOT;

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
  if (archived) return { data: await fetchJson<T>(REMOTE + file), source: "live" };
  const order: DataSource[] = preferred() === "live" ? ["live", "bundled"] : ["bundled", "live"];
  let lastError: unknown;
  for (const source of order) {
    try {
      return { data: await fetchJson<T>((source === "live" ? REMOTE : BUNDLED) + file), source };
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

let searchIndex: Promise<SearchIndex> | undefined;

/** Every bill, loaded the first time the search box is used. */
export function loadSearch(): Promise<SearchIndex> {
  searchIndex ??= fromEither<SearchIndex>("search.json.gz").then((result) => result.data);
  return searchIndex;
}
