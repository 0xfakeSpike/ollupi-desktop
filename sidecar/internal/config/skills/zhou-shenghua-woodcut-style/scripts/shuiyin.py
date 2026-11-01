"""水印木刻风格程序化渲染（参考北大荒/黑龙江水印版画的视觉特征）。
坐标都按最终像素给，内部 S 倍超采样。"""
import functools, glob, math, os, random, re
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# 字体：None 时自动找；要指定就设成 (字体文件, ttc 里的序号)
SERIF = None
SERIF_B = None

# 简体中文字体，按优先顺序：宋体（衬线）在前，没有再退到黑体。
# 前两种是 Linux 上常见的，Songti SC 是 macOS 自带的。
_FAMILIES = ['Noto Serif CJK SC', 'Source Han Serif SC', 'Songti SC',
             'Noto Sans CJK SC', 'Source Han Sans SC', 'Heiti SC', 'Hiragino Sans GB',
             'WenQuanYi Zen Hei', 'WenQuanYi Micro Hei']
_STYLES = {False: ['Regular', 'Book', 'Medium', 'Light', 'W3'],
           True: ['Bold', 'SemiBold', 'Black', 'Heavy', 'Medium', 'W6']}
_FONT_DIRS = ['/System/Library/Fonts', '/Library/Fonts', '~/Library/Fonts',
              '/usr/share/fonts', '/usr/local/share/fonts', '~/.local/share/fonts', '~/.fonts']
# 只打开文件名像中文字体的文件，免得把系统里所有字体都过一遍
_FONT_FILE = re.compile(r'cjk|song|hei|sourcehan|source han|hiragino sans gb|wqy|wenquanyi', re.I)


def _font_files():
    for root in _FONT_DIRS:
        for path in glob.iglob(os.path.join(os.path.expanduser(root), '**', '*'), recursive=True):
            if path.lower().endswith(('.ttc', '.ttf', '.otf')) and _FONT_FILE.search(os.path.basename(path)):
                yield path


@functools.lru_cache(None)
def _find_face(bold):
    """(字体文件, 序号)：字族排得最前、字重最合适的那一个。"""
    styles = _STYLES[bold]
    best = None
    for path in _font_files():
        for index in range(64):
            try:
                family, style = ImageFont.truetype(path, 12, index=index).getname()
            except OSError:
                break
            if family not in _FAMILIES:
                continue
            rank = (_FAMILIES.index(family), styles.index(style) if style in styles else len(styles))
            if best is None or rank < best[0]:
                best = (rank, (path, index))
    if best is None:
        raise SystemExit('找不到简体中文字体。Linux 装 Noto CJK（如 Debian/Ubuntu 的 fonts-noto-cjk），'
                         '或者把 shuiyin.SERIF / SERIF_B 设成 (字体文件, ttc 序号)')
    return best[1]


def _font(size, bold):
    path, index = (SERIF_B if bold else SERIF) or _find_face(bold)
    return _load_font(path, index, size)


@functools.lru_cache(None)
def _load_font(path, index, size):
    return ImageFont.truetype(path, size, index=index)


# 调色板预设（取自作品观察）
PALETTES = {
    'frost_blue': dict(deep=(38, 104, 158), mid=(86, 150, 190), light=(160, 198, 214), pale=(214, 228, 232),
                       snow=(246, 246, 242), accent=(196, 72, 48), dark=(40, 46, 56)),
    'moon_teal': dict(deep=(22, 92, 120), mid=(48, 150, 170), light=(120, 196, 204), pale=(196, 228, 228),
                      snow=(248, 246, 236), accent=(30, 30, 34), dark=(18, 52, 70)),
    'ink_snow': dict(deep=(34, 32, 32), mid=(92, 92, 90), light=(160, 160, 156), pale=(210, 208, 202),
                     snow=(247, 245, 240), accent=(214, 70, 44), dark=(24, 22, 22)),
    'warm_winter': dict(deep=(52, 44, 40), mid=(150, 146, 120), light=(196, 192, 170), pale=(222, 220, 210),
                        snow=(248, 246, 240), accent=(226, 112, 40), dark=(40, 34, 32)),
    'white_forest': dict(deep=(60, 130, 186), mid=(150, 174, 190), light=(196, 206, 210), pale=(228, 232, 230),
                         snow=(249, 249, 246), accent=(120, 110, 100), dark=(80, 86, 92)),
}


