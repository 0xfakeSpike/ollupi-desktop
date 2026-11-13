"""The little wolf in poses, one colour, for the app's quiet moments (empty
states, first use). Every pose is built from the same head (figure.py's), so
it is the same animal throughout. 100x100 boxes; the wolf faces right."""
from figure import BODY, TAIL

# The head alone: ears, skull and muzzle, closed under the jaw.
HEAD = ('M46 31 L44.5 7 C44.5 4.5 47.5 4 48.5 6.5 L54.5 19.5 L58 5.5 C58.5 3 61.5 3 62 5.5 L63.5 22 '
        'C68 23.5 71.5 26 74 29 L86 34.5 C89 35.8 88.6 40 85.5 40.2 L74 41.5 '
        'C70 44 65 45.5 59 45.5 C51 45.5 46 40 46 31 Z')
# Where the head pivots (the back of the skull, over the neck).
NAPE = (54, 36)


def head(dx, dy, angle=0, scale=1.0, eye='open'):
    """The head moved so its nape sits at (dx, dy), turned about the nape."""
    cx, cy = NAPE
    t = f'translate({dx} {dy}) rotate({angle}) scale({scale}) translate({-cx} {-cy})'
    eyes = {'open': '<circle cx="70.5" cy="31" r="2.3" fill="var(--cut)"/>',
            'shut': '<path d="M67.5 31.5 Q70.5 34 73.5 31.5" fill="none" stroke="var(--cut)" stroke-width="1.8" stroke-linecap="round"/>'}[eye]
    return f'<g transform="{t}"><path d="{HEAD}"/>{eyes}</g>'


def leg(x1, y1, x2, y2, w=6.4):
    return f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="currentColor" stroke-width="{w}" stroke-linecap="round"/>'


def svg(inner):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" style="--cut:var(--wolf-cut, #fff)">{inner}</svg>'


POSES = {
    # Sitting, looking ahead: waiting for you, keeping watch.
    'sit': f'<path d="{BODY}"/><path d="{TAIL}" stroke="var(--cut)" stroke-width="2" paint-order="stroke"/><circle cx="70.5" cy="31" r="2.3" fill="var(--cut)"/>',
    # Sitting, head raised and ears up: listening, getting to know you.
    'listen': (
        '<path d="M30 95 C18 95 13 83 19 73 C23 65 31 59 39 55 C43 49 46 44 49 41 L62 44 '
        'C66 50 67.5 56 67.5 62 C67.5 70 68.5 79 69 86 L70 92 C70.2 94 69 95.3 67 95.3 L63.5 95.3 '
        'C61.5 95.3 61 93.8 61 92.5 L60 82 L58.5 92.5 C58.3 94.3 57 95.3 55 95.3 L50 95.3 Z"/>'
        + f'<path d="{TAIL}" stroke="var(--cut)" stroke-width="2" paint-order="stroke"/>'
        + head(56, 42, angle=-16)),
    # Standing, head down to the ground: sniffing something out.
    'sniff': (
        '<path d="M17 52 C17 44 25 40 35 40 L55 40 C65 40 72.5 44.5 73.5 52 C74.5 60 68 66 58.5 66.5 C54 66.7 50 65.6 46 65.6 C40 65.6 35 66.8 30 66.8 C22.5 66.8 17 60.5 17 52 Z"/>'
        + leg(25, 61, 22, 89, 8) + leg(34, 62, 37, 90, 8) + leg(58, 61, 56, 90, 8) + leg(66, 59, 71, 88, 8)
        + '<path d="M18.5 47.5 C9 48 3.5 57 5.5 67 C6.5 72 10.5 72.5 12 68.5 C12.5 61.5 14.5 56.5 20 55 Z" stroke="var(--cut)" stroke-width="1.6" paint-order="stroke"/>'
        + head(71, 51, angle=30, scale=.8)),
    # Trotting along, tail out: on its way.
    'trot': (
        '<path d="M17 52 C17 44 25 40 35 40 L55 40 C65 40 72.5 44.5 73.5 52 C74.5 60 68 66 58.5 66.5 C54 66.7 50 65.6 46 65.6 C40 65.6 35 66.8 30 66.8 C22.5 66.8 17 60.5 17 52 Z"/>'
        + leg(25, 60, 17, 88, 8) + leg(34, 62, 39, 91, 8) + leg(59, 60, 55, 90, 8) + leg(66, 57, 77, 85, 8)
        + '<path d="M18.5 47.5 C9 48 3.5 57 5.5 67 C6.5 72 10.5 72.5 12 68.5 C12.5 61.5 14.5 56.5 20 55 Z" stroke="var(--cut)" stroke-width="1.6" paint-order="stroke"/>'
        + head(67, 42, angle=-4, scale=.82)),
    # Lying down, head up, paws forward: resting, nothing to do yet.
    'rest': (
        '<path d="M10 88 C6 80 10 70 22 67 C34 64 48 63 58 63 C66 63 70 67 71 72 L72 80 L94 82 '
        'C98 82.5 98 89 94 89.5 L60 90 L22 90 C16 90 12 90 10 88 Z"/>'
        + '<path d="M14 72 C4 72 0 82 4 89 C6 92 10 92 12 90 C10 84 11 78 16 76 Z" stroke="var(--cut)" stroke-width="1.6" paint-order="stroke"/>'
        + head(66, 62, angle=-6, scale=.8)),
    # Curled up asleep, the tail wrapped round over the nose: all quiet.
    'sleep': (
        '<path d="M44 93 C25 93 13 84 13 71 C13 57 27 49 45 49 C61 49 74 55 78 66 L80 80 C78 89 64 93 44 93 Z"/>'
        + head(66, 64, angle=18, scale=.74, eye='shut')
        + '<path d="M16 80 C20 93 42 98 62 96 C76 95 88 90 92 82 C93.5 79 91 76.5 88 78 C82 83 70 86 56 86 C40 86 26 84 16 80 Z" stroke="var(--cut)" stroke-width="1.8" paint-order="stroke"/>'
        + '<path d="M84 79.5 C87 77.5 90 76.5 91.5 78 C93 80 92 83 89 85 C87 83 85.5 81.5 84 79.5 Z" fill="var(--cut)" fill-opacity=".35"/>'),
}


def pose_svg(name):
    return svg(POSES[name])
