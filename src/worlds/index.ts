import { california } from "./california";
import { capitol } from "./capitol";
import { chamber, chamberWayOut, placeInAddress } from "./chamber";
import { court } from "./court";
import type { WorldDef, WorldKey } from "./types";
import { whitehouse } from "./whitehouse";

export const WORLDS: Record<WorldKey, WorldDef> = { capitol, whitehouse, court, california, chamber };
export { chamberWayOut, placeInAddress };

/** Whether the address asks for the map of the United States (`?world=usa`) rather than a world. */
export function atlasInAddress(): boolean {
  return new URLSearchParams(location.search).get("world") === "usa";
}

/** The world the address asks for with `?world=whitehouse`, `?world=court` or `?world=california`; the Capitol otherwise. */
export function worldInAddress(): WorldDef {
  const asked = new URLSearchParams(location.search).get("world");
  if (asked === "chamber" && !placeInAddress()) return capitol; // a chamber is some place's, and the address has to say whose
  return asked && asked in WORLDS ? WORLDS[asked as WorldKey] : capitol;
}