class Print:
    def __init__(self, w, h, seed=0, S=2, paper=(243, 240, 231), area=None):
        self.w, self.h, self.S = w, h, S
        self.W, self.H = w * S, h * S
        self.rng = np.random.default_rng(seed)
        self.r = random.Random(seed)
        self.paper = np.array(paper, float)
        self.img = np.ones((self.H, self.W, 3)) * self.paper
        # 印刷区域（版面），版外留白
        self.area = area or (0, 0, w, h)
        x0, y0, x1, y1 = self.area
        clip = Image.new('L', (self.W, self.H), 0)
        ImageDraw.Draw(clip).rectangle([x0 * S, y0 * S, x1 * S, y1 * S], fill=255)
        c = np.asarray(clip.filter(ImageFilter.GaussianBlur(1.2 * S)), float) / 255
        n = self.noise(3, 2)
        self.clip = np.clip((c - 0.5) * 3 + 0.5 + (n - 0.5) * 0.6, 0, 1)
        self.clip = (self.clip > 0.5).astype(float) * np.clip(c * 1.5, 0, 1)

    # ---------- 基础 ----------
    def p(self, v):
        if isinstance(v, (list, tuple)):
            return [self.p(x) for x in v]
        return v * self.S

    def mask(self):
        m = Image.new('L', (self.W, self.H), 0)
        return m, ImageDraw.Draw(m)

    def noise(self, scale, octaves=3, aniso=1.0):
        """fbm 噪声，0..1。scale=最终像素下的特征尺寸；aniso>1 横向拉长（水平笔触）"""
        acc = np.zeros((self.H, self.W))
        amp, tot, sc = 1.0, 0.0, scale
        for _ in range(octaves):
            gw = max(2, int(self.W / (sc * self.S * aniso)) + 2)
            gh = max(2, int(self.H / (sc * self.S)) + 2)
            small = (self.rng.random((gh, gw)) * 255).astype(np.uint8)
            big = np.asarray(Image.fromarray(small).resize((self.W, self.H), Image.BICUBIC), float) / 255
            acc += big * amp
            tot += amp
            amp *= 0.5
            sc /= 2
        acc /= tot
        acc = (acc - acc.mean()) / (acc.std() + 1e-6)
        return np.clip(0.5 + acc * 0.18, 0, 1)

    def paint(self, m, color, alpha=0.95, grain=0.3, speck=0.0, blur=0.6, streak=0.0, edge=0.0, grain_scale=1.6):
        """把一块“版”印上去：覆盖式混合 + 水印颗粒感"""
        if isinstance(m, Image.Image):
            if blur > 0:
                m = m.filter(ImageFilter.GaussianBlur(blur * self.S))
            a = np.asarray(m, float) / 255
        else:
            a = m
        a = a * self.clip
        mod = np.ones_like(a)
        if grain > 0:
            g = self.noise(grain_scale, 2)
            mod *= np.clip(1 - grain * (g - 0.35) * 1.6, 0, 1.1)
        if streak > 0:
            s = self.noise(10, 3, aniso=6)
            mod *= np.clip(1 - streak * (s - 0.4) * 2.2, 0, 1.15)
        if speck > 0:
            sp = self.rng.random(a.shape)
            sp = np.asarray(Image.fromarray((sp * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5 * self.S)), float) / 255
            mod = np.where(sp > 0.5 + 0.12 * (1 - speck), mod * 0.15, mod)
        if edge > 0:
            soft = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4 * self.S)), float) / 255
            mod *= 1 + edge * np.clip(a - soft, 0, 1) * 3
        A = np.clip(a * alpha * mod, 0, 1)[..., None]
        self.img = self.img * (1 - A) + np.array(color, float) * A

    def gradient(self, y0, y1, top=1.0, bottom=0.0, x0=None, x1=None):
        yy = (np.arange(self.H) / self.S - y0) / max(1, (y1 - y0))
        g = np.clip(top + (bottom - top) * yy, 0, 1)
        g = np.where((np.arange(self.H) / self.S >= y0) & (np.arange(self.H) / self.S <= y1), g, 0)
        out = np.repeat(g[:, None], self.W, axis=1)
        if x0 is not None:
            xs = np.arange(self.W) / self.S
            out *= ((xs >= x0) & (xs <= x1))[None, :]
        return out

    # ---------- 形状 ----------
    def ridge(self, x0, x1, y, amp, freq=3, seed=None, step=6):
        rr = random.Random(seed if seed is not None else self.r.random())
        ph = [rr.random() * 6.28 for _ in range(4)]
        pts = []
        x = x0
        while x <= x1 + step:
            t = (x - x0) / max(1, (x1 - x0))
            yy = y + amp * (0.55 * math.sin(t * freq * 3.1 + ph[0]) + 0.3 * math.sin(t * freq * 7.3 + ph[1])
                            + 0.15 * math.sin(t * freq * 17 + ph[2]))
            pts.append((x, yy))
            x += step
        return pts

    def fill_below(self, pts, bottom=None):
        m, d = self.mask()
        bottom = bottom if bottom is not None else self.h
        poly = pts + [(pts[-1][0], bottom), (pts[0][0], bottom)]
        d.polygon([(x * self.S, y * self.S) for x, y in poly], fill=255)
        return m

    def poly_mask(self, pts):
        m, d = self.mask()
        d.polygon([(x * self.S, y * self.S) for x, y in pts], fill=255)
        return m

    def ellipse_mask(self, cx, cy, rx, ry):
        m, d = self.mask()
        d.ellipse(self.p([cx - rx, cy - ry, cx + rx, cy + ry]), fill=255)
        return m

    # ---------- 直接绘制层（适合大量小元素，按前后顺序覆盖） ----------
    def layer(self):
        L = Image.new('RGBA', (self.W, self.H), (0, 0, 0, 0))
        return L, ImageDraw.Draw(L)

    def put(self, L, grain=0.15, blur=0.35, clip=True):
        if blur > 0:
            L = L.filter(ImageFilter.GaussianBlur(blur * self.S))
        arr = np.asarray(L, float)
        a = arr[..., 3] / 255 * (self.clip if clip else 1)
        if grain > 0:
            g = self.noise(1.4, 2)
            a = a * np.clip(1 - grain * (g - 0.35) * 1.6, 0, 1)
        A = a[..., None]
        self.img = self.img * (1 - A) + arr[..., :3] * A

    # ---------- 原作题材元素（可选） ----------
    def frost_crowns(self, d, crowns, fill, carve, density=1.0, light_dir=(-0.4, -1), mark=1.0):
        """冬旅式霜树冠：圆团 + 大量白色小刻痕，按列表顺序由后往前画"""
        S = self.S
        for (cx, cy, rx, ry) in crowns:
            pts = []
            n = 40
            ph = self.r.random() * 6.28
            for i in range(n):
                t = i / n * 2 * math.pi
                k = 1 + 0.06 * math.sin(t * 7 + ph) + 0.04 * math.sin(t * 13 + ph * 2)
                pts.append(((cx + rx * k * math.cos(t)) * S, (cy + ry * k * math.sin(t)) * S))
            d.polygon(pts, fill=fill + (255,))
            cnt = int(rx * ry * 0.09 * density)
            lx, ly = light_dir
            for _ in range(cnt):
                ang = self.r.random() * 2 * math.pi
                rad = math.sqrt(self.r.random())
                x = cx + rx * rad * math.cos(ang)
                y = cy + ry * rad * math.sin(ang)
                lit = (-(math.cos(ang) * lx + math.sin(ang) * ly) / math.hypot(lx, ly) * rad + 1) / 2  # 0..1
                if self.r.random() > 0.12 + 0.88 * lit ** 1.5:
                    continue
                tang = ang + math.pi / 2 + self.r.gauss(0, 0.35)
                L = (3 + self.r.random() * 5) * mark
                dx, dy = math.cos(tang) * L, math.sin(tang) * L
                mx, my = x + math.cos(ang) * 1.2, y + math.sin(ang) * 1.2
                w = max(1, int((1.0 + self.r.random() * 1.1) * mark * S))
                d.line([((x - dx / 2) * S, (y - dy / 2) * S), (mx * S, my * S), ((x + dx / 2) * S, (y + dy / 2) * S)],
                       fill=carve + (255,), width=w)

    def snow_spruce(self, d, x, base, h, w, line=(150, 165, 175), snow=(249, 249, 246), lw=1.0, tiers=None):
        """叠玉式雪压云杉：白色锯齿轮廓 + 细灰线"""
        S = self.S
        top = base - h
        tiers = tiers or max(5, int(h / (w * 0.32)))
        left, right = [], []
        for i in range(tiers + 1):
            t = i / tiers
            y = top + h * t
            hw = w / 2 * (0.12 + 0.88 * t ** 0.85) * (1 + self.r.gauss(0, 0.08))
            left.append((x - hw, y + hw * 0.25))
            left.append((x - hw * 0.45, y + hw * 0.18 + h / tiers * 0.35))
            right.append((x + hw, y + hw * 0.25))
            right.append((x + hw * 0.45, y + hw * 0.18 + h / tiers * 0.35))
        poly = [(x, top - 2)] + right + [(x + w * 0.1, base), (x - w * 0.1, base)] + left[::-1]
        d.polygon([(a * S, b * S) for a, b in poly], fill=snow + (255,))
        ww = max(1, int(lw * S))
        for side in (left, right):
            for i in range(0, len(side) - 1, 2):
                if self.r.random() < 0.8:
                    a, b = side[i], side[i + 1]
                    d.line([(a[0] * S, a[1] * S), (b[0] * S, b[1] * S)], fill=line + (255,), width=ww)
                    if self.r.random() < 0.5:
                        d.line([(b[0] * S, b[1] * S), ((x + (b[0] - x) * 0.2) * S, (b[1] + 1.5) * S)], fill=line + (200,), width=ww)
        if self.r.random() < 0.6:
            d.line([(x * S, (top + h * 0.3) * S), (x * S, base * S)], fill=line + (120,), width=ww)

    def bare_tree(self, d, x, y, h, color, w=2.0, spread=0.5, depth=4, snow=None):
        S = self.S
        def br(x0, y0, ang, L, wid, dep):
            x1 = x0 + math.cos(ang) * L
            y1 = y0 + math.sin(ang) * L
            d.line([(x0 * S, y0 * S), (x1 * S, y1 * S)], fill=color + (255,), width=max(1, int(wid * S)))
            if snow and wid > 1.2 and self.r.random() < 0.6:
                d.line([(x0 * S, (y0 - wid * 0.6) * S), (x1 * S, (y1 - wid * 0.6) * S)], fill=snow + (255,), width=max(1, int(wid * 0.5 * S)))
            if dep <= 0 or L < 3:
                return
            for k in range(2 if dep < 3 else 3):
                na = ang + self.r.uniform(-spread, spread) - 0.05
                br(x1, y1, na, L * self.r.uniform(0.55, 0.75), wid * 0.62, dep - 1)
        trunk = h * 0.45
        d.line([(x * S, y * S), (x * S, (y - trunk) * S)], fill=color + (255,), width=max(1, int(w * S)))
        for i in range(3):
            yy = y - trunk * (0.6 + 0.2 * i)
            br(x, yy, -math.pi / 2 + self.r.uniform(-0.6, 0.6), h * 0.35, w * 0.6, depth - 1)
        br(x, y - trunk, -math.pi / 2, h * 0.4, w * 0.7, depth)

    def birch(self, d, x, y0, y1, w, bark=(250, 249, 244), mark=(30, 28, 28)):
        S = self.S
        bend = self.r.uniform(-6, 6)
        pts = []
        steps = 12
        for i in range(steps + 1):
            t = i / steps
            pts.append((x + bend * math.sin(t * math.pi), y0 + (y1 - y0) * t))
        for i in range(steps):
            (ax, ay), (bx, by) = pts[i], pts[i + 1]
            ww = w * (1 - 0.6 * (i / steps))
            d.line([(ax * S, ay * S), (bx * S, by * S)], fill=bark + (255,), width=max(1, int(ww * S)))
        n = int(abs(y1 - y0) / 9)
        for _ in range(n):
            t = self.r.random()
            px = x + bend * math.sin(t * math.pi)
            py = y0 + (y1 - y0) * t
            ww = w * (1 - 0.6 * t)
            l = ww * self.r.uniform(0.3, 0.9)
            side = self.r.choice([-1, 1])
            d.line([((px + side * ww / 2 - side * l) * S, py * S), ((px + side * ww / 2) * S, (py + self.r.uniform(-1, 1)) * S)],
                   fill=mark + (255,), width=max(1, int(self.r.uniform(1, 2.2) * S)))
        return pts

    def cow(self, d, x, y, s, body=(250, 250, 246), patch=(30, 30, 32), blanket=None, facing=1, horns=True):
        """极小的牛（剪影级别），y 为蹄底"""
        S = self.S
        f = facing
        bx0, bx1 = x - 14 * s, x + 14 * s
        by0, by1 = y - 19 * s, y - 8 * s
        for lx in (x - 11 * s, x - 7 * s, x + 8 * s, x + 11 * s):
            d.line([(lx * S, (by1 - 1) * S), ((lx + self.r.uniform(-1, 1) * s) * S, y * S)], fill=patch + (255,), width=max(1, int(1.6 * s * S)))
        d.rounded_rectangle([bx0 * S, by0 * S, bx1 * S, by1 * S], radius=int(4 * s * S), fill=body + (255,), outline=patch + (255,), width=max(1, int(0.8 * s * S)))
        if blanket is None:
            for _ in range(3):
                px = self.r.uniform(bx0 + 3 * s, bx1 - 6 * s)
                py = self.r.uniform(by0, by1 - 4 * s)
                d.ellipse([px * S, py * S, (px + 6 * s) * S, (py + 4 * s) * S], fill=patch + (255,))
        else:
            d.rectangle([(x - 7 * s) * S, (by0 - 1 * s) * S, (x + 6 * s) * S, (by1 - 1 * s) * S], fill=blanket[0] + (255,))
            for k in range(1, len(blanket)):
                yy = by0 + (by1 - by0) * k / len(blanket)
                d.line([((x - 7 * s) * S, yy * S), ((x + 6 * s) * S, yy * S)], fill=blanket[k] + (255,), width=max(1, int(1.2 * s * S)))
        hx = bx1 if f > 0 else bx0
        head = [(hx, by0 + 1 * s), (hx + 6 * s * f, by0 + 2 * s), (hx + 7 * s * f, by0 + 6 * s), (hx + 1 * s * f, by0 + 6 * s)]
        d.polygon([(a * S, b * S) for a, b in head], fill=patch + (255,))
        if horns:
            d.line([((hx + 2 * s * f) * S, (by0 + 1 * s) * S), ((hx + 7 * s * f) * S, (by0 - 4 * s) * S)], fill=patch + (255,), width=max(1, int(1 * s * S)))
        tx = bx0 if f > 0 else bx1
        d.line([(tx * S, (by0 + 2 * s) * S), ((tx - 3 * s * f) * S, (by1 + 2 * s) * S)], fill=patch + (255,), width=max(1, int(0.8 * s * S)))

    def reindeer(self, d, x, y, s, color=(70, 72, 76), belly=(236, 236, 232), facing=1):
        S = self.S
        f = facing
        by0, by1 = y - 17 * s, y - 9 * s
        for lx in (x - 9 * s, x - 6 * s, x + 6 * s, x + 9 * s):
            d.line([(lx * S, by1 * S), (lx * S, y * S)], fill=color + (255,), width=max(1, int(1.3 * s * S)))
        d.ellipse([(x - 12 * s) * S, by0 * S, (x + 12 * s) * S, by1 * S], fill=color + (255,))
        d.ellipse([(x - 8 * s) * S, (by1 - 3 * s) * S, (x + 8 * s) * S, (by1 + 0.5 * s) * S], fill=belly + (255,))
        nx = x + 10 * s * f
        d.line([(nx * S, (by0 + 2 * s) * S), ((nx + 4 * s * f) * S, (by0 - 6 * s) * S)], fill=color + (255,), width=max(1, int(3 * s * S)))
        hx, hy = nx + 4 * s * f, by0 - 7 * s
        d.polygon([(hx * S, hy * S), ((hx + 6 * s * f) * S, (hy + 3 * s) * S), ((hx + 1 * s * f) * S, (hy + 4 * s) * S)], fill=color + (255,))
        for k in (-1, 1):
            ax, ay = hx + k * 1 * s, hy
            d.line([(ax * S, ay * S), ((ax - 2 * s * f + k * 2 * s) * S, (ay - 8 * s) * S)], fill=color + (255,), width=max(1, int(0.9 * s * S)))
            d.line([((ax - 1 * s * f + k * 1 * s) * S, (ay - 4 * s) * S), ((ax + 2 * s * f + k * 3 * s) * S, (ay - 7 * s) * S)], fill=color + (255,), width=max(1, int(0.8 * s * S)))

    def person(self, d, x, y, s, coat=(30, 30, 32), hat=None, scarf=None, pose=0):
        """小人（任何场景都可用），y 为脚底；pose=1 举手"""
        S = self.S
        d.polygon([((x - 3 * s) * S, y * S), ((x + 3 * s) * S, y * S), ((x + 2 * s) * S, (y - 11 * s) * S), ((x - 2 * s) * S, (y - 11 * s) * S)], fill=coat + (255,))
        d.ellipse([(x - 2 * s) * S, (y - 15 * s) * S, (x + 2 * s) * S, (y - 11 * s) * S], fill=coat + (255,))
        if hat:
            d.rectangle([(x - 2.5 * s) * S, (y - 15.5 * s) * S, (x + 2.5 * s) * S, (y - 13.5 * s) * S], fill=hat + (255,))
        if scarf:
            d.rectangle([(x - 2 * s) * S, (y - 11.5 * s) * S, (x + 2 * s) * S, (y - 10 * s) * S], fill=scarf + (255,))
        if pose == 1:
            d.line([((x + 1.5 * s) * S, (y - 10 * s) * S), ((x + 5 * s) * S, (y - 17 * s) * S)], fill=coat + (255,), width=max(1, int(1.2 * s * S)))

    def caption(self, xy, text, size, color=(112, 108, 102), anchor='la', bold=False):
        m, d = self.mask()
        f = _font(int(size * self.S), bold)
        d.text((xy[0] * self.S, xy[1] * self.S), text, font=f, anchor=anchor, fill=255)
        old = self.clip
        self.clip = np.ones_like(old)
        self.paint(m, color, alpha=0.92, grain=0.25, blur=0.25, grain_scale=0.8)
        self.clip = old

    def textlen(self, text, size, bold=False):
        f = _font(int(size * self.S), bold)
        return f.getlength(text) / self.S

    def finish(self, path):
        img = self.img
        fine = (self.noise(0.8, 2) - 0.5) * 10
        low = (self.noise(60, 2) - 0.5) * 8
        fib = Image.new('L', (self.W, self.H), 0)
        d = ImageDraw.Draw(fib)
        for _ in range(int(self.w * self.h / 1800)):
            x, y = self.r.random() * self.W, self.r.random() * self.H
            ang = self.r.random() * math.pi
            pts = [(x, y)]
            for _ in range(4):
                ang += self.r.gauss(0, 0.3)
                x += math.cos(ang) * self.S * 5
                y += math.sin(ang) * self.S * 5
                pts.append((x, y))
            d.line(pts, fill=int(40 + self.r.random() * 80), width=1)
        f = np.asarray(fib.filter(ImageFilter.GaussianBlur(0.4 * self.S)), float) / 255
        img = img + (fine + low)[..., None] - (f * 14)[..., None]
        out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((self.w, self.h), Image.LANCZOS)
        out.save(path, optimize=True)
        return path


