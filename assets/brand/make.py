"""Ollupi's brand, all of it in this folder and generated from one drawing
(figure.py, poses.py) and the Manrope outlines: the marks and wordmark as SVG,
the poses, the PNGs at every size, the macOS icon (Ollupi.icns, which the app
is packaged with), the overview (preview.png), and the app's own copy of the
poses and emblem (views/common/wolfArt.ts). The engine's README and figures and
the docs site take their marks from here.

    python3 -m venv .venv && .venv/bin/pip install fonttools brotli
    .venv/bin/python assets/brand/make.py <path to manrope-latin-wght-normal.woff2>

The PNGs, the icon and the overview are drawn by Google Chrome (headless) and
packed by iconutil; set CHROME when Chrome is not in /Applications.
"""
import os, shutil, subprocess, sys, tempfile
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from figure import GROUND, GROUND_TOP, MOON, MOON_EDGE, TAN, SADDLE_C, color_figure, emblem_body, ground, mono_figure, moon
from poses import POSES, pose_svg

HERE = os.path.dirname(os.path.abspath(__file__))
INK = '#22252a'      # the wordmark on light grounds (theme fg)
PAPER = '#ecedea'    # the wordmark on dark grounds (theme dark fg)
WEIGHT, TRACKING = 750, -0.03  # tracking in em
SMALL_COAT = '#a8733f'  # the coat at 64px and under, one colour, deeper than TAN
CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')


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
    lines = ['// Generated by assets/brand/make.py from figure.py and poses.py; do not edit.',
             '// Inner SVG markup in a 0 0 100 100 box: poses fill with currentColor and',
             '// cut out with var(--cut); the emblem carries its own colours.', '',
             'export const POSES = {']
    lines += [f'  {k}: {v!r},'.replace("'", '`', 1)[::-1].replace("'", '`', 1)[::-1] for k, v in POSES.items()]
    lines += ['} as const', '', f'export const EMBLEM = `{emblem_body()}`', '']
    open(app, 'w').write('\n'.join(lines))
    print('wrote', ', '.join(sorted(files)))
    render(font_file)


def shoot(html, w, h, out, scale=1, clear=True):
    """A page drawn by headless Chrome into a PNG of w x h at scale."""
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, 'page.html')
        open(page, 'w').write(html)
        args = [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
                f'--force-device-scale-factor={scale}', f'--window-size={w},{h}', f'--screenshot={out}']
        if clear:
            args.append('--default-background-color=00000000')
        subprocess.run(args + ['file://' + page], check=True, capture_output=True)


def picture(name, w, h):
    return (f'<!doctype html><body style="margin:0;background:transparent">'
            f'<img src="file://{os.path.join(HERE, name)}" width="{w}" height="{h}" style="display:block"></body>')


def render(font_file):
    png = os.path.join(HERE, 'png')
    os.makedirs(png, exist_ok=True)
    # 64px and under take the small icon: the wolf larger, in one colour.
    for px in (16, 32, 64, 128, 256, 512, 1024):
        shoot(picture('app-icon-small.svg' if px <= 64 else 'app-icon.svg', px, px), px, px, f'{png}/app-icon-{px}.png')
    for px in (16, 32):
        shoot(picture('favicon.svg', px, px), px, px, f'{png}/favicon-{px}.png')
    shoot(picture('mark.svg', 1024, 1024), 1024, 1024, f'{png}/mark-1024.png')
    for name in ('logo', 'logo-dark'):
        shoot(picture(f'{name}.svg', 1864, 780), 1864, 780, f'{png}/{name}.png')
    # The macOS icon, from the same PNGs: each size and its @2x.
    with tempfile.TemporaryDirectory() as tmp:
        iconset = os.path.join(tmp, 'Ollupi.iconset')
        os.mkdir(iconset)
        for size in (16, 32, 128, 256, 512):
            shutil.copy(f'{png}/app-icon-{size}.png', f'{iconset}/icon_{size}x{size}.png')
            shutil.copy(f'{png}/app-icon-{size * 2}.png', f'{iconset}/icon_{size}x{size}@2x.png')
        subprocess.run(['iconutil', '-c', 'icns', iconset, '-o', os.path.join(HERE, 'Ollupi.icns')], check=True)
    shoot(overview(font_file), 1600, 900, os.path.join(HERE, 'preview.png'), scale=2, clear=False)
    print('drew png/, Ollupi.icns, preview.png')


