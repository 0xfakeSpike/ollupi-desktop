// The palettes theme.css defines. Each id is a [data-palette] block there;
// indigo is also :root's, so it shows when none is set.
export const palettes = ['indigo', 'paper'] as const
export type Palette = (typeof palettes)[number]
export const defaultPalette: Palette = 'indigo'
