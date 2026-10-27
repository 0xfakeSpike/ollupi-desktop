// The palettes theme.css defines. Each id is a [data-palette] block there;
// plum is also :root's, so it shows when none is set.
export const palettes = ['plum', 'paper', 'mist', 'indigo', 'bronze', 'teal'] as const
export type Palette = (typeof palettes)[number]
export const defaultPalette: Palette = 'plum'
