# The little wolf: one source for every mark and icon. Coordinates are in a
# 100x100 box, the wolf sitting in profile facing right.
BODY = ('M30 95 C18 95 13 83 19 73 C23 65 31 59 39 55 C43 47 45 39 46 31 '
        'L44.5 7 C44.5 4.5 47.5 4 48.5 6.5 L54.5 19.5 L58 5.5 C58.5 3 61.5 3 62 5.5 L63.5 22 '
        'C68 23.5 71.5 26 74 29 L86 34.5 C89 35.8 88.6 40 85.5 40.2 L74 41.5 '
        'C70.5 44 68.5 48 67.5 54 C66.5 62 68 72 69 82 L70 92 C70.2 94 69 95.3 67 95.3 '
        'L63.5 95.3 C61.5 95.3 61 93.8 61 92.5 L60 82 L58.5 92.5 C58.3 94.3 57 95.3 55 95.3 L50 95.3 Z')
# Along the top of the back, nape to tail base: an area clipped to the body,
# so its outer edge is the back's own edge.
SADDLE = ('M8 92 L8 40 L30 40 L46.8 33 C48.4 44 44.5 52.5 37 59.5 '
          'C30 65.5 24.5 72 21.8 82 Z')
# Pale inner ears and a pale throat, as a black-backed jackal has; the throat
# is clipped to the body too.
EARS = 'M47.4 11.5 L51.4 19.8 L48.6 20.4 Z M59.9 10.2 L61 20.4 L58.6 19.4 Z'
THROAT = ('M92 44 L72.5 44.5 C69.2 47.5 66.8 51.5 65.7 56.5 '
          'C64.8 61.5 65.6 68 69.2 76 L92 76 Z')
TAIL = ('M21 80 C8 84 8 99 24 99.5 C36 100 46 99 54 96.8 C57 96 57 92.5 54 92.5 '
        'C44 94 34 94 27 90 C23.5 88 22 84.5 21 80 Z')
TIP = 'M45 94.6 C49 94.4 51.5 93.8 54 92.5 C57 92.5 57 96 54 96.8 C51 97.6 48 98.2 45 98.5 C43.5 97 43.5 95.6 45 94.6 Z'
EYE = (70.5, 31, 2.3)

NIGHT = '#2b2541'   # the night: the icon's ground
MOON = '#efe6d2'    # the moon, and the pale of ears and throat
TAN = '#c89a69'     # the coat
SADDLE_C = '#3b3350'  # the saddle and tail tip: the night's colour, one step lighter
PALE = '#ead2ab'      # inner ears and throat: the coat, lighter (not the moon, or it reads as a hole)

def color_figure(edge=NIGHT):
    """The wolf in colour; edge is what shows between tail and body."""
    return (f'<clipPath id="ollupi-body"><path d="{BODY}"/></clipPath>'
            f'<path d="{BODY}" fill="{TAN}"/>'
            f'<g clip-path="url(#ollupi-body)"><path d="{THROAT}" fill="{PALE}"/>'
            f'<path d="{SADDLE}" fill="{SADDLE_C}"/></g>'
            f'<path d="{EARS}" fill="{PALE}"/>'
            f'<path d="{TAIL}" fill="{TAN}" stroke="{edge}" stroke-width="1.6" paint-order="stroke"/>'
            f'<path d="{TIP}" fill="{SADDLE_C}"/>'
            f'<circle cx="{EYE[0]}" cy="{EYE[1]}" r="{EYE[2]}" fill="{NIGHT}"/>')

def mono_figure(fill, ground):
    """One colour, for small sizes and beside the wordmark."""
    return (f'<path d="{BODY}" fill="{fill}"/>'
            f'<path d="{TAIL}" fill="{fill}" stroke="{ground}" stroke-width="2" paint-order="stroke"/>'
            f'<circle cx="{EYE[0]}" cy="{EYE[1]}" r="{EYE[2]}" fill="{ground}"/>')

def emblem(size=100):
    """The night disc with the moon and the wolf: avatars, README, the about page."""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="{size}" height="{size}">'
            f'<circle cx="50" cy="50" r="50" fill="{NIGHT}"/><circle cx="54" cy="44" r="31" fill="{MOON}"/>'
            f'<g transform="translate(14 12) scale(.8)">{color_figure()}</g></svg>')

def app_icon():
    """macOS icon: 1024 canvas, an 824 rounded square inset 100, as Apple's grid has it."""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">'
            '<defs><filter id="s" x="-10%" y="-10%" width="120%" height="125%">'
            '<feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".28"/></filter></defs>'
            f'<rect x="100" y="100" width="824" height="824" rx="185" fill="{NIGHT}" filter="url(#s)"/>'
            f'<g transform="translate(100 100) scale(8.24)"><circle cx="54" cy="44" r="31" fill="{MOON}"/>'
            f'<g transform="translate(14 12) scale(.8)">{color_figure()}</g></g></svg>')
