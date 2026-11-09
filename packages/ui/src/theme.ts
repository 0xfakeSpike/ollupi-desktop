// The palettes theme.css defines. Each id is a [data-palette] block there;
// classic is also :root's, so it shows when none is set.
export const palettes = ['classic', 'aurora', 'sunset', 'candy', 'rainbow'] as const
export type Palette = (typeof palettes)[number]
export const defaultPalette: Palette = 'classic'