def wash(P, m, color, alpha=0.95, sweep=0.7, grain=0.45, blur=1.0):
    """水平扫刷的水印色块（天空、背景、台面）"""
    if isinstance(m, Image.Image):
        m = m.filter(ImageFilter.GaussianBlur(blur * P.S))
        a = np.asarray(m, float) / 255
    else:
        a = m
    s = P.noise(18, 4, aniso=9)
    s2 = P.noise(6, 2, aniso=14)
    mod = np.clip(1 - sweep * ((s - 0.5) * 2.6 + (s2 - 0.5) * 1.4), 0.05, 1.15)
    P.paint(a * mod, color, alpha=alpha, grain=grain, blur=0, grain_scale=1.3)

def brush_mass(P, m, base, dark, light=None, angle=-0.9, n=None, lw=(2.0, 4.5), length=(10, 26), dark_frac=0.55, ragged=6):
    """月色式团块：底色 + 大量短斜刀痕（深色为主，少量浅色），边缘被刀痕撕碎"""
    S = P.S
    mi = m if isinstance(m, Image.Image) else Image.fromarray((m * 255).astype(np.uint8))
    bbox = mi.getbbox()
    if not bbox:
        return
    x0, y0, x1, y1 = [v / S for v in bbox]
    core = mi.filter(ImageFilter.MinFilter((int(ragged * S) | 1)))
    P.paint(core, base, alpha=0.9, grain=0.5, blur=1.5)
    area = (x1 - x0) * (y1 - y0)
    n = n or int(area * 0.05)
    L, d = P.layer()
    marr = np.asarray(mi, float) / 255
    for _ in range(n):
        x = P.r.uniform(x0 - ragged, x1 + ragged)
        y = P.r.uniform(y0 - ragged, y1 + ragged)
        xi, yi = int(min(max(x * S, 0), P.W - 1)), int(min(max(y * S, 0), P.H - 1))
        if marr[yi, xi] < 0.5 and P.r.random() > 0.015:
            continue
        a = angle + P.r.gauss(0, 0.28)
        l = P.r.uniform(*length)
        dx, dy = math.cos(a) * l / 2, math.sin(a) * l / 2
        depth = (y - y0) / max(1, (y1 - y0))
        if light and P.r.random() < 0.22 * (1 - depth):
            col = light
        elif P.r.random() < dark_frac * (0.5 + depth):
            col = dark
        else:
            col = base
        w = P.r.uniform(*lw)
        for k, f in ((0, 1.0), (1, 0.6)):
            sh = (1 - f) * l / 2
            d.line([((x - dx + math.cos(a) * sh) * S, (y - dy + math.sin(a) * sh) * S),
                    ((x + dx - math.cos(a) * sh) * S, (y + dy - math.sin(a) * sh) * S)],
                   fill=col + (int(200 + 55 * f),), width=max(1, int(w * f * S)))
    P.put(L, grain=0.35, blur=0.5)


