/** "0xAARRGGBB" -> "#RRGGBB" */
export const css = (argb: string) => "#" + argb.slice(4);
/** "#rrggbb" -> "0xFFRRGGBB" */
export const argb = (hex: string) => "0xFF" + hex.slice(1).toUpperCase();
