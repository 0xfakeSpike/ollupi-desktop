"""The dusk theme's drawings: the little wolf by the moon in a dusk sky, and the
savanna around it (grass, a far acacia, fireflies, a dragonfly, birds).

Drawn in the manner of the dusk theme: fine grain over everything, shapes
whose edges dissolve into grain instead of ending on a line, airbrushed light
falling from the moon, and the moon glowing against a sky deep enough to make
it bright. The wolf is the same drawing as everywhere (figure.py); only its
rendering changes.

Every id carries a prefix, so several drawings can sit in one page.
"""
from figure import TAN, color_figure

# Dusk colours: the sky from indigo through lavender and rose to peach; the
# grass takes the same ones.
SKY = ('#2f3f7a', '#7b6fb8', '#d996b4', '#f4bb98')
INDIGO, PLUM, ROSE, PEACH, LAV, DUSK = '#2c335f', '#4b3a78', '#d07a9c', '#ee9f78', '#9a83d8', '#7a4f86'
TREE = '#3a3a6e'
INK = '#2c2f5e'


def spray(id_, blur, freq, amount, seed, airbrush=1.2, grain=.35):
    """A grainy, dissolving edge: the shape's softened alpha pushed by noise and
    cut at half, the colours slightly airbrushed and speckled."""
    return f'''<filter id="{id_}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceGraphic" stdDeviation="{airbrush}" result="air"/>
<feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="soft"/>
<feTurbulence type="fractalNoise" baseFrequency="{freq}" numOctaves="2" seed="{seed}" result="noise"/>
<feColorMatrix in="noise" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="na"/>
<feComposite in="soft" in2="na" operator="arithmetic" k2="1" k3="{amount}" k4="{-amount / 2}" result="mix"/>
<feComponentTransfer in="mix" result="edge"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer>
<feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="{seed + 5}" result="g"/>
<feColorMatrix in="g" type="saturate" values="0" result="gg"/>
<feBlend in="air" in2="gg" mode="soft-light" result="tex0"/>
<feComposite in="tex0" in2="air" operator="arithmetic" k2="{grain}" k3="{1 - grain}" result="tex"/>
<feComposite in="tex" in2="edge" operator="in"/>
</filter>'''


def grain_filter(id_):
    """Fine grain over a whole drawing, lighter and darker specks alike, the
    colours kept."""
    return (f'<filter id="{id_}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
            '<feTurbulence type="fractalNoise" baseFrequency="1.05" numOctaves="3" seed="11" result="n"/>'
            '<feColorMatrix in="n" type="saturate" values="0" result="g"/>'
            '<feComponentTransfer in="g" result="gc"><feFuncR type="linear" slope="1.4" intercept="-.2"/><feFuncG type="linear" slope="1.4" intercept="-.2"/>'
            '<feFuncB type="linear" slope="1.4" intercept="-.2"/><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer>'
            '<feBlend in="SourceGraphic" in2="gc" mode="soft-light" result="b"/>'
            '<feComposite in="b" in2="SourceGraphic" operator="arithmetic" k2=".38" k3=".62" result="m"/>'
            '<feComposite in="m" in2="SourceAlpha" operator="in"/></filter>')