# ================= 通用元素：让风格作用在任意题材上 =================

def wobbly_poly(P, pts, jitter=1.5, step=8):
    """把多边形的边切成小段并加手刻的抖动，返回新的点列"""
    out = []
    n = len(pts)
    for i in range(n):
        (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
        L = math.hypot(bx - ax, by - ay)
        k = max(1, int(L / step))
        for j in range(k):
            t = j / k
            out.append((ax + (bx - ax) * t + P.r.gauss(0, jitter), ay + (by - ay) * t + P.r.gauss(0, jitter)))
    return out

def wobbly_rect(P, x0, y0, x1, y1, jitter=1.5):
    return wobbly_poly(P, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], jitter)

def blob(P, cx, cy, rx, ry, wob=0.08, n=48):
    ph = P.r.random() * 6.28
    return [(cx + rx * (1 + wob * math.sin(t * 5 + ph) + wob * 0.6 * math.sin(t * 11 + ph * 2)) * math.cos(t),
             cy + ry * (1 + wob * math.sin(t * 5 + ph) + wob * 0.6 * math.sin(t * 11 + ph * 2)) * math.sin(t))
            for t in [i / n * 2 * math.pi for i in range(n)]]

def carve_fill(P, d, pts, fill, carve=None, density=1.0, mark=1.0, light=(-0.4, -1), style='nick'):
    """任意形状的“刻版”：先填色，再在内部刻白痕。
    style: 'nick' 霜树冠式 v 形小刻痕（朝光侧更密）; 'hatch' 斜向短刀; 'grain' 横向木纹细线; 'dots' 点刻"""
    S = P.S
    carve = carve or tuple(min(255, int(c + (250 - c) * 0.85)) for c in fill)
    d.polygon([(x * S, y * S) for x, y in pts], fill=fill + (255,))
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    m = Image.new('L', (int((x1 - x0) + 4), int((y1 - y0) + 4)), 0)
    ImageDraw.Draw(m).polygon([(x - x0 + 2, y - y0 + 2) for x, y in pts], fill=255)
    ma = np.asarray(m)
    def inside(x, y):
        i, j = int(y - y0 + 2), int(x - x0 + 2)
        return 0 <= i < ma.shape[0] and 0 <= j < ma.shape[1] and ma[i, j] > 0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = max(1, (x1 - x0) / 2), max(1, (y1 - y0) / 2)
    area = (x1 - x0) * (y1 - y0)
    if style == 'grain':
        y = y0 + 2
        while y < y1:
            x = x0
            while x < x1:
                l = P.r.uniform(10, 40) * mark
                if inside(x, y) and inside(x + l, y) and P.r.random() < 0.55 * density:
                    d.line([(x * S, y * S), ((x + l) * S, (y + P.r.gauss(0, 0.6)) * S)], fill=carve + (255,), width=max(1, int(P.r.uniform(0.7, 1.4) * mark * S)))
                x += l + P.r.uniform(4, 14)
            y += P.r.uniform(3, 6) / max(0.3, density)
        return
    cnt = int(area * 0.07 * density)
    lx, ly = light
    for _ in range(cnt):
        x = P.r.uniform(x0, x1); y = P.r.uniform(y0, y1)
        if not inside(x, y):
            continue
        ux, uy = (x - cx) / rx, (y - cy) / ry
        lit = min(1.0, max(0.0, (-(ux * lx + uy * ly) / math.hypot(lx, ly) + 1) / 2))
        if style == 'nick':
            if P.r.random() > 0.12 + 0.88 * lit ** 1.5:
                continue
            ang = math.atan2(uy, ux) + math.pi / 2 + P.r.gauss(0, 0.5)
            L = (3 + P.r.random() * 5) * mark
            dx, dy = math.cos(ang) * L / 2, math.sin(ang) * L / 2
            d.line([((x - dx) * S, (y - dy) * S), ((x + math.cos(ang + 1.57) * 1.2) * S, (y + math.sin(ang + 1.57) * 1.2) * S), ((x + dx) * S, (y + dy) * S)],
                   fill=carve + (255,), width=max(1, int((1.0 + P.r.random()) * mark * S)))
        elif style == 'hatch':
            if P.r.random() > 0.2 + 0.8 * lit:
                continue
            a = -0.95 + P.r.gauss(0, 0.25)
            L = P.r.uniform(6, 16) * mark
            d.line([((x - math.cos(a) * L / 2) * S, (y - math.sin(a) * L / 2) * S), ((x + math.cos(a) * L / 2) * S, (y + math.sin(a) * L / 2) * S)],
                   fill=carve + (255,), width=max(1, int(P.r.uniform(1.2, 2.6) * mark * S)))
        elif style == 'dots':
            if P.r.random() > 0.15 + 0.85 * lit:
                continue
            r = P.r.uniform(0.6, 1.6) * mark
            d.ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=carve + (255,))

