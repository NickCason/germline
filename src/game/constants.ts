// Logical playfield. Everything in the simulation is in these units; the
// renderer scales the field to fit the screen.
export const FIELD_W = 540;
export const FIELD_H = 960;

/** Distance between consecutive train segments along the path. */
export const SEG_LEN = 80;
/** Head center sits this far ahead of the first segment's center. */
export const HEAD_GAP = 66;
/** Body thickness: radius of each collision circle / drawn ring. */
export const SEG_RADIUS = 27;
/** Collision circles per segment, offset along the path from its center. */
export const SEG_CIRCLE_OFFSETS = [-26, 0, 26] as const;
/** How fast the front of the train is yanked back to close a gap. */
export const RETRACT_SPEED = 620;

export const FENCE_Y = 846;
export const HERO_Y = 896;
export const HERO_SPEED = 420;

export const MAX_WEAPONS = 6;
export const LOADOUT_SLOTS = 5;

/** Time step for the fixed-rate simulation. */
export const SIM_DT = 1 / 60;
