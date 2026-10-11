import { capitol } from "./capitol";
import { court } from "./court";
import type { WorldDef, WorldKey } from "./types";
import { whitehouse } from "./whitehouse";

export const WORLDS: Record<WorldKey, WorldDef> = { capitol, whitehouse, court };

/** Whether the address asks for the map of the United States (`?world=usa`) rather than a world. */
export function atlasInAddress(): boolean {
  return new URLSearchParams(location.search).get("world") === "usa";
}

/** The world the address asks for with `?world=whitehouse` or `?world=court`; the Capitol otherwise. */
export function worldInAddress(): WorldDef {
  const asked = new URLSearchParams(location.search).get("world");
  return asked && asked in WORLDS ? WORLDS[asked as WorldKey] : capitol;
}