def knife_line(P, d, pts, color, w=3.0, taper=True, wob=0.8):
    """刀刻线：宽度不均、略抖、两头收尖"""
    S = P.S
    dense = []
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        k = max(1, int(math.hypot(bx - ax, by - ay) / 6))
        for j in range(k):
            t = j / k
            dense.append((ax + (bx - ax) * t + P.r.gauss(0, wob * 0.4), ay + (by - ay) * t + P.r.gauss(0, wob * 0.4)))
    dense.append(pts[-1])
    n = len(dense)
    for i in range(n - 1):
        t = i / max(1, n - 2)
        f = (math.sin(t * math.pi) ** 0.35) if taper else 1
        ww = max(1, int(w * f * P.r.uniform(0.8, 1.15) * S))
        d.line([(dense[i][0] * S, dense[i][1] * S), (dense[i + 1][0] * S, dense[i + 1][1] * S)], fill=color + (255,), width=ww)

def knife_arrow(P, d, x0, y0, x1, y1, color, w=4.0, head=18):
    knife_line(P, d, [(x0, y0), (x1, y1)], color, w, taper=False)
    a = math.atan2(y1 - y0, x1 - x0)
    pts = [(x1 + math.cos(a) * 4, y1 + math.sin(a) * 4),
           (x1 - math.cos(a - 0.45) * head, y1 - math.sin(a - 0.45) * head),
           (x1 - math.cos(a) * head * 0.55, y1 - math.sin(a) * head * 0.55),
           (x1 - math.cos(a + 0.45) * head, y1 - math.sin(a + 0.45) * head)]
    d.polygon([(x * P.S, y * P.S) for x, y in wobbly_poly(P, pts, 0.6, 5)], fill=color + (255,))

def block_text(P, d, xy, text, size, color, anchor='mm', bold=True):
    """版面内的字（刻出来的字）：只用于少量数字/标号，正文仍写在纸边"""
    f = _font(int(size * P.S), bold)
    d.text((xy[0] * P.S, xy[1] * P.S), text, font=f, anchor=anchor, fill=color + (255,))