def overview(font_file):
    """The brand on one page: the icon with the tagline and the name's meaning,
    the logo on light and dark, every size, and the colours."""
    at = lambda name: 'file://' + os.path.join(HERE, name)
    swatches = [('燕麦', GROUND, f'linear-gradient({GROUND_TOP},{GROUND})', INK), ('月', MOON, MOON, INK), ('毛色', TAN, TAN, '#fff'),
                ('鞍', SADDLE_C, SADDLE_C, '#fff'), ('苔', '#263b30', '#263b30', '#fff'), ('石', '#eeede8', '#eeede8', INK)]
    sw = ''.join(f'<div style="background:{bg};color:{fg};box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)">{n} {v}</div>' for n, v, bg, fg in swatches)
    return f'''<!doctype html><meta charset="utf-8"><style>
@font-face{{font-family:Manrope;src:url(file://{os.path.abspath(font_file)});font-weight:200 800}}
*{{box-sizing:border-box}}body{{margin:0;width:1600px;height:900px;background:#eeede8;font-family:Manrope,"PingFang SC",sans-serif;display:grid;grid-template-columns:800px 1fr;gap:16px;padding:16px}}
.hero{{border-radius:28px;background:linear-gradient({GROUND_TOP},{GROUND});color:{INK};padding:44px;display:flex;flex-direction:column;justify-content:space-between}}
.hero .name{{font-size:16px;color:#5e626a}}.hero .mid{{display:flex;align-items:center;gap:56px;margin-left:24px}}.hero .mid img{{width:300px}}
.tag{{font-size:50px;font-weight:750;line-height:1.12;letter-spacing:-.01em}}.tag small{{display:block;font-size:22px;font-weight:600;color:#5e626a;margin-top:12px;letter-spacing:0}}
.meaning{{font-size:15px;line-height:1.75;color:#3d4148}}
.right{{display:grid;grid-template-rows:200px 1fr 130px;gap:16px}}.row{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}
.card{{border-radius:28px;background:#f8f7f4;display:flex;align-items:center;justify-content:center;gap:28px}}.card.dark{{background:#1d201f}}
.card img.logo{{height:120px}}.sizes{{flex-direction:column;gap:18px}}.sizes .line{{display:flex;align-items:center;gap:30px}}.sizes span{{font-size:13px;color:#5e626a}}
.sw{{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:20px;border-radius:28px;background:#f8f7f4}}.sw div{{border-radius:16px;display:flex;align-items:end;padding:10px 12px;font-size:12px;font-weight:700}}
</style>
<div class="hero"><div class="name">Ollupi</div><div class="mid"><img src="{at('app-icon.svg')}"><div class="tag">交给它，<br>你走开。<small>Hand it over. Walk away.</small></div></div>
<div class="meaning">名字里的 lupi，是意大利语的"狼"。狼在夜里也醒着，记得同伴，守着自己的地方。<br>Ollupi 也是这样：你走开，它还在干活；它记得你；碰你的东西之前，先问你。</div></div>
<div class="right"><div class="row"><div class="card"><img class="logo" src="{at('logo.svg')}"></div><div class="card dark"><img class="logo" src="{at('logo-dark.svg')}"></div></div>
<div class="card sizes"><div class="line"><img src="{at('app-icon.svg')}" width="104"><img src="{at('app-icon-small.svg')}" width="52"><img src="{at('app-icon-16.svg')}" width="20"><img src="{at('mark.svg')}" width="88"><img src="{at('mark-mono.svg')}" width="80"></div><span>图标 · 小尺寸 · 圆形标识 · 单色</span></div>
<div class="sw">{sw}</div></div>'''


if __name__ == '__main__':
    main(sys.argv[1])
