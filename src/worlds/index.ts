import { california } from "./california";
import { capitol } from "./capitol";
import { chamber, chamberWayOut, placeInAddress } from "./chamber";
import { court } from "./court";
import type { WorldDef, WorldKey } from "./types";
import { whitehouse } from "./whitehouse";

export const WORLDS: Record<WorldKey, WorldDef> = { capitol, whitehouse, court, california, chamber };
export { chamberWayOut, placeInAddress };

/**
 * Whether the address asks for the map of the United States rather than a world. The map is where a visitor lands: an
 * address that names no world is the map's, and so is `?world=usa`. One exception keeps old links alive: an address
 * that names no world and points at a bill, a member, a building or a past Congress was made when the Capitol was the
 * way in, and is still the Capitol's.
 */
export function atlasInAddress(): boolean {
  const query = new URLSearchParams(location.search);
  const asked = query.get("world");
  if (asked) return asked === "usa";
  return !query.has("congress") && !/^#(bill|member|site)=/.test(location.hash);
}

/** The world the address asks for with `?world=capitol`, `?world=whitehouse`, `?world=court` or `?world=california`; the Capitol otherwise. */
export function worldInAddress(): WorldDef {
  const asked = new URLSearchParams(location.search).get("world");
  if (asked === "chamber" && !placeInAddress()) return capitol; // a chamber is some place's, and the address has to say whose
  return asked && asked in WORLDS ? WORLDS[asked as WorldKey] : capitol;
}