class Savanna:
    """The accents, with ids under one prefix."""

    BLADES_A = [(0, 150, -46, 13, INDIGO), (16, 200, -10, 14, PLUM), (32, 140, 40, 12, ROSE), (-18, 110, -64, 11, PEACH), (44, 170, 60, 12, LAV), (8, 90, 20, 11, DUSK)]
    BLADES_B = [(0, 130, 36, 12, PLUM), (-16, 170, -30, 13, ROSE), (18, 100, 56, 11, INDIGO), (-30, 90, -60, 11, LAV), (28, 150, 14, 12, PEACH)]

    def __init__(self, p, k=1.0):
        """k is the drawing's unit against the icon's: the grain and blur
        scale with it, so a small drawing dissolves as much as a large one."""
        self.p, self.k = p, k

    def defs(self):
        p, k = self.p, self.k
        return (spray(f'{p}tuft1', blur=3 * k, freq=1.7 / k, amount=2.0, seed=21, airbrush=1.2 * k, grain=.3)
                + spray(f'{p}tuft2', blur=3 * k, freq=1.7 / k, amount=2.0, seed=33, airbrush=1.2 * k, grain=.3)
                + spray(f'{p}tree', blur=2.2 * k, freq=1.8 / k, amount=1.8, seed=41, airbrush=.6 * k, grain=.2)
                + spray(f'{p}fly', blur=1.6 * k, freq=2.2 / k, amount=1.6, seed=51, airbrush=.5 * k, grain=.2)
                + f'<filter id="{p}glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{6 * k:.2f}"/></filter>'
                + f'<linearGradient id="{p}wing" x1="0" x2="1"><stop offset="0" stop-color="#a99af0"/><stop offset="1" stop-color="#f4a6b8"/></linearGradient>'
                + f'<linearGradient id="{p}wing2" x1="0" x2="1"><stop offset="0" stop-color="#f6b693"/><stop offset="1" stop-color="#9fb8f0"/></linearGradient>')

    def tuft(self, x, y, s, blades, which=1):
        """Grass: tapered blades from one root, leaning out."""
        out = []
        for dx, h, lean, w, col in blades:
            bx = x + dx * s
            tipx, tipy = bx + lean * s, y - h * s
            c1x = bx + lean * .2 * s
            out.append(f'<path d="M{bx - w * s:.1f} {y} C{c1x - w * s * .6:.1f} {y - h * s * .45:.1f} {tipx - lean * s * .15:.1f} {tipy + h * s * .25:.1f} {tipx:.1f} {tipy:.1f} '
                       f'C{tipx - lean * s * .05:.1f} {tipy + h * s * .3:.1f} {c1x + w * s * .6:.1f} {y - h * s * .4:.1f} {bx + w * s:.1f} {y} Z" fill="{col}"/>')
        return f'<g filter="url(#{self.p}tuft{which})">{"".join(out)}</g>'

    def acacia(self, x, y, s, col=TREE):
        """The umbrella thorn: a flat crown on a forked trunk, far away."""
        return (f'<g filter="url(#{self.p}tree)" transform="translate({x} {y}) scale({s})" fill="{col}">'
                '<path d="M-2 0 L-1.5 -34 L-14 -50 L-12 -51 L-0.5 -38 L1 -52 L3 -52 L1.6 -38 L13 -50 L15 -49 L2 -33 L2 0 Z"/>'
                '<path d="M-46 -52 C-40 -60 -20 -66 -2 -64 C14 -70 40 -64 48 -55 C40 -50 22 -51 4 -50 C-16 -49 -36 -47 -46 -52 Z"/></g>')

    def firefly(self, x, y, r=4):
        return (f'<circle cx="{x}" cy="{y}" r="{r * 4}" fill="#ffd27a" opacity=".7" filter="url(#{self.p}glow)"/>'
                f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fffbe8"/>')

    def dragonfly(self, x, y, s, rot=-18):
        p = self.p
        return (f'<g filter="url(#{p}fly)" transform="translate({x} {y}) rotate({rot}) scale({s})">'
                f'<ellipse cx="-11" cy="-6" rx="13" ry="4.5" transform="rotate(-18 -11 -6)" fill="url(#{p}wing)"/>'
                f'<ellipse cx="11" cy="-6" rx="13" ry="4.5" transform="rotate(18 11 -6)" fill="url(#{p}wing)"/>'
                f'<ellipse cx="-10" cy="1" rx="11" ry="4" transform="rotate(14 -10 1)" fill="url(#{p}wing2)"/>'
                f'<ellipse cx="10" cy="1" rx="11" ry="4" transform="rotate(-14 10 1)" fill="url(#{p}wing2)"/>'
                f'<path d="M-1.6 -10 L1.6 -10 L1.2 26 L-1.2 26 Z" fill="{INK}"/><circle cx="0" cy="-11" r="2.6" fill="{INK}"/></g>')

    @staticmethod
    def bird(x, y, s):
        return (f'<path transform="translate({x} {y}) scale({s})" d="M-10 0 C-6 -4 -2 -4 0 0 C2 -4 6 -4 10 0 C6 -2 2 -1 0 2 C-2 -1 -6 -2 -10 0 Z" '
                f'fill="{INK}" opacity=".8"/>')


def scene(p):
    """The wolf by the moon in a dusk sky with the savanna around it, in the
    icon's 1024 box (the square 100..924). Returns its defs and its layers."""
    sv = Savanna(p)
    defs = (f'<linearGradient id="{p}coat" x1=".85" y1=".1" x2=".15" y2=".95"><stop offset="0" stop-color="#f8c994"/><stop offset=".45" stop-color="#df9c5f"/>'
            f'<stop offset=".78" stop-color="#bf7458"/><stop offset="1" stop-color="#9b5b74"/></linearGradient>'
            f'<radialGradient id="{p}moon" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".65" stop-color="#fff7ec"/><stop offset="1" stop-color="#fbe1d6"/></radialGradient>'
            f'<linearGradient id="{p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{SKY[0]}"/><stop offset=".42" stop-color="{SKY[1]}"/>'
            f'<stop offset=".72" stop-color="{SKY[2]}"/><stop offset="1" stop-color="{SKY[3]}"/></linearGradient>'
            f'<filter id="{p}bloom" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="70"/></filter>'
            f'<filter id="{p}halo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="38"/></filter>'
            + grain_filter(f'{p}grain')
            + spray(f'{p}wolf', blur=5, freq=1.9, amount=2.1, seed=4, airbrush=1.2, grain=.3)
            + spray(f'{p}moonedge', blur=10, freq=1.4, amount=1.7, seed=9, airbrush=2, grain=.15)
            + sv.defs())
    sky = (f'<rect x="100" y="100" width="824" height="824" fill="url(#{p}sky)"/>'
           f'<circle cx="160" cy="980" r="300" fill="#f7a7c0" opacity=".55" filter="url(#{p}bloom)"/>'
           f'<circle cx="960" cy="900" r="260" fill="#ffc9a0" opacity=".6" filter="url(#{p}bloom)"/>'
           f'<circle cx="545" cy="463" r="330" fill="#ffe6cf" opacity=".75" filter="url(#{p}halo)"/>')
    back = sv.acacia(845, 872, 1.05) + sv.bird(790, 250, 1.6) + sv.bird(828, 272, 1.1)
    moon = (f'<g filter="url(#{p}moonedge)"><circle cx="545" cy="462.6" r="255.4" fill="url(#{p}moon)"/></g>'
            f'<circle cx="520" cy="430" r="150" fill="#ffffff" opacity=".55" filter="url(#{p}halo)"/>')
    fig = color_figure(edge='#e9a9a8').replace(f'fill="{TAN}"', f'fill="url(#{p}coat)"').replace('id="ollupi-body"', f'id="{p}body"').replace('url(#ollupi-body)', f'url(#{p}body)')
    wolf = f'<g filter="url(#{p}wolf)"><g transform="translate(100 100) scale(8.24) translate(14 12) scale(.8)">{fig}</g></g>'
    front = (sv.tuft(238, 914, .8, Savanna.BLADES_A, 1) + sv.tuft(772, 921, .68, Savanna.BLADES_B, 2)
             + sv.firefly(290, 610, 5) + sv.firefly(805, 720, 4.2) + sv.firefly(875, 585, 3.6) + sv.firefly(205, 735, 3.2))
    return defs, sky + back + moon + wolf + front


def app_icon():
    """The dusk app icon: the macOS 824 square inset 100, with its shadow."""
    p = 'oid-'
    defs, body = scene(p)
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><defs>'
            f'{defs}<filter id="{p}s" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".28"/></filter>'
            f'<clipPath id="{p}sq"><rect x="100" y="100" width="824" height="824" rx="185"/></clipPath></defs>'
            f'<rect x="100" y="100" width="824" height="824" rx="185" fill="{SKY[1]}" filter="url(#{p}s)"/>'
            f'<g clip-path="url(#{p}sq)"><g filter="url(#{p}grain)">{body}</g></g></svg>\n')


