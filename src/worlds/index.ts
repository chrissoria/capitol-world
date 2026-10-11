import { capitol } from "./capitol";
import type { WorldDef, WorldKey } from "./types";
import { whitehouse } from "./whitehouse";

export const WORLDS: Record<WorldKey, WorldDef> = { capitol, whitehouse };

/** The world the address asks for with `?world=whitehouse`; the Capitol otherwise. */
export function worldInAddress(): WorldDef {
  const asked = new URLSearchParams(location.search).get("world");
  return asked && asked in WORLDS ? WORLDS[asked as WorldKey] : capitol;
}
