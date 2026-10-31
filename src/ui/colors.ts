import { TIER_COLORS, type SlotConfig } from "../compiler.ts";

export const slotColor = (s: SlotConfig) => s.color || TIER_COLORS[Math.min(s.tier, TIER_COLORS.length) - 1];
/** "0xAARRGGBB" -> "#RRGGBB" */
export const css = (argb: string) => "#" + argb.slice(4);
