// The flags that stand in a board's or a council's room: the country's, the state's, and the body's
// own where it has one. Each is painted small, as a banner hanging from its pole.
//
// To give a state its flag, add it to STATE_FLAGS under its postal code: every county and city of that
// state then flies it. A county's or a city's own flag goes in PLACE_FLAGS under its Census code.

import { box } from "./art";

/** Paints a banner with its top left corner at x, y. It is BANNER_W pixels wide and BANNER_H tall. */
export type Banner = (ctx: CanvasRenderingContext2D, x: number, y: number) => void;
export const BANNER_W = 8;
export const BANNER_H = 13;

const STATE_FLAGS: Record<string, Banner> = {
  // California: a white field with a red stripe along the bottom, a red star in the corner, and the bear on its grass.
  CA: (ctx, x, y) => {
    box(ctx, x, y, BANNER_W, BANNER_H, "#f4f1e8");
    box(ctx, x, y + 11, BANNER_W, 2, "#b5453c");
    box(ctx, x + 1, y + 1, 2, 2, "#b5453c");
    box(ctx, x + 1, y + 9, 6, 1, "#4f8767");
    box(ctx, x + 2, y + 5, 5, 3, "#7a4f2a");
    box(ctx, x + 6, y + 6, 1, 1, "#f4f1e8"); // under the bear's chin
    box(ctx, x + 2, y + 8, 1, 1, "#7a4f2a");
    box(ctx, x + 5, y + 8, 1, 1, "#7a4f2a");
  },
};

/** What a state flies until its own flag is drawn: a plain field with one star, which is no state's. */
const PLACEHOLDER: Banner = (ctx, x, y) => {
  box(ctx, x, y, BANNER_W, BANNER_H, "#56607a");
  box(ctx, x + 3, y + 5, 2, 2, "#f4ecd6");
};

const PLACE_FLAGS: Record<string, Banner> = {
  // San Diego County: red, white and green bands with the county's seal, gold-ringed, in the middle.
  "06073": (ctx, x, y) => {
    box(ctx, x, y, BANNER_W, 4, "#d8433b");
    box(ctx, x, y + 4, BANNER_W, 5, "#f4f1e8");
    box(ctx, x, y + 9, BANNER_W, 4, "#2f7a4a");
    box(ctx, x + 2, y + 4, 4, 5, "#e0aa3e");
    box(ctx, x + 3, y + 5, 2, 3, "#3a6fd8");
  },
};

/** The flag of a state, by postal code; the placeholder for one not drawn yet. */
export const stateBanner = (code: string): Banner => STATE_FLAGS[code] ?? PLACEHOLDER;
/** A county's or a city's own flag, by Census code; undefined where it has none, or none is drawn yet. */
export const placeBanner = (code: string): Banner | undefined => PLACE_FLAGS[code];
