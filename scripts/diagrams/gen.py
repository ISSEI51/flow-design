"""Generate Flow Design diagrams (.drawio) with a shared visual vocabulary.

Usage: python3 scripts/diagrams/gen.py [output_dir]
The .drawio files are the source of truth. SVGs are exported by build.sh.
"""
import os
import sys
from xml.sax.saxutils import escape

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "diagrams")

# ---- shared tokens (diagram-local, not product design tokens) ----
FONT = "fontFamily=Helvetica;"
TEXT = "light-dark(#1F2328,#E6EDF3)"
MUTED = "light-dark(#59636E,#9198A1)"
LINE = "light-dark(#8C959F,#6E7681)"
ACCENT = "light-dark(#0969DA,#4493F8)"
SURFACE = "light-dark(#F6F8FA,#161B22)"
ACCENT_SURFACE = "light-dark(#DDF4FF,#121D2F)"
BAR = "light-dark(#D0D7DE,#30363D)"
BAR_STRONG = "light-dark(#57606A,#9198A1)"
R = 14  # corner radius for blocks
SW = 1.5  # line width

S_NUM, S_NAME, S_SUB, S_LABEL = 15, 18, 15, 15


class D:
    def __init__(self):
        self.cells = []
        self.n = 0

    def id(self):
        self.n += 1
        return f"c{self.n}"

    def text(self, x, y, w, h, val, size, color=TEXT, bold=False, align="left", valign="top"):
        st = (f"text;html=0;whiteSpace=nowrap;align={align};verticalAlign={valign};spacing=0;"
              f"{FONT}fontSize={size};fontColor={color};fontStyle={1 if bold else 0};")
        self.cells.append(
            f'<mxCell id="{self.id()}" value="{escape(val, {chr(34): "&quot;", chr(10): "&#xa;"})}" style="{st}" vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')

    def rect(self, x, y, w, h, fill=SURFACE, stroke="none", r=R, dashed=False, sw=SW, opacity=100):
        st = (f"rounded=1;absoluteArcSize=1;arcSize={r * 2};html=0;fillColor={fill};strokeColor={stroke};"
              f"strokeWidth={sw};dashed={1 if dashed else 0};opacity={opacity};")
        self.cells.append(
            f'<mxCell id="{self.id()}" value="" style="{st}" vertex="1" parent="1">'
            f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')

    def bar(self, x, y, w, h=8, fill=BAR):
        self.rect(x, y, w, h, fill=fill, r=h // 2 or 1)

    def dot(self, cx, cy, d=14, fill="none", stroke=LINE, opacity=100):
        st = f"ellipse;html=0;fillColor={fill};strokeColor={stroke};strokeWidth=2;opacity={opacity};"
        self.cells.append(
            f'<mxCell id="{self.id()}" value="" style="{st}" vertex="1" parent="1">'
            f'<mxGeometry x="{cx - d / 2}" y="{cy - d / 2}" width="{d}" height="{d}" as="geometry"/></mxCell>')

    def line(self, pts, color=LINE, arrow=True, dashed=False, sw=SW):
        (x1, y1), (x2, y2) = pts[0], pts[-1]
        mids = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts[1:-1])
        arr = f'<Array as="points">{mids}</Array>' if mids else ""
        st = (f"html=0;endArrow={'blockThin' if arrow else 'none'};endFill=1;endSize=7;startArrow=none;"
              f"strokeColor={color};strokeWidth={sw};dashed={1 if dashed else 0};rounded=1;")
        self.cells.append(
            f'<mxCell id="{self.id()}" value="" style="{st}" edge="1" parent="1">'
            f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/>'
            f'<mxPoint x="{x2}" y="{y2}" as="targetPoint"/>{arr}</mxGeometry></mxCell>')

    def save(self, name):
        body = "\n        ".join(self.cells)
        xml = f'''<mxfile host="drawio">
  <diagram id="{name}" name="{name}">
    <mxGraphModel grid="1" gridSize="10" guides="1" page="0" math="0" shadow="0" background="none">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        {body}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
'''
        open(f"{OUT}/{name}.drawio", "w").write(xml)


def block(d, x, y, w, h, num, name, sub, fill=SURFACE, stroke="none"):
    d.rect(x, y, w, h, fill=fill, stroke=stroke)
    d.text(x + 22, y + 18, 40, 18, num, S_NUM, ACCENT, bold=True)
    d.text(x + 22, y + 40, w - 44, 24, name, S_NAME, TEXT, bold=True)
    d.text(x + 22, y + 68, w - 44, 18, sub, S_SUB, MUTED)


# ---------------------------------------------------------------- 1 journey
def journey():
    d = D()
    stages = [("目的", "Purpose", "達成したい\nことがある"),
              ("理解", "Understanding", "状況が抵抗なく\n頭に入る"),
              ("判断", "Decision", "次に何をするか\n迷わない"),
              ("行動", "Action", "自然に\n操作できる"),
              ("ゴール", "Goal", "目的を\n達成する")]
    xs = [90, 270, 450, 630, 810]
    for i, (ja, en, st) in enumerate(stages):
        cx = xs[i]
        end = i in (0, 4)
        d.dot(cx, 10, fill=ACCENT if end else "none", stroke=ACCENT if end else LINE)
        d.text(cx - 90, 40, 180, 30, ja, 24, TEXT, bold=True, align="center")
        d.text(cx - 90, 74, 180, 18, en, S_SUB, MUTED, align="center")
        d.text(cx - 90, 110, 180, 44, st, 16, TEXT, align="center")
    for i in range(4):
        d.line([(xs[i] + 9, 10), (xs[i + 1] - 9, 10)])
    d.save("journey")


# ---------------------------------------------------------------- 2 principles
def principles():
    d = D()
    W, GAP = 900, 24
    cw = (W - 2 * GAP) / 3
    d.text(0, 0, 300, 18, "目指すこと", S_LABEL, MUTED, bold=True)
    block(d, 0, 28, W, 96, "01", "考えなくてもわかる", "Cognitive Ease", fill=ACCENT_SURFACE)
    cols = [("構造をつくる", [("02", "すべてに理由がある", "Logic"), ("03", "考える順に並べる", "Flow")]),
            ("伝え方を整える", [("04", "意味のない要素を置かない", "Semantic Economy"),
                             ("05", "普段の言葉で伝える", "Linguistic Clarity")]),
            ("操作を軽くする", [("06", "慣れた形と言葉を使う", "Familiarity"),
                             ("07", "少ない負荷で目的に届く", "Interaction Efficiency")])]
    top = 200
    for i, (label, items) in enumerate(cols):
        x = i * (cw + GAP)
        cx = x + cw / 2
        d.line([(cx, top - 10), (cx, 130)])
        d.text(x, top, cw, 18, label, S_LABEL, MUTED, bold=True)
        for j, (n, name, sub) in enumerate(items):
            block(d, x, top + 28 + j * 112, cw, 96, n, name, sub)
    bottom = top + 28 + 2 * 112 - 16  # 436
    gy = bottom + 70
    d.text(0, gy - 28, W, 18, "02〜07 の減らしすぎを防ぐ", S_LABEL, MUTED, bold=True, align="center")
    for i in (0, 2):
        cx = i * (cw + GAP) + cw / 2
        d.line([(cx, gy - 4), (cx, bottom + 8)])
    block(d, 0, gy, W, 96, "08", "必要なものは削らない", "Functional Integrity",
          fill="none", stroke=ACCENT)
    d.save("principles")


# ---------------------------------------------------------------- 3 wording
def wording():
    d = D()
    L, Rx, w = 0, 500, 400
    d.text(L, 0, w, 20, "避ける", 16, MUTED, bold=True)
    d.text(Rx, 0, w, 20, "使う", 16, ACCENT, bold=True)
    # A: heading + redundant description
    d.text(L, 48, 900, 18, "見出しと同じ意味の説明", S_LABEL, MUTED, bold=True)
    y = 76
    d.rect(L, y, w, 112)
    d.text(L + 28, y + 26, w - 56, 30, "顧客管理", 24, TEXT, bold=True)
    d.text(L + 28, y + 66, w - 56, 22, "顧客情報を管理できます。", 16, MUTED)
    d.rect(Rx, y, w, 112)
    d.text(Rx + 28, y + 26, w - 56, 30, "顧客管理", 24, TEXT, bold=True)
    d.line([(L + w + 30, y + 56), (Rx - 30, y + 56)])
    # B: difficult words
    pairs = [("事業概況", "事業の状況"), ("検索条件の初期化", "条件をリセット"),
             ("対象レコードが存在しません", "データがありません")]
    d.text(L, 236, 900, 18, "難しい言葉", S_LABEL, MUTED, bold=True)
    for i, (a, b) in enumerate(pairs):
        y = 264 + i * 64
        d.rect(L, y, w, 52)
        d.text(L + 28, y, w - 56, 52, a, 18, MUTED, valign="middle")
        d.rect(Rx, y, w, 52)
        d.text(Rx + 28, y, w - 56, 52, b, 18, TEXT, bold=True, valign="middle")
        d.line([(L + w + 30, y + 26), (Rx - 30, y + 26)])
    d.save("wording")


# ---------------------------------------------------------------- 4 layout
def layout():
    d = D()
    w, h, Rx = 420, 330, 480
    d.text(0, 0, w, 20, "避ける", 16, MUTED, bold=True)
    d.text(0, 24, w, 20, "すべてをカードで囲む", S_NAME, TEXT, bold=True)
    d.text(Rx, 0, w, 20, "使う", 16, ACCENT, bold=True)
    d.text(Rx, 24, w, 20, "余白と文字の階層で区切る", S_NAME, TEXT, bold=True)
    y0 = 68
    for x in (0, Rx):
        d.rect(x, y0, w, h, fill="none", stroke=LINE, r=18, sw=1)
    # before: uniform cards, icons, badges
    cw, ch, g, p = 114, 128, 15, 24
    for r in range(2):
        for c in range(3):
            x = p + c * (cw + g)
            y = y0 + p + 6 + r * (ch + g + 6)
            d.rect(x, y, cw, ch, fill=SURFACE, stroke=LINE, r=10, sw=1)
            d.rect(x + 14, y + 14, 22, 22, fill="none", stroke=BAR_STRONG, r=6, sw=1)
            d.bar(x + cw - 50, y + 18, 36, 14, fill=BAR)
            d.bar(x + 14, y + 56, 72, 8, fill=BAR_STRONG)
            d.bar(x + 14, y + 76, 86, 6)
            d.bar(x + 14, y + 92, 60, 6)
    # after: hierarchy by size and space
    x = Rx + 32
    y = y0 + 34
    d.bar(x, y, 190, 18, fill=BAR_STRONG)
    d.bar(x, y + 34, 280, 7)
    for gi, gy in enumerate((y + 82, y + 192)):
        d.bar(x, gy, 54, 7, fill=ACCENT)
        for k in range(3):
            ry = gy + 26 + k * 24
            d.bar(x, ry, 110, 7, fill=BAR_STRONG)
            d.bar(x + 170, ry, 150 - (k * 30) % 70, 7)
        if gi == 0:
            d.line([(x, gy + 102), (x + w - 64, gy + 102)], color=BAR, arrow=False, sw=1)
    d.save("layout")


# ---------------------------------------------------------------- 5 visual language
def visual():
    d = D()
    W, G = 900, 20
    tw, th = (W - 3 * G) / 4, 228
    items = [("01", "静けさと上品さ", "Quiet Elegance"), ("02", "豊かな余白", "Whitespace"),
             ("03", "区切りは余白から", "Spatial Organization"), ("04", "大胆な文字の強弱", "Bold Typography"),
             ("05", "柔らかな形", "Soft Geometry"), ("06", "意図のある色", "Intentional Color"),
             ("07", "リズムとバランス", "Rhythm & Balance"), ("08", "自然な動き", "Natural Motion")]
    for i, (n, name, sub) in enumerate(items):
        c, r = i % 4, i // 4
        x, y = c * (tw + G), r * (th + G)
        d.rect(x, y, tw, th)
        sx, sy = x + 22, y + 24  # sample area: (tw-44) x 100
        sw_ = tw - 44
        if n == "01":
            d.bar(sx, sy + 14, 90, 10, fill=BAR_STRONG)
            d.bar(sx, sy + 40, sw_ - 20, 6)
            d.bar(sx, sy + 54, sw_ - 50, 6)
            d.bar(sx, sy + 68, sw_ - 34, 6)
            d.dot(sx + sw_ - 6, sy + 19, d=8, fill=ACCENT, stroke=ACCENT)
        elif n == "02":
            for k in range(3):
                d.bar(sx, sy + 6 + k * 12, 70 - k * 12, 6)
            for k in range(3):
                d.bar(sx, sy + 82 + k * 12, 70 - k * 12, 6)
            d.rect(sx - 6, sy + 48, 82, 28, fill="none", stroke=ACCENT, r=6, dashed=True, sw=1)
        elif n == "03":
            # order of separation means: space, type, line, background, card
            step = sw_ / 5
            for k in range(5):
                gx = sx + k * step
                cx = gx + step / 2
                if k == 0:
                    d.bar(cx - 12, sy + 26, 24, 5, fill=ACCENT)
                    d.bar(cx - 12, sy + 46, 24, 5, fill=ACCENT)
                elif k == 1:
                    d.bar(cx - 12, sy + 24, 24, 9, fill=BAR_STRONG)
                    d.bar(cx - 12, sy + 46, 18, 5)
                elif k == 2:
                    d.bar(cx - 12, sy + 26, 24, 5)
                    d.line([(cx - 12, sy + 39), (cx + 12, sy + 39)], color=LINE, arrow=False, sw=1)
                    d.bar(cx - 12, sy + 48, 24, 5)
                elif k == 3:
                    d.rect(cx - 15, sy + 18, 30, 40, fill=BAR, r=4, opacity=60)
                else:
                    d.rect(cx - 15, sy + 18, 30, 40, fill="none", stroke=BAR_STRONG, r=6, sw=1)
                d.text(gx, sy + 70, step, 16, str(k + 1), 14, ACCENT if k == 0 else MUTED, bold=True, align="center")
        elif n == "04":
            d.text(sx, sy - 4, 90, 70, "Aa", 56, TEXT, bold=True)
            d.text(sx + 100, sy + 38, 60, 20, "Aa", 16, MUTED)
            d.bar(sx, sy + 78, sw_ - 30, 6)
        elif n == "05":
            d.rect(sx, sy + 56, 30, 30, fill="none", stroke=BAR_STRONG, r=5, sw=1.5)
            d.rect(sx + 44, sy + 36, 50, 50, fill="none", stroke=BAR_STRONG, r=9, sw=1.5)
            d.rect(sx + 108, sy + 6, sw_ - 108, 80, fill="none", stroke=ACCENT, r=16, sw=1.5)
        elif n == "06":
            for k in range(4):
                d.bar(sx, sy + 10 + k * 20, sw_ - 40 - (k % 2) * 30, 8)
            d.bar(sx, sy + 90, 56, 8, fill=ACCENT)
        elif n == "07":
            d.rect(sx, sy + 4, 82, 86, fill=BAR, r=8)
            d.rect(sx + 92, sy + 4, sw_ - 92, 38, fill=BAR, r=8, opacity=60)
            d.rect(sx + 92, sy + 52, sw_ - 92, 38, fill=BAR, r=8, opacity=60)
        elif n == "08":
            base = sy + 56
            d.line([(sx, base + 22), (sx + sw_, base + 22)], color=BAR, arrow=False, sw=1)
            for off, op in ((8, 15), (64, 30), (104, 50), (130, 75)):
                d.dot(sx + off, base, d=16, fill=ACCENT, stroke="none", opacity=op)
            d.dot(sx + 150, base, d=16, fill=ACCENT, stroke=ACCENT)
        d.text(x + 22, y + 140, 40, 18, n, S_NUM, ACCENT, bold=True)
        d.text(x + 22, y + 162, tw - 44, 24, name, S_NAME, TEXT, bold=True)
        d.text(x + 22, y + 190, tw - 44, 18, sub, S_SUB, MUTED)
    d.save("visual-language")


# ---------------------------------------------------------------- 6 process
def process():
    d = D()
    steps = [("目的", "Purpose"), ("ユーザー", "User"), ("構造", "Structure"), ("順序", "Flow"),
             ("操作", "Interaction"), ("見た目", "Visual"), ("実装", "Implementation"), ("確認", "Review")]
    sp = 116
    xs = [60 + i * sp for i in range(8)]
    dy = 64
    groups = [("知る", 0, 1), ("設計する", 2, 5), ("つくる", 6, 6), ("確かめる", 7, 7)]
    for label, a, b in groups:
        x1, x2 = xs[a] - 46, xs[b] + 46
        d.text(x1, 0, x2 - x1, 18, label, S_LABEL, MUTED, bold=True, align="center")
        d.line([(x1, 30), (x2, 30)], color=BAR, arrow=False, sw=1.5)
    for i, (ja, en) in enumerate(steps):
        cx = xs[i]
        last = i == 7
        d.dot(cx, dy, fill=ACCENT if i == 0 else "none", stroke=ACCENT if i in (0, 7) else LINE)
        d.text(cx - 60, dy + 26, 120, 18, f"{i + 1:02d}", S_NUM, ACCENT, bold=True, align="center")
        d.text(cx - 60, dy + 48, 120, 24, ja, 20, TEXT, bold=True, align="center")
        d.text(cx - 60, dy + 78, 120, 18, en, 14, MUTED, align="center")
    for i in range(7):
        d.line([(xs[i] + 9, dy), (xs[i + 1] - 9, dy)])
    # review loop
    ly = dy + 140
    d.line([(xs[7], dy + 108), (xs[7], ly), (xs[0], ly), (xs[0], dy + 106)], color=ACCENT, dashed=True)
    d.text(xs[0], ly + 12, xs[7] - xs[0], 18, "確認の結果に応じて、必要なステップへ戻って直す", S_LABEL, MUTED, align="center")
    d.save("process")


# ---------------------------------------------------------------- 7 web architecture
def tw(s, size):
    """rough text width estimate for Helvetica + CJK fallback"""
    w = 0
    for ch in s:
        w += size if ord(ch) > 0x2E80 else size * 0.58
    return w


def chip(d, x, y, label, optional=False, h=44, size=16):
    w = tw(label, size) + 40
    if optional:
        d.rect(x, y, w, h, fill="none", stroke=LINE, r=10, dashed=True, sw=1.5)
    else:
        d.rect(x, y, w, h, fill=SURFACE, r=10)
    d.text(x, y, w, h, label, size, TEXT, bold=True, align="center", valign="middle")
    return w


def node(d, x, y, w, h, name, sub, fill=SURFACE, stroke="none", dashed=False):
    d.rect(x, y, w, h, fill=fill, stroke=stroke, dashed=dashed)
    d.text(x + 22, y + 20, w - 44, 24, name, S_NAME, TEXT, bold=True)
    for k, ln in enumerate(sub.split("\n")):
        d.text(x + 22, y + 52 + k * 26, w - 44, 20, ln, S_SUB, MUTED)


def architecture():
    d = D()
    W = 900
    LW, RX = 660, 684
    # philosophy
    d.text(0, 0, 400, 18, "思想", S_LABEL, MUTED, bold=True)
    node(d, 0, 28, W, 88, "Flow Design の思想・設計原則・美的基準", "特定の技術に依存しない",
         fill=ACCENT_SURFACE)
    top = 200
    d.line([(LW / 2, 124), (LW / 2, top - 36)])
    d.line([(RX + (W - RX) / 2, 124), (RX + (W - RX) / 2, top - 36)])
    d.text(0, top - 28, LW, 18, "Web の標準実装（React）", S_LABEL, MUTED, bold=True)
    d.text(RX, top - 28, W - RX, 18, "React 以外", S_LABEL, MUTED, bold=True)
    # roles
    bw, bh = (LW - 24) / 2, 236
    for x, name, sub, items, numbered in (
            (0, "AI スキル", "設計判断を担う", ["目的", "情報構造", "配置", "操作", "言葉"], False),
            (bw + 24, "独自 shadcn Registry", "品質を担保した実装を提供する",
             ["Foundation", "Components", "Patterns", "Pages"], True)):
        d.rect(x, top, bw, bh)
        d.text(x + 22, top + 20, bw - 44, 24, name, S_NAME, TEXT, bold=True)
        d.text(x + 22, top + 52, bw - 44, 20, sub, S_SUB, MUTED)
        for k, it in enumerate(items):
            yy = top + 92 + k * 28
            if numbered:
                d.text(x + 22, yy, 24, 20, str(k + 1), S_NUM, ACCENT, bold=True)
                d.text(x + 46, yy, bw - 68, 20, it, 16, TEXT)
            else:
                d.dot(x + 27, yy + 10, d=6, fill=BAR_STRONG, stroke="none")
                d.text(x + 46, yy, bw - 68, 20, it, 16, TEXT)
    node(d, RX, top, W - RX, 120, "他のフレームワーク", "思想を適用できる",
         fill="none", stroke=LINE, dashed=True)
    # product
    py = top + bh + 76
    for cx in (bw / 2, bw + 24 + bw / 2):
        d.line([(cx, top + bh + 8), (cx, py - 8)])
    d.text(bw + 24 + bw / 2 + 14, top + bh + 26, 300, 20, "shadcn add でコードをコピー", S_SUB, MUTED)
    node(d, 0, py, LW, 88, "製品のアプリケーション", "フレームワーク、ブランドカラー、フォントは製品ごとに選ぶ",
         fill="none", stroke=ACCENT)
    # technology layers
    ty = py + 88 + 72
    d.text(0, ty, 500, 18, "Registry と製品で使う技術", S_LABEL, MUTED, bold=True)
    d.rect(W - 250, ty - 2, 30, 22, fill="none", stroke=LINE, r=6, dashed=True, sw=1.5)
    d.text(W - 210, ty, 210, 18, "必要に応じて使う・標準候補", S_LABEL, MUTED)
    rows = [("言語と UI", [("TypeScript", 0), ("React", 0)]),
            ("部品", [("shadcn/ui", 0), ("Base UI", 0)]),
            ("スタイル", [("Tailwind CSS v4", 0), ("CSS Variables", 0)]),
            ("アイコン", [("Lucide", 0)]),
            ("動き", [("CSS Animation / Transition", 0), ("Motion", 1)]),
            ("グラフと表", [("Recharts", 1), ("TanStack Table", 1)]),
            ("検品", [("Playwright", 0)])]
    for i, (label, chips) in enumerate(rows):
        y = ty + 36 + i * 58
        if i:
            d.line([(0, y - 7), (W, y - 7)], color=BAR, arrow=False, sw=1)
        d.text(0, y, 160, 44, label, 16, TEXT, bold=True, valign="middle")
        x = 170
        for name, opt in chips:
            x += chip(d, x, y + 0, name, bool(opt)) + 14
    d.save("web-architecture")


def site():
    d = D()
    W, G = 900, 48
    w = (W - 2 * G) / 3
    nodes = [("ソースコード", "React・TypeScript・Vite"),
             ("GitHub Actions", "Vite でビルド\nPlaywright で検品"),
             ("GitHub Pages", "サイトを公開\nRegistry の JSON を配信")]
    for i, (n, s) in enumerate(nodes):
        x = i * (w + G)
        node(d, x, 0, w, 124, n, s, fill=ACCENT_SURFACE if i == 2 else SURFACE)
        if i:
            d.line([(x - G + 8, 62), (x - 8, 62)])
    d.text(w, 36, G, 18, "push", 14, MUTED, align="center")
    d.save("web-site")


# ---------------------------------------------------------------- 9 tokens
def tokens():
    d = D()
    W, BW, BH, GAP = 900, 620, 112, 48
    RX = 684
    d.text(0, 0, 400, 18, "トークンの 3 層", S_LABEL, MUTED, bold=True)
    d.text(RX, 0, W - RX, 18, "製品が上書きする値", S_LABEL, MUTED, bold=True)
    layers = [
        ("1", "Primitive", "元の値", "--fd-neutral-0〜900、--fd-radius-*\n--fd-font-sans、--spacing（4px）",
         "ニュートラルの色味\n角丸\nフォント"),
        ("2", "Semantic", "用途を表す名前", "--background、--primary、--muted-foreground\n--text-body、--radius-lg、--shadow-menu",
         "ブランドカラー\nダークモード（任意）"),
        ("3", "Component", "部品に固有の値", "--control-height、--table-row-height\n--focus-ring-width、--icon-stroke-width",
         "高密度の画面での高さ"),
    ]
    y = 28
    for i, (n, name, sub, ex, over) in enumerate(layers):
        block(d, 0, y, BW, BH, n, name, sub)
        for k, ln in enumerate(ex.split("\n")):
            d.text(250, y + 36 + k * 26, BW - 272, 20, ln, S_SUB, TEXT)
        lines = over.split("\n")
        oy = y + BH / 2 - (len(lines) * 26 - 6) / 2
        for k, ln in enumerate(lines):
            d.text(RX, oy + k * 26, W - RX, 20, ln, 16, TEXT)
        d.line([(RX - 12, y + BH / 2), (BW + 10, y + BH / 2)], color=ACCENT)
        if i < 2:
            d.line([(BW / 2, y + BH + 8), (BW / 2, y + BH + GAP - 8)])
        y += BH + GAP
    # utilities
    uy = 28 + 3 * BH + 2 * GAP
    d.line([(BW / 2, uy + 8), (BW / 2, uy + 44)])
    ly = uy + 52
    d.text(0, ly, 600, 18, "Tailwind CSS v4 のユーティリティ（@theme inline で公開）", S_LABEL, MUTED, bold=True)
    x = 0
    for c in ("bg-primary", "text-body", "rounded-lg", "shadow-menu", "h-control", "focus-ring"):
        x += chip(d, x, ly + 28, c) + 12
    cy = ly + 28 + 44
    d.line([(BW / 2, cy + 8), (BW / 2, cy + 44)])
    ny = cy + 52
    w2 = (W - 24) / 2
    node(d, 0, ny, w2, 112, "shadcn/ui のコンポーネント", "既存のクラスのまま動く\n高さとフォーカス表示は各部品の指定に従う")
    node(d, w2 + 24, ny, w2, 112, "Flow Design のコンポーネント", "Registry で配布する予定\n48px の高さ、2px のフォーカス表示",
         fill="none", stroke=ACCENT)
    d.save("tokens")


# ---------------------------------------------------------------- 10 button anatomy
BTN_FG = "light-dark(#FFFFFF,#0D1117)"
DANGER = "light-dark(#D32424,#DA3633)"


def plus_icon(d, cx, cy, half, color, sw):
    d.line([(cx - half, cy), (cx + half, cy)], color=color, arrow=False, sw=sw)
    d.line([(cx, cy - half), (cx, cy + half)], color=color, arrow=False, sw=sw)


def callout(d, n, x, y, tx, ty):
    d.line([(x, y), (tx, ty)], color=ACCENT, arrow=False, sw=1)
    d.dot(x, y, d=24, fill=ACCENT_SURFACE, stroke=ACCENT)
    d.text(x - 12, y - 12, 24, 24, n, 14, ACCENT, bold=True, align="center", valign="middle")


def button_anatomy():
    d = D()
    S = 2  # drawn at 2x
    bx, by, bh = 40, 70, 48 * S
    pad, icon, gap = 20 * S, 20 * S, 8 * S
    label = "顧客を追加"
    lw = 14 * S * len(label)
    bw = pad + icon + gap + lw + pad
    d.rect(bx - 4 * S, by - 4 * S, bw + 8 * S, bh + 8 * S, fill="none", stroke=ACCENT, r=18 * S, dashed=True, sw=1.5)
    d.rect(bx, by, bw, bh, fill=TEXT, r=14 * S)
    ix = bx + pad
    plus_icon(d, ix + icon / 2, by + bh / 2, 14, BTN_FG, 1.75 * S)
    d.text(ix + icon + gap, by, lw + 20, bh, label, 14 * S, BTN_FG, bold=True, valign="middle")
    ty = by - 4 * S - 2
    callout(d, "1", bx + bw - 24, 20, bx + bw - 24, ty)
    callout(d, "2", ix + icon / 2, 20, ix + icon / 2, ty)
    callout(d, "3", ix + icon + gap + lw / 2, 20, ix + icon + gap + lw / 2, ty)
    callout(d, "4", bx + bw + 56, by + bh / 2, bx + bw + 8, by + bh / 2)
    # icon only
    qy = by + bh + 64
    d.rect(bx, qy, bh, bh, fill="none", stroke=LINE, r=14 * S, sw=1.5)
    cx, cy = bx + bh / 2, qy + bh / 2
    d.dot(cx - 4, cy - 4, d=22, fill="none", stroke=TEXT)
    d.line([(cx + 5, cy + 5), (cx + 14, cy + 14)], color=TEXT, arrow=False, sw=3.5)
    d.text(bx + bh + 28, qy + 22, 340, 24, "アイコンだけのボタン", S_NAME, TEXT, bold=True)
    d.text(bx + bh + 28, qy + 54, 340, 20, "48 × 48px。aria-label が必須", S_SUB, MUTED)
    # legend
    LX = 580
    rows = [("1", "コンテナ", "高さ 48px、角丸 14px\n左右の余白 20px、影なし"),
            ("2", "アイコン（任意）", "20px、線の太さ 1.75\n文字との間隔 8px"),
            ("3", "ラベル", "14px、太さ 500\n押した結果がわかる言葉"),
            ("4", "フォーカスの枠", "2px、2px 離す\nキーボード操作のときだけ")]
    for i, (n, name, sub) in enumerate(rows):
        y = 8 + i * 92
        d.text(LX, y + 2, 24, 20, n, S_NUM, ACCENT, bold=True)
        d.text(LX + 30, y, 300, 24, name, S_NAME, TEXT, bold=True)
        for k, ln in enumerate(sub.split("\n")):
            d.text(LX + 30, y + 30 + k * 24, 300, 20, ln, S_SUB, MUTED)
    d.save("button-anatomy")


# ---------------------------------------------------------------- 11 button hierarchy
def button_hierarchy():
    d = D()
    cw, bw, bh = 146, 124, 56
    items = [("Primary", "最も重要な操作", "保存"), ("Secondary", "次に重要な操作", "下書き"),
             ("Outline", "範囲を示す補助操作", "書き出す"), ("Ghost", "控えめ・繰り返す", "編集"),
             ("Link", "文章中の操作", "詳細")]
    right = 4 * cw + bw
    d.text(0, 0, 200, 18, "目立つ", S_LABEL, MUTED, bold=True)
    d.text(right - 200, 0, 200, 18, "控えめ", S_LABEL, MUTED, bold=True, align="right")
    d.line([(64, 9), (right - 64, 9)])
    by = 44
    for i, (name, use, label) in enumerate(items):
        x = i * cw
        fg = TEXT
        if name == "Primary":
            d.rect(x, by, bw, bh, fill=TEXT, r=14)
            fg = BTN_FG
        elif name == "Secondary":
            d.rect(x, by, bw, bh, fill=SURFACE, r=14)
        elif name == "Outline":
            d.rect(x, by, bw, bh, fill="none", stroke=LINE, r=14, sw=1.5)
        st = (f"text;html=0;align=center;verticalAlign=middle;spacing=0;{FONT}fontSize=17;"
              f"fontColor={fg};fontStyle={4 if name == 'Link' else 1};")
        d.cells.append(f'<mxCell id="{d.id()}" value="{label}" style="{st}" vertex="1" parent="1">'
                       f'<mxGeometry x="{x}" y="{by}" width="{bw}" height="{bh}" as="geometry"/></mxCell>')
        d.text(x, by + bh + 20, bw, 24, name, S_NAME, TEXT, bold=True, align="center")
        d.text(x - 10, by + bh + 48, bw + 20, 20, use, S_SUB, MUTED, align="center")
    x = 5 * cw + 40
    d.line([(x - 22, 0), (x - 22, by + bh + 68)], color=BAR, arrow=False, sw=1)
    d.text(x, 0, 160, 18, "重要度とは別", S_LABEL, MUTED, bold=True)
    d.rect(x, by, bw, bh, fill=DANGER, r=14)
    d.text(x, by, bw, bh, "削除", 17, "#FFFFFF", bold=True, align="center", valign="middle")
    d.text(x - 10, by + bh + 20, bw + 20, 24, "Destructive", S_NAME, TEXT, bold=True, align="center")
    d.text(x - 20, by + bh + 48, bw + 40, 20, "危険な操作", S_SUB, MUTED, align="center")
    d.save("button-hierarchy")


for f in (journey, principles, wording, layout, visual, process, architecture, site, tokens,
          button_anatomy, button_hierarchy):
    f()
print("ok")