def emblem_body(p='oed-'):
    """The round emblem in dusk, in a 100 box: the same scene in a disc."""
    defs, body = scene(p)
    return (f'<defs>{defs}<clipPath id="{p}disc"><circle cx="512" cy="512" r="412"/></clipPath></defs>'
            f'<g transform="scale({100 / 824:.6f}) translate(-100 -100)"><g clip-path="url(#{p}disc)"><g filter="url(#{p}grain)">{body}</g></g></g>')


def horizon(p='ohz-'):
    """A small horizon for an empty page, 420 x 120: a soft ground line, two
    tufts, a far acacia, birds and fireflies."""
    sv = Savanna(p)
    body = (f'<linearGradient id="{p}line" x1="0" x2="1"><stop offset="0" stop-color="#e9b9c8" stop-opacity="0"/><stop offset=".5" stop-color="#e9b9c8" stop-opacity=".55"/>'
            f'<stop offset="1" stop-color="#e9b9c8" stop-opacity="0"/></linearGradient>')
    art = (f'<rect x="40" y="112" width="340" height="3" rx="1.5" fill="url(#{p}line)"/>'
           + sv.acacia(268, 113, .72, '#4b3f7e') + sv.bird(150, 34, 1.1) + sv.bird(170, 42, .75)
           + sv.tuft(110, 116, .36, Savanna.BLADES_A, 1) + sv.tuft(330, 116, .3, Savanna.BLADES_B, 2)
           + sv.firefly(205, 62, 2.6) + sv.firefly(360, 50, 2) + sv.firefly(70, 70, 1.8))
    return f'<defs>{sv.defs()}{body}</defs>{art}'


def dragonfly(p='odf-'):
    """One dragonfly, in a -40 -30 80 70 box."""
    sv = Savanna(p)
    return f'<defs>{sv.defs()}</defs>{sv.dragonfly(0, 0, 1)}'


def pose_grass(p='opg-'):
    """Grass and a firefly at a pose's feet, laid over the pose's 100 box: a
    tuft each side of where the wolf sits."""
    sv = Savanna(p, k=.25)
    return (f'<defs>{sv.defs()}</defs>' + sv.tuft(16, 100, .16, Savanna.BLADES_A, 1) + sv.tuft(88, 100, .12, Savanna.BLADES_B, 2)
            # Outside the pose's box, so they never land on the wolf whatever its pose.
            + sv.firefly(106, 18, 1.4) + sv.firefly(-6, 36, 1.1))
