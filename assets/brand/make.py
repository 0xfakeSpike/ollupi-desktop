"""Ollupi's marks, generated from one drawing (figure.py) and the Manrope
outlines. Writes every file in this folder; the engine repo's docs/logo and
the docs site's public/logo take the same files.

    python3 -m venv .venv && .venv/bin/pip install fonttools brotli
    .venv/bin/python assets/logo/make.py <path to manrope-latin-wght-normal.woff2>
"""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from figure import GROUND, color_figure, emblem_body, ground, mono_figure, moon
from poses import POSES, pose_svg

HERE = os.path.dirname(os.path.abspath(__file__))
INK = '#22252a'      # the wordmark on light grounds (theme fg)
PAPER = '#ecedea'    # the wordmark on dark grounds (theme dark fg)
WEIGHT, TRACKING = 750, -0.03  # tracking in em
SMALL_COAT = '#a8733f'  # the coat at 64px and under, one colour, deeper than TAN


def wordmark_path(font_file, text='ollupi'):
    """The word's outlines in a box whose height is the font's cap-to-descender
    span, returned with its width; y grows down, baseline at `base`."""
    font = instantiateVariableFont(TTFont(font_file), {'wght': WEIGHT})
    upm = font['head'].unitsPerEm
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    asc, desc = font['hhea'].ascent, font['hhea'].descent
    wordmark_path.x_height = font['OS/2'].sxHeight
    wordmark_path.ascent = asc
    pen = SVGPathPen(glyphs)
    x = 0
    for ch in text:
        name = cmap[ord(ch)]
        # Flip y: font units grow up, SVG grows down; baseline at asc.
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, asc)))
        x += glyphs[name].width + TRACKING * upm
    x -= TRACKING * upm
    return pen.getCommands(), x, asc - desc, upm


def svg(w, h, body, view=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view or f"0 0 {w} {h}"}" width="{w}" height="{h}">{body}</svg>\n'


def app_icon(small=False):
    # macOS grid: a 1024 canvas, the 824 rounded square inset 100, its oat
    # ground lit from above. Small sizes drop the shadow and draw the wolf
    # larger, in one colour, a deeper coat so it holds against the ground.
    shadow = '' if small else ('<filter id="s" x="-10%" y="-10%" width="120%" height="125%">'
                               '<feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".28"/></filter>')
    figure = (f'<g transform="translate(8 6) scale(.9)">{mono_figure(SMALL_COAT, GROUND)}</g>' if small
              else f'<g transform="translate(14 12) scale(.8)">{color_figure()}</g>')
    filt = '' if small else ' filter="url(#s)"'
    return svg(1024, 1024, f'<defs>{ground("g")}{shadow}</defs>'
               f'<rect x="100" y="100" width="824" height="824" rx="185" fill="url(#g)"{filt}/>'
               f'<g transform="translate(100 100) scale(8.24)">{moon()}{figure}</g>')


def main(font_file):
    d, width, height, upm = wordmark_path(font_file)
    files = {
        'mark.svg': svg(100, 100, emblem_body()),
        'favicon.svg': svg(32, 32, emblem_body(), '0 0 100 100'),
        'mark-mono.svg': svg(100, 100, mono_figure(INK, '#fff').replace('fill="#fff"', 'fill="#fff" fill-opacity="0"').replace('stroke="#fff"', 'stroke="#fff" stroke-opacity="0"')),
        'app-icon.svg': app_icon(),
        'app-icon-small.svg': app_icon(small=True),
        'app-icon-16.svg': app_icon(small=True).replace('width="1024" height="1024"', 'width="16" height="16"'),
    }
    for name, fill in (('wordmark.svg', INK), ('wordmark-dark.svg', PAPER)):
        files[name] = svg(round(width / upm * 100), round(height / upm * 100), f'<path d="{d}" fill="{fill}"/>', f'0 0 {width:.0f} {height:.0f}')
    # The logo: the emblem, then the word a little smaller than it, the word's
    # x-height centred on the emblem's centre line.
    scale = 46 / upm   # one em of the word is 46 units beside a 100-unit emblem
    word_w = width * scale
    top = 50 - (wordmark_path.ascent - wordmark_path.x_height / 2) * scale
    for name, fill in (('logo.svg', INK), ('logo-dark.svg', PAPER)):
        w = 100 + 20 + word_w
        files[name] = svg(round(w * 2.4), 240, f'{emblem_body()}<g transform="translate(120 {top:.2f}) scale({scale:.5f})"><path d="{d}" fill="{fill}"/></g>', f'0 0 {w:.1f} 100')
    # The poses, one colour, for the app's quiet moments; each file takes the
    # colour of its context and cuts out in white.
    os.makedirs(os.path.join(HERE, 'poses'), exist_ok=True)
    for pose in POSES:
        files[f'poses/wolf-{pose}.svg'] = pose_svg(pose) + '\n'
    for name, body in files.items():
        open(os.path.join(HERE, name), 'w').write(body)
    # The app's copy: the poses and the emblem as markup, read by the Wolf
    # component. Generated: change the drawing here, not there.
    app = os.path.join(HERE, '..', '..', 'apps', 'desktop', 'src', 'renderer', 'src', 'views', 'common', 'wolfArt.ts')
    lines = ['// Generated by assets/logo/make.py from figure.py and poses.py; do not edit.',
             '// Inner SVG markup in a 0 0 100 100 box: poses fill with currentColor and',
             '// cut out with var(--cut); the emblem carries its own colours.', '',
             'export const POSES = {']
    lines += [f'  {k}: {v!r},'.replace("'", '`', 1)[::-1].replace("'", '`', 1)[::-1] for k, v in POSES.items()]
    lines += ['} as const', '', f'export const EMBLEM = `{emblem_body()}`', '']
    open(app, 'w').write('\n'.join(lines))
    print('wrote', ', '.join(sorted(files)))


if __name__ == '__main__':
    main(sys.argv[1])
