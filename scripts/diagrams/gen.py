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


# ---------------------------------------------------------------- 12 field anatomy
def field_anatomy():
    d = D()
    S = 1.5
    x0, y0 = 64, 20
    d.text(x0, y0, 400, 30, "メールアドレス", 14 * S, TEXT, bold=True, valign="middle")
    iy = y0 + 30 + 8 * S
    iw, ih = 420, 48 * S
    d.rect(x0, iy, iw, ih, fill="none", stroke=DANGER, r=12 * S, sw=1.5)
    d.text(x0 + 16 * S, iy, iw - 48, ih, "yamada@", 16 * S, TEXT, valign="middle")
    dy = iy + ih + 8 * S
    d.text(x0, dy, 420, 30, "請求書の送付先になる", 14 * S, MUTED, valign="middle")
    ey = dy + 30 + 8 * S
    d.dot(x0 + 10, ey + 15, d=18, fill="none", stroke=DANGER)
    d.text(x0 + 28, ey, 420, 30, "「@」の後にドメイン名を入力してください", 14 * S, DANGER, valign="middle")
    # callouts on the left edge
    for n, y in (("1", y0 + 15), ("2", iy + ih / 2), ("3", dy + 15), ("4", ey + 15)):
        d.line([(x0 - 26, y), (x0 - 8, y)], color=ACCENT, arrow=False, sw=1)
        d.dot(x0 - 38, y, d=24, fill=ACCENT_SURFACE, stroke=ACCENT)
        d.text(x0 - 50, y - 12, 24, 24, n, 14, ACCENT, bold=True, align="center", valign="middle")
    LX = 560
    rows = [("1", "FieldLabel", "14px、太さ 500\n必須・任意の印はフォームで決める"),
            ("2", "入力欄", "高さ 48px、角丸 12px、余白 16px\n文字 16px。エラーは枠を destructive"),
            ("3", "FieldDescription（任意）", "14px、muted-foreground\n入力の前に知っておくこと"),
            ("4", "FieldError", "14px、アイコンと文字\n原因と直し方を示す")]
    for i, (n, name, sub) in enumerate(rows):
        y = i * 92
        d.text(LX, y + 2, 24, 20, n, S_NUM, ACCENT, bold=True)
        d.text(LX + 30, y, 320, 24, name, S_NAME, TEXT, bold=True)
        for k, ln in enumerate(sub.split("\n")):
            d.text(LX + 30, y + 30 + k * 24, 330, 20, ln, S_SUB, MUTED)
    d.text(x0, ey + 70, 480, 20, "各部分の間隔は 8px。関連付けは Field が自動で行う", S_SUB, MUTED)
    d.save("field-anatomy")


# ---------------------------------------------------------------- 13 form choice
def form_choice():
    d = D()
    W = 900
    d.text(0, 0, 400, 18, "選ぶ内容", S_LABEL, MUTED, bold=True)
    d.text(520, 0, 300, 18, "使うコンポーネント", S_LABEL, MUTED, bold=True)
    rows = [("1 つを選ぶ", "選択肢が 2 つでも同じ", "Select", "select", False),
            ("複数を選ぶ、同意する", "確認事項にも使う", "Checkbox", "checkbox", False),
            ("ON/OFF を保存ボタンで反映する", "フォームの一部として送信する", "Checkbox", "checkbox", False),
            ("ON/OFF を押した時点で反映する", "保存ボタンがない設定", "Switch", "switch", False),
            ("既存の画面と表現をそろえる", "新しいフォームでは使わない", "Radio Group", "radio", True)]
    for i, (q, sub, comp, kind, dashed) in enumerate(rows):
        y = 32 + i * 88
        d.text(0, y + 12, 440, 24, q, S_NAME, TEXT, bold=True)
        d.text(0, y + 42, 440, 20, sub, S_SUB, MUTED)
        d.line([(452, y + 36), (508, y + 36)])
        d.rect(520, y, 380, 72, fill="none" if dashed else SURFACE, stroke=LINE if dashed else "none", dashed=dashed)
        cx, cy = 548, y + 36
        if kind == "select":
            d.rect(cx - 8, cy - 14, 64, 28, fill="none", stroke=LINE, r=8, sw=1.5)
            d.line([(cx + 40, cy - 3), (cx + 45, cy + 2), (cx + 50, cy - 3)], color=TEXT, arrow=False, sw=1.5)
        elif kind == "checkbox":
            d.rect(cx, cy - 10, 20, 20, fill=TEXT, r=4)
            d.line([(cx + 5, cy), (cx + 9, cy + 4), (cx + 15, cy - 4)], color=BTN_FG, arrow=False, sw=2)
        elif kind == "switch":
            d.rect(cx, cy - 14, 44, 28, fill=TEXT, r=14)
            d.dot(cx + 30, cy, d=20, fill=BTN_FG, stroke="none")
        else:
            d.dot(cx + 10, cy, d=20, fill="none", stroke=LINE)
            d.dot(cx + 10, cy, d=9, fill=TEXT, stroke="none")
        d.text(cx + 76, y, 260, 72, comp, S_NAME, TEXT, bold=True, valign="middle")
    d.save("form-choice")


# ---------------------------------------------------------------- 14 form validation
def form_validation():
    d = D()
    steps = [("入力中", "エラーを出さない"), ("フォーカスが外れた", "その項目を検証する"),
             ("エラーの表示中に入力", "入力ごとに再検証する"), ("送信", "すべて検証し、概要を出す")]
    sp = 232
    xs = [100 + i * sp for i in range(4)]
    dy = 14
    for i, (ja, sub) in enumerate(steps):
        cx = xs[i]
        d.dot(cx, dy, fill=ACCENT if i == 3 else "none", stroke=ACCENT if i in (1, 3) else LINE)
        d.text(cx - 110, dy + 26, 220, 24, ja, S_NAME, TEXT, bold=True, align="center")
        d.text(cx - 110, dy + 56, 220, 20, sub, S_SUB, MUTED, align="center")
    for i in range(3):
        d.line([(xs[i] + 9, dy), (xs[i + 1] - 9, dy)])
    ey = 120
    d.text(0, ey, 300, 18, "例外", S_LABEL, MUTED, bold=True)
    for i, (name, sub) in enumerate((("文字数の上限", "入力中に知らせる"),
                                      ("IME で変換中", "確定するまで検証しない"),
                                      ("選択式（Select、Checkbox）", "送信時に検証し、選び直すと再検証"))):
        x = i * 304
        d.rect(x, ey + 28, 288, 84)
        d.text(x + 22, ey + 46, 250, 24, name, S_NAME, TEXT, bold=True)
        d.text(x + 22, ey + 76, 250, 20, sub, S_SUB, MUTED)
    d.save("form-validation")


# ---------------------------------------------------------------- 15 feedback choice
SUCCESS_C = "light-dark(#15803D,#3FB950)"
WARNING_C = "light-dark(#B45309,#D29922)"
INFO_C = "light-dark(#2563EB,#4493F8)"


def feedback_choice():
    d = D()
    d.text(0, 0, 400, 18, "伝えたいこと", S_LABEL, MUTED, bold=True)
    d.text(520, 0, 300, 18, "使うコンポーネント", S_LABEL, MUTED, bold=True)
    rows = [("現在の状態・分類", "短い文字で", "Badge", "badge"),
            ("人物・組織", "名前の横で識別する", "Avatar", "avatar"),
            ("補足", "なくても操作できる情報", "Tooltip", "tooltip"),
            ("継続して示す重要な情報", "注意、エラー、次の操作", "Alert", "alert"),
            ("一時的な操作の結果", "数秒で消えてよい情報", "Toast", "toast"),
            ("読み込み中の画面の構造", "読み込み後と同じ形", "Skeleton", "skeleton"),
            ("処理の進み具合", "実際の進捗率と件数", "Progress", "progress")]
    for i, (q, sub, comp, kind) in enumerate(rows):
        y = 32 + i * 80
        d.text(0, y + 8, 440, 24, q, S_NAME, TEXT, bold=True)
        d.text(0, y + 38, 440, 20, sub, S_SUB, MUTED)
        d.line([(452, y + 32), (508, y + 32)])
        d.rect(520, y, 380, 64)
        cx, cy = 544, y + 32
        if kind == "badge":
            d.rect(cx, cy - 11, 56, 22, fill="none", stroke=SUCCESS_C, r=11, sw=1)
            d.text(cx, cy - 11, 56, 22, "完了", 12, SUCCESS_C, bold=True, align="center", valign="middle")
        elif kind == "avatar":
            d.dot(cx + 16, cy, d=32, fill=BAR, stroke="none")
            d.text(cx, cy - 16, 32, 32, "山", 13, MUTED, bold=True, align="center", valign="middle")
        elif kind == "tooltip":
            d.rect(cx, cy - 13, 56, 26, fill=TEXT, r=6)
            d.text(cx, cy - 13, 56, 26, "編集", 12, BTN_FG, bold=True, align="center", valign="middle")
        elif kind == "alert":
            d.rect(cx, cy - 16, 56, 32, fill="none", stroke=BAR, r=8, sw=1)
            d.dot(cx + 14, cy, d=12, fill="none", stroke=WARNING_C)
            d.bar(cx + 26, cy - 3, 22, 6, fill=BAR_STRONG)
        elif kind == "toast":
            d.rect(cx, cy - 16, 56, 32, fill=SURFACE, stroke=BAR, r=8, sw=1)
            d.dot(cx + 14, cy, d=12, fill="none", stroke=SUCCESS_C)
            d.bar(cx + 26, cy - 3, 22, 6, fill=BAR_STRONG)
        elif kind == "skeleton":
            d.dot(cx + 10, cy, d=20, fill=BAR, stroke="none")
            d.bar(cx + 26, cy - 8, 30, 6)
            d.bar(cx + 26, cy + 3, 20, 6)
        else:
            d.bar(cx, cy - 4, 56, 8)
            d.bar(cx, cy - 4, 34, 8, fill=TEXT)
        d.text(cx + 76, y, 260, 64, comp, S_NAME, TEXT, bold=True, valign="middle")
    d.save("feedback-choice")


# ---------------------------------------------------------------- 16 toast timing
def toast_timing():
    d = D()
    X0, W = 170, 700
    sec = W / 8  # 8 seconds on the axis
    d.text(0, 0, 400, 18, "表示時間", S_LABEL, MUTED, bold=True)
    rows = [("Success", 4, SUCCESS_C, "4 秒"), ("Info", 5, INFO_C, "5 秒"),
            ("Warning", 6, WARNING_C, "6 秒"), ("Destructive", None, DANGER, "閉じるまで"),
            ("操作つき", None, TEXT, "閉じるまで")]
    for i, (name, s, color, label) in enumerate(rows):
        y = 34 + i * 52
        d.text(0, y, 160, 28, name, S_NAME, TEXT, bold=True, valign="middle")
        if s:
            d.bar(X0, y + 10, s * sec, 8, fill=color)
            d.text(X0 + s * sec + 12, y, 200, 28, label, S_SUB, MUTED, valign="middle")
        else:
            d.bar(X0, y + 10, W - 40, 8, fill=color)
            d.line([(X0 + W - 36, y + 14), (X0 + W, y + 14)], color=color, arrow=True)
            d.text(X0 + W - 200, y - 18, 200, 20, label, S_SUB, MUTED, align="right")
    ay = 34 + 5 * 52 + 4
    d.line([(X0, ay), (X0 + W, ay)], color=BAR, arrow=False, sw=1)
    for s in range(0, 9, 2):
        d.text(X0 + s * sec - 20, ay + 6, 40, 18, f"{s}s", 13, MUTED, align="center")
    py = ay + 52
    d.rect(0, py, 900, 76)
    d.text(22, py + 16, 860, 24, "ポインターを重ねている間と、フォーカスがある間は、タイマーを止める", S_NAME, TEXT, bold=True)
    d.text(22, py + 46, 860, 20, "同じ id の通知は新しく増やさず更新する。同じ処理の失敗は 1 つにまとめる", S_SUB, MUTED)
    d.save("toast-timing")


# ---------------------------------------------------------------- 17 progress states
def progress_states():
    d = D()
    W = 900
    rows = [("0%", 0, TEXT, "aria-valuenow=0"), ("途中", 0.45, TEXT, "実際に処理した量から"),
            ("完了", 1, TEXT, "実際に完了したときだけ 100%"), ("不明", None, TEXT, "aria-valuenow を出さない"),
            ("失敗", 0.62, DANGER, "色、アイコン、文字で示す"), ("中断", 0.3, BAR_STRONG, "完了と失敗と区別する")]
    for i, (name, v, color, note) in enumerate(rows):
        y = i * 60
        d.text(0, y, 120, 28, name, S_NAME, TEXT, bold=True, valign="middle")
        bx, bw = 130, 460
        d.bar(bx, y + 10, bw, 8)
        if v is None:
            d.bar(bx + bw / 3, y + 10, bw / 3, 8, fill=color)
        elif v > 0:
            d.bar(bx, y + 10, bw * v, 8, fill=color)
        d.text(bx + bw + 24, y, 300, 28, note, S_SUB, MUTED, valign="middle")
    d.text(0, 6 * 60 + 8, W, 20, "時間の経過で進めた見せかけの進捗率は使わない", S_SUB, MUTED)
    d.save("progress-states")
# ---------------------------------------------------------------- 15 navigation & layout
def num(d, n, cx, cy):
    d.dot(cx, cy, d=24, fill=ACCENT_SURFACE, stroke=ACCENT)
    d.text(cx - 12, cy - 12, 24, 24, n, 14, ACCENT, bold=True, align="center", valign="middle")


def legend(d, x, y, rows, step=78, width=320):
    for i, (n, name, sub) in enumerate(rows):
        ty = y + i * step
        d.text(x, ty + 2, 24, 20, n, S_NUM, ACCENT, bold=True)
        d.text(x + 30, ty, width, 24, name, S_NAME, TEXT, bold=True)
        for k, ln in enumerate(sub.split("\n")):
            d.text(x + 30, ty + 30 + k * 22, width, 20, ln, S_SUB, MUTED)


def mini_sidebar(d, x, y, w, h, collapsed=False, items=6):
    d.rect(x, y, w, h, fill=SURFACE, r=0)
    if collapsed:
        d.rect(x + w / 2 - 9, y + 16, 18, 18, fill=BAR_STRONG, r=5)
        for i in range(items):
            cy = y + 60 + i * 30
            if i == 1:
                d.rect(x + 6, cy - 12, w - 12, 24, fill=BAR, r=6)
            d.rect(x + w / 2 - 6, cy - 6, 12, 12, fill=BAR_STRONG, r=3)
        return
    d.rect(x + 14, y + 16, 18, 18, fill=BAR_STRONG, r=5)
    d.bar(x + 40, y + 21, w - 70, 8, fill=BAR_STRONG)
    for i in range(items):
        cy = y + 60 + i * 30
        if i == 1:
            d.rect(x + 8, cy - 12, w - 16, 24, fill=BAR, r=6)
        d.rect(x + 16, cy - 6, 12, 12, fill=BAR_STRONG, r=3)
        d.bar(x + 36, cy - 4, (w - 70) * (0.9 if i == 1 else 0.6 + 0.08 * (i % 3)), 8,
              fill=BAR_STRONG if i == 1 else BAR)


def nav_structure():
    d = D()
    W, H = 620, 440
    d.rect(0, 0, W, H, fill="none", stroke=LINE, r=18, sw=1)
    sw = 150
    d.cells.append(
        f'<mxCell id="{d.id()}" value="" style="rounded=1;absoluteArcSize=1;arcSize=36;html=0;fillColor={SURFACE};'
        f'strokeColor=none;" vertex="1" parent="1"><mxGeometry x="0.75" y="0.75" width="{sw}" height="{H - 1.5}" as="geometry"/></mxCell>')
    d.rect(sw - 20, 0.75, 20, H - 1.5, fill=SURFACE, r=0)
    mini_sidebar(d, 0.75, 10, sw - 0.75, 260, items=7)
    mx = sw + 28
    # header: trigger + breadcrumb
    d.rect(mx, 22, 22, 22, fill="none", stroke=BAR_STRONG, r=6, sw=1.5)
    d.line([(mx + 36, 22), (mx + 36, 44)], color=BAR, arrow=False, sw=1)
    d.bar(mx + 50, 29, 40, 8)
    d.bar(mx + 100, 29, 60, 8)
    d.bar(mx + 170, 29, 90, 8, fill=BAR_STRONG)
    # page title + primary action
    d.bar(mx, 84, 190, 20, fill=BAR_STRONG)
    d.rect(W - 28 - 120, 78, 120, 34, fill=TEXT, r=10)
    # toolbar
    d.rect(mx, 140, 170, 32, fill="none", stroke=LINE, r=9, sw=1)
    d.rect(mx + 184, 140, 110, 32, fill="none", stroke=LINE, r=9, sw=1)
    # main content
    cy0 = 200
    for i in range(6):
        y = cy0 + i * 36
        d.bar(mx, y + 12, 120, 8, fill=BAR_STRONG if i == 0 else BAR)
        d.bar(mx + 170, y + 12, 80, 8, fill=BAR_STRONG if i == 0 else BAR)
        d.bar(mx + 290, y + 12, 100, 8, fill=BAR_STRONG if i == 0 else BAR)
        if i < 5:
            d.line([(mx, y + 32), (W - 28, y + 32)], color=BAR, arrow=False, sw=1)
    num(d, "1", 24, H - 30)
    num(d, "2", W - 30, 33)
    num(d, "3", mx + 214, 94)
    num(d, "4", W - 28 - 120 - 22, 95)
    num(d, "5", mx + 318, 156)
    num(d, "6", W - 30, cy0 + 100)
    legend(d, 680, 0, [
        ("1", "Sidebar", "主要な機能へのナビゲーション"),
        ("2", "Header", "現在位置、Sidebar の開閉、共通の操作"),
        ("3", "Page Title", "この画面の目的"),
        ("4", "Primary Action", "この画面の主要な操作"),
        ("5", "Toolbar", "検索、絞り込み、並び替え"),
        ("6", "Main Content", "情報と操作の対象"),
    ], step=74)
    d.save("nav-structure")


def sidebar_states():
    d = D()
    PW, PH = 280, 300
    cols = [("展開", "幅 240px。初期状態"), ("折りたたみ", "幅 64px。アイコンと名前（支援技術）"),
            ("モバイル（768px 未満）", "常に表示しない。ボタンで Sheet を開く")]
    for i, (name, sub) in enumerate(cols):
        x = i * (PW + 40)
        if i < 2:
            d.rect(x, 0, PW, PH, fill="none", stroke=LINE, r=16, sw=1)
            w = 120 if i == 0 else 32
            mini_sidebar(d, x + 0.75, 0.75 + 8, w, 230, collapsed=(i == 1))
            d.rect(x + 0.75, 0.75, w, 8, fill=SURFACE, r=0)
            d.rect(x + 0.75, 238, w, PH - 239.5, fill=SURFACE, r=0)
            mx = x + w + 20
            d.bar(mx, 26, 110, 14, fill=BAR_STRONG)
            for k in range(5):
                d.bar(mx, 66 + k * 26, PW - w - 50 - (k % 2) * 30, 8)
            # width marker
            d.line([(x + 0.75, PH + 18), (x + w, PH + 18)], color=ACCENT, arrow=False, sw=1.5)
            d.line([(x + 0.75, PH + 12), (x + 0.75, PH + 24)], color=ACCENT, arrow=False, sw=1.5)
            d.line([(x + w, PH + 12), (x + w, PH + 24)], color=ACCENT, arrow=False, sw=1.5)
            d.text(x + w + 8, PH + 8, 80, 20, "240px" if i == 0 else "64px", S_SUB, ACCENT, bold=True)
        else:
            fx, fw = x + 60, 160
            d.rect(fx, 0, fw, PH, fill="none", stroke=LINE, r=22, sw=1)
            d.rect(fx + 1, 1, fw - 2, PH - 2, fill=BAR, r=21, opacity=60)
            sw2 = 118
            mini_sidebar(d, fx + 1, 9, sw2, 230, items=6)
            d.rect(fx + 1, 1, sw2, 8, fill=SURFACE, r=0)
            d.rect(fx + 1, 238, sw2, PH - 239, fill=SURFACE, r=0)
            d.text(fx + sw2 - 24, 14, 20, 20, "×", 16, TEXT, bold=True, align="center", valign="middle")
            d.text(fx - 60, PH + 8, 280, 20, "背景の操作を止める・Escape で閉じる", S_SUB, ACCENT, bold=True, align="center")
        d.text(x, PH + 44, PW, 24, name, S_NAME, TEXT, bold=True, align="center")
        d.text(x - 10, PH + 74, PW + 20, 20, sub, S_SUB, MUTED, align="center")
    d.line([(PW + 4, PH / 2), (PW + 36, PH / 2)])
    d.save("sidebar-states")


def tabs_sidebar():
    d = D()
    # left: sidebar = different functions
    d.text(0, 0, 380, 18, "Sidebar", S_LABEL, MUTED, bold=True)
    d.text(0, 26, 380, 24, "別の機能へ移動する", S_NAME, TEXT, bold=True)
    items = ["顧客", "契約", "請求書", "設定"]
    for i, it in enumerate(items):
        y = 70 + i * 52
        if i == 0:
            d.rect(0, y, 300, 44, fill=BAR, r=8)
        else:
            d.rect(0, y, 300, 44, fill=SURFACE, r=8)
        d.rect(16, y + 14, 16, 16, fill=BAR_STRONG, r=4)
        d.text(46, y, 200, 44, it, 16, TEXT, bold=(i == 0), valign="middle")
    d.text(0, 290, 380, 20, "機能ごとに、別の画面になる", S_SUB, MUTED)
    # right: tabs = same object
    X = 400
    d.text(X, 0, 460, 18, "Tabs", S_LABEL, MUTED, bold=True)
    d.text(X, 26, 460, 24, "同じ対象の情報を切り替える", S_NAME, TEXT, bold=True)
    d.rect(X, 70, 460, 214, fill="none", stroke=LINE, r=16, sw=1)
    d.text(X + 24, 88, 400, 28, "株式会社山田商事", 20, TEXT, bold=True)
    tabs = ["概要", "契約", "請求", "活動履歴"]
    tx = X + 24
    for i, t in enumerate(tabs):
        w = tw(t, 15)
        d.text(tx, 132, w + 4, 24, t, 15, TEXT if i == 0 else MUTED, bold=True)
        if i == 0:
            d.rect(tx, 160, w, 3, fill=TEXT, r=1)
        tx += w + 24
    d.line([(X + 24, 163), (X + 436, 163)], color=BAR, arrow=False, sw=1)
    for k in range(3):
        d.bar(X + 24, 188 + k * 26, 300 - k * 60, 8)
    d.text(X, 290, 460, 20, "画面は同じ。対象（山田商事）は変わらない", S_SUB, MUTED)
    d.save("tabs-sidebar")


def chevron(d, x, cy, color=MUTED):
    d.line([(x, cy - 5), (x + 5, cy), (x, cy + 5)], color=color, arrow=False, sw=1.5)


def house(d, x, y, color=MUTED):
    d.line([(x, y + 7), (x + 8, y), (x + 16, y + 7)], color=color, arrow=False, sw=1.5)
    d.line([(x + 3, y + 5), (x + 3, y + 15), (x + 13, y + 15), (x + 13, y + 5)], color=color, arrow=False, sw=1.5)


def crumb_row(d, x, y, parts, current):
    house(d, x, y + 3)
    cx = x + 30
    for p in parts:
        chevron(d, cx, y + 11)
        cx += 16
        if p == "…":
            for k in range(3):
                d.dot(cx + 4 + k * 7, y + 11, d=4, fill=MUTED, stroke="none")
            cx += 34
            continue
        w = tw(p, 15) + 4
        d.text(cx, y, w, 22, p, 15, MUTED, valign="middle")
        cx += w + 12
    chevron(d, cx, y + 11)
    cx += 16
    d.text(cx, y, tw(current, 15) + 8, 22, current, 15, TEXT, bold=True, valign="middle")


def breadcrumb_hierarchy():
    d = D()
    d.text(0, 0, 360, 18, "情報の階層", S_LABEL, MUTED, bold=True)
    levels = ["ホーム", "顧客", "株式会社山田商事", "契約", "C-2026-0142"]
    for i, lv in enumerate(levels):
        x, y = i * 28, 36 + i * 44
        last = i == len(levels) - 1
        if i > 0:
            d.line([((i - 1) * 28 + 8, y - 26), ((i - 1) * 28 + 8, y + 11), (x - 4, y + 11)], arrow=False)
        d.dot(x + 8, y + 11, d=12, fill=ACCENT if last else "none", stroke=ACCENT if last else LINE)
        d.text(x + 22, y, 260, 22, lv + ("（現在位置）" if last else ""), 16, TEXT, bold=last, valign="middle")
    X = 420
    d.text(X, 0, 460, 18, "Breadcrumb", S_LABEL, MUTED, bold=True)
    d.text(X, 36, 200, 20, "標準", S_SUB, MUTED)
    crumb_row(d, X, 62, ["顧客", "株式会社山田商事", "契約"], "C-2026-0142")
    d.text(X, 118, 300, 20, "深い階層：間を省略し、直近の親を残す", S_SUB, MUTED)
    crumb_row(d, X, 144, ["…", "契約"], "C-2026-0142")
    d.text(X, 200, 300, 20, "浅い階層：戻るリンクでもよい", S_SUB, MUTED)
    d.line([(X + 14, 237), (X, 237)], color=MUTED, sw=1.5)
    d.text(X + 24, 226, 200, 22, "顧客一覧へ戻る", 15, MUTED, valign="middle")
    d.text(0, 272, 880, 20, "閲覧の履歴ではなく、情報の階層を表す。上位の階層はリンク、現在位置は文字（aria-current=\"page\"）", S_SUB, MUTED)
    d.save("breadcrumb-hierarchy")


def separation_order():
    d = D()
    names = [("1", "余白"), ("2", "文字の強弱"), ("3", "薄い境界線"), ("4", "背景色"), ("5", "Card")]
    cw, g = 160, 20
    total = 5 * cw + 4 * g
    d.text(0, 0, 200, 18, "まず検討する", S_LABEL, MUTED, bold=True)
    d.text(total - 200, 0, 200, 18, "最後に使う", S_LABEL, MUTED, bold=True, align="right")
    d.line([(110, 9), (total - 100, 9)])
    y0 = 40
    for i, (n, name) in enumerate(names):
        x = i * (cw + g)
        d.rect(x, y0, cw, 170, fill="none", stroke=BAR, r=14, sw=1)
        ix, iy = x + 20, y0 + 22
        if i == 0:
            for gy in (iy, iy + 74):
                d.bar(ix, gy, 60, 8, fill=BAR_STRONG)
                d.bar(ix, gy + 18, 110, 6)
                d.bar(ix, gy + 32, 84, 6)
        elif i == 1:
            d.bar(ix, iy, 100, 16, fill=BAR_STRONG)
            d.bar(ix, iy + 34, 110, 6)
            d.bar(ix, iy + 48, 84, 6)
            d.bar(ix, iy + 74, 60, 8, fill=BAR_STRONG)
            d.bar(ix, iy + 92, 110, 6)
        elif i == 2:
            d.bar(ix, iy, 60, 8, fill=BAR_STRONG)
            d.bar(ix, iy + 18, 110, 6)
            d.line([(ix, iy + 50), (ix + 120, iy + 50)], color=LINE, arrow=False, sw=1)
            d.bar(ix, iy + 74, 60, 8, fill=BAR_STRONG)
            d.bar(ix, iy + 92, 110, 6)
        elif i == 3:
            for gy in (iy - 6, iy + 64):
                d.rect(ix - 8, gy, 136, 58, fill=SURFACE, r=8)
                d.bar(ix, gy + 12, 60, 8, fill=BAR_STRONG)
                d.bar(ix, gy + 30, 100, 6)
        else:
            d.rect(ix - 4, iy - 4, 128, 120, fill="none", stroke=LINE, r=12, sw=1)
            d.bar(ix + 10, iy + 12, 60, 6)
            d.bar(ix + 10, iy + 36, 90, 18, fill=BAR_STRONG)
            d.bar(ix + 10, iy + 70, 70, 6)
        d.text(x, y0 + 186, cw, 22, f"{n} {name}", S_NAME, TEXT, bold=True, align="center")
    d.text(0, y0 + 226, total, 20, "前の方法で区別できる場合は、次の方法を足さない。Card は独立して読まれる情報だけに使う", S_SUB, MUTED, align="center")
    d.save("separation-order")


def content_width():
    d = D()
    rows = [("データ一覧・テーブル", "制限なし", None), ("ダッシュボード", "1440px", 1440),
            ("一般的な詳細画面", "960px", 960), ("入力フォーム・設定", "640px", 640), ("ログイン・認証", "400px", 400)]
    scale = 0.36
    LX, BX = 0, 230
    for i, (name, val, px) in enumerate(rows):
        y = i * 56
        d.text(LX, y, 220, 36, name, S_NAME, TEXT, bold=True, valign="middle")
        if px is None:
            w = 1440 * scale + 120
            d.rect(BX, y + 6, w - 40, 24, fill=BAR, r=6)
            d.line([(BX + w - 40, y + 18), (BX + w, y + 18)], color=ACCENT, dashed=True)
        else:
            w = px * scale
            d.rect(BX, y + 6, w, 24, fill=BAR, r=6)
        d.text(BX + w + 12, y, 120, 36, val, S_SUB, ACCENT, bold=True, valign="middle")
    d.text(0, 5 * 56 + 6, 900, 20, "初期の基準。読みやすさと作業の効率から、画面ごとに調整する", S_SUB, MUTED)
    d.save("content-width")


# ---------------------------------------------------------------- 18-22 overlays
SCRIM = "#000000"


def screen(d, x, y, w, h, kind):
    """small screen glyph used by the overlay diagrams"""
    d.rect(x, y, w, h, fill="none", stroke=LINE, r=8, sw=1.5)
    if kind in ("dialog", "alert"):
        d.rect(x + 1, y + 1, w - 2, h - 2, fill=SCRIM, r=7, opacity=18)
        bw, bh = w * 0.6, h * 0.6
        bx, by = x + (w - bw) / 2, y + (h - bh) / 2
        d.rect(bx, by, bw, bh, fill="light-dark(#FFFFFF,#0D1117)", stroke=LINE, r=6, sw=1)
        d.bar(bx + 7, by + 7, bw * 0.5, 5, fill=BAR_STRONG)
        d.bar(bx + bw - 25, by + bh - 11, 18, 6, fill=DANGER if kind == "alert" else TEXT)
    elif kind == "popover":
        d.bar(x + 10, y + 8, 26, 7, fill=BAR_STRONG)
        d.rect(x + 10, y + 20, w * 0.52, h - 28, fill="none", stroke=LINE, r=5, sw=1)
        d.bar(x + 17, y + 28, w * 0.3, 5)
        d.bar(x + 17, y + 38, w * 0.24, 5)
    elif kind == "menu":
        d.bar(x + w - 30, y + 8, 20, 7, fill=BAR_STRONG)
        mx = x + w - 10 - w * 0.46
        d.rect(mx, y + 20, w * 0.46, h - 26, fill="none", stroke=LINE, r=5, sw=1)
        for k in range(3):
            d.bar(mx + 6, y + 27 + k * 9, w * 0.28, 4, fill=DANGER if k == 2 else BAR)
    elif kind == "sheet":
        for k in range(4):
            d.bar(x + 8, y + 10 + k * 11, w * 0.4, 5)
        d.line([(x + w * 0.56, y + 1), (x + w * 0.56, y + h - 1)], color=LINE, arrow=False, sw=1)
        d.bar(x + w * 0.56 + 7, y + 10, w * 0.26, 6, fill=BAR_STRONG)
        d.bar(x + w * 0.56 + 7, y + 22, w * 0.3, 5)
    elif kind == "drawer":
        d.rect(x + 1, y + 1, w - 2, h - 2, fill=SCRIM, r=7, opacity=18)
        d.rect(x + 1, y + h * 0.5, w - 2, h * 0.5 - 1, fill="light-dark(#FFFFFF,#0D1117)", stroke=LINE, r=7, sw=1)
        d.bar(x + w / 2 - 8, y + h * 0.5 + 5, 16, 3, fill=BAR_STRONG)
        d.bar(x + 8, y + h * 0.5 + 14, w * 0.4, 5, fill=BAR_STRONG)
    else:  # page
        d.bar(x + 8, y + 9, w * 0.5, 7, fill=BAR_STRONG)
        for k in range(3):
            d.bar(x + 8, y + 24 + k * 10, w * (0.8 - k * 0.15), 5)


def overlay_choice():
    d = D()
    d.text(0, 0, 400, 18, "目的", S_LABEL, MUTED, bold=True)
    d.text(520, 0, 300, 18, "使うもの", S_LABEL, MUTED, bold=True)
    rows = [("短い入力・編集", "数項目で終わる", "Dialog", "dialog"),
            ("重要な判断・危険な操作", "取り消せない削除など", "Alert Dialog", "alert"),
            ("補足の情報・小さな複合操作", "絞り込み、連絡先の確認", "Popover", "popover"),
            ("実行する操作を選ぶ", "値を選ぶときは Select", "Dropdown Menu", "menu"),
            ("一覧からの詳細の確認・編集", "一覧を見ながら切り替える", "Sheet", "sheet"),
            ("モバイルでの短い補助操作", "選ぶとすぐに閉じる", "Drawer", "drawer"),
            ("長い作業・複雑な編集", "URL で戻れる", "専用のページ", "page")]
    for i, (q, sub, comp, kind) in enumerate(rows):
        y = 32 + i * 88
        last = kind == "page"
        d.text(0, y + 12, 440, 24, q, S_NAME, TEXT, bold=True)
        d.text(0, y + 42, 440, 20, sub, S_SUB, MUTED)
        d.line([(452, y + 36), (508, y + 36)])
        d.rect(520, y, 380, 72, fill="none" if last else SURFACE, stroke=LINE if last else "none", dashed=last)
        screen(d, 538, y + 6, 92, 60, kind)
        d.text(652, y, 230, 72, comp, S_NAME, TEXT, bold=True, valign="middle")
    d.save("overlay-choice")


def sheet_modes():
    d = D()
    W, G = 900, 60
    cw = (W - G) / 2
    cols = [("閲覧", 'mode="view"', False,
             ["非モーダル。背景を暗くしない", "一覧を操作でき、別の行を選ぶと\n表示が切り替わる",
              "フォーカスを閉じ込めない", "外側のクリックでは閉じない"]),
            ("編集", 'mode="edit"', True,
             ["モーダル。背景を黒 40% で暗くする", "背景の操作を止め、フォーカスを\nSheet の中に閉じ込める",
              "未保存の変更は、閉じる前に\n破棄を確かめる", "完了、キャンセル、破棄を分ける"])]
    for i, (name, code, edit, notes) in enumerate(cols):
        x = i * (cw + G)
        d.text(x, 0, 200, 24, name, S_NAME, TEXT, bold=True)
        d.text(x + 60, 2, 240, 20, code, S_SUB, MUTED)
        sy, sw, sh = 40, cw, 240
        d.rect(x, sy, sw, sh, fill="none", stroke=LINE, r=12, sw=1.5)
        # list
        for k in range(6):
            ry = sy + 24 + k * 34
            if not edit and k == 1:
                d.rect(x + 12, ry - 8, sw * 0.52, 26, fill=ACCENT_SURFACE, r=6)
            d.bar(x + 24, ry, 110, 8, fill=BAR_STRONG)
            d.bar(x + 150, ry, 50, 8)
        px = x + sw * 0.58
        if edit:
            d.rect(x + 1, sy + 1, px - x - 1, sh - 2, fill=SCRIM, r=11, opacity=40)
        # sheet
        d.rect(px, sy + 1, x + sw - px - 1, sh - 2, fill="light-dark(#FFFFFF,#0D1117)", stroke="none", r=0)
        d.line([(px, sy + 1), (px, sy + sh - 1)], color=LINE, arrow=False, sw=1.5)
        d.bar(px + 18, sy + 22, 90, 10, fill=TEXT)
        d.text(x + sw - 34, sy + 14, 20, 20, "×", 16, TEXT, align="center")
        if edit:
            for k in range(3):
                d.rect(px + 18, sy + 50 + k * 42, x + sw - px - 40, 28, fill="none", stroke=LINE, r=8, sw=1)
            d.line([(px, sy + sh - 52), (x + sw - 1, sy + sh - 52)], color=BAR, arrow=False, sw=1)
            d.rect(x + sw - 150, sy + sh - 40, 62, 28, fill=SURFACE, r=8)
            d.rect(x + sw - 80, sy + sh - 40, 62, 28, fill=TEXT, r=8)
        else:
            for k in range(4):
                d.bar(px + 18, sy + 56 + k * 40, 60, 6)
                d.bar(px + 18, sy + 70 + k * 40, 110, 8, fill=BAR_STRONG)
        ny = sy + sh + 28
        for k, n in enumerate(notes):
            lines = n.split("\n")
            d.dot(x + 6, ny + 10, d=6, fill=ACCENT if edit else BAR_STRONG, stroke="none")
            for j, ln in enumerate(lines):
                d.text(x + 22, ny + j * 24, cw - 22, 20, ln, S_SUB, TEXT)
            ny += 24 * len(lines) + 14
    ax = cw + 8
    d.line([(ax, 140), (ax + G - 16, 140)], color=ACCENT)
    d.text(ax - 10, 112, G + 4, 18, "編集", 14, MUTED, align="center")
    d.line([(ax + G - 16, 190), (ax, 190)], color=ACCENT)
    d.text(ax - 10, 198, G + 4, 18, "保存", 14, MUTED, align="center")
    d.text(0, ny + 6, W, 20, "閲覧と編集の切り替えは、画面が mode で指定する。Sheet は推測しない", S_SUB, MUTED)
    d.save("sheet-modes")


def overlay_mobile():
    d = D()
    items = [("短い確認", "中央の Dialog", "alert"), ("短い補助操作", "下からの Drawer", "drawer"),
             ("長い詳細・フォーム", "全画面の Sheet", "fullsheet"), ("複雑な業務", "専用のページ", "page")]
    pw, ph, G = 180, 330, 60
    for i, (q, a, kind) in enumerate(items):
        x = i * (pw + G)
        d.rect(x, 0, pw, ph, fill="none", stroke=LINE, r=22, sw=1.5)
        ix, iy, iw, ih = x + 10, 24, pw - 20, ph - 48
        for k in range(6):
            d.bar(ix + 10, iy + 34 + k * 26, iw * 0.7 - (k % 3) * 18, 7)
        if kind == "alert":
            d.rect(x + 1, 1, pw - 2, ph - 2, fill=SCRIM, r=21, opacity=40)
            bw, bh = iw - 16, 116
            bx, by = x + (pw - bw) / 2, (ph - bh) / 2
            d.rect(bx, by, bw, bh, fill="light-dark(#FFFFFF,#0D1117)", r=14)
            d.bar(bx + 14, by + 18, 100, 9, fill=TEXT)
            d.bar(bx + 14, by + 38, 120, 6)
            hw = (bw - 36) / 2
            d.rect(bx + 14, by + bh - 40, hw, 26, fill=SURFACE, r=8)
            d.rect(bx + 22 + hw, by + bh - 40, hw, 26, fill=DANGER, r=8)
        elif kind == "drawer":
            d.rect(x + 1, 1, pw - 2, ph - 2, fill=SCRIM, r=21, opacity=40)
            top = ph - 150
            d.rect(x + 1, top, pw - 2, ph - top - 1, fill="light-dark(#FFFFFF,#0D1117)", r=20)
            d.bar(x + pw / 2 - 14, top + 8, 28, 4, fill=BAR_STRONG)
            d.bar(x + 18, top + 26, 90, 9, fill=TEXT)
            for k in range(3):
                d.bar(x + 18, top + 56 + k * 26, 110, 7, fill=BAR_STRONG)
        elif kind == "fullsheet":
            d.rect(x + 1, 1, pw - 2, ph - 2, fill="light-dark(#FFFFFF,#0D1117)", r=21)
            d.bar(x + 18, 34, 100, 10, fill=TEXT)
            d.text(x + pw - 34, 28, 20, 20, "×", 16, TEXT, align="center")
            for k in range(5):
                d.bar(x + 18, 70 + k * 40, 50, 6)
                d.bar(x + 18, 84 + k * 40, 120, 8, fill=BAR_STRONG)
            d.line([(x + 1, ph - 58), (x + pw - 1, ph - 58)], color=BAR, arrow=False, sw=1)
            d.rect(x + 18, ph - 46, (pw - 44) / 2, 28, fill=SURFACE, r=8)
            d.rect(x + 26 + (pw - 44) / 2, ph - 46, (pw - 44) / 2, 28, fill=TEXT, r=8)
        else:
            d.bar(ix + 10, iy + 4, 90, 10, fill=TEXT)
        d.text(x - 20, ph + 22, pw + 40, 24, q, S_NAME, TEXT, bold=True, align="center")
        d.text(x - 20, ph + 52, pw + 40, 20, a, S_SUB, MUTED, align="center")
    d.text(0, ph + 96, 900, 20, "モバイルだからという理由だけで、Dialog を Drawer に変えない", S_SUB, MUTED)
    d.save("overlay-mobile")


def overlay_closing():
    d = D()
    W = 900
    c0, c1, c2 = 0, 330, 620
    d.text(c0, 0, 300, 18, "閉じる操作", S_LABEL, MUTED, bold=True)
    d.text(c1, 0, 280, 18, "未保存の変更なし", S_LABEL, MUTED, bold=True)
    d.text(c2, 0, 280, 18, "未保存の変更あり", S_LABEL, MUTED, bold=True)
    rows = [("外側のクリック", "Dialog、Sheet（編集）、Drawer", "閉じる", "閉じない"),
            ("Escape", "最前面の Overlay だけが反応する", "閉じる", "破棄を確かめる"),
            ("閉じるボタン、キャンセル", "", "閉じる", "破棄を確かめる"),
            ("スワイプ", "Drawer", "閉じる", "破棄を確かめる")]
    for i, (op, sub, a, b) in enumerate(rows):
        y = 32 + i * 76
        if i:
            d.line([(0, y - 8), (W, y - 8)], color=BAR, arrow=False, sw=1)
        d.text(c0, y + (8 if sub else 20), 320, 24, op, S_NAME, TEXT, bold=True)
        if sub:
            d.text(c0, y + 36, 320, 20, sub, S_SUB, MUTED)
        d.text(c1, y, 260, 60, a, 16, TEXT, valign="middle")
        if b == "破棄を確かめる":
            d.rect(c2, y + 10, 200, 40, fill=ACCENT_SURFACE, r=10)
            d.text(c2, y + 10, 200, 40, b, 16, ACCENT, bold=True, align="center", valign="middle")
        else:
            d.text(c2, y, 260, 60, b, 16, TEXT, valign="middle")
    fy = 32 + 4 * 76 + 24
    d.text(0, fy, 600, 18, "破棄を確かめる Alert Dialog", S_LABEL, MUTED, bold=True)
    bx, by, bw, bh = 0, fy + 28, 380, 150
    d.rect(bx, by, bw, bh, fill="none", stroke=LINE, r=20, sw=1.5)
    d.text(bx + 24, by + 22, bw - 48, 24, "変更を破棄しますか？", S_NAME, TEXT, bold=True)
    d.text(bx + 24, by + 52, bw - 48, 20, "入力した内容は保存されません。", S_SUB, MUTED)
    d.rect(bx + bw - 276, by + bh - 58, 126, 36, fill=SURFACE, stroke=ACCENT, r=12, sw=2)
    d.text(bx + bw - 276, by + bh - 58, 126, 36, "編集を続ける", 15, TEXT, bold=True, align="center", valign="middle")
    d.rect(bx + bw - 140, by + bh - 58, 116, 36, fill=DANGER, r=12)
    d.text(bx + bw - 140, by + bh - 58, 116, 36, "変更を破棄", 15, "#FFFFFF", bold=True, align="center", valign="middle")
    rx = 440
    for k, (t, s2) in enumerate((("編集を続ける・Escape", "Alert Dialog だけを閉じ、入力を残す"),
                                 ("変更を破棄", "元の Overlay も閉じる（Sheet はキャンセルなら閲覧に戻る）"))):
        y = by + 8 + k * 64
        d.text(rx, y, W - rx, 24, t, S_NAME, TEXT, bold=True)
        d.text(rx, y + 30, W - rx, 20, s2, S_SUB, MUTED)
    d.text(0, by + bh + 24, W, 20, "初期フォーカスは「編集を続ける」。未保存かどうかは製品が判断し、unsavedChanges で渡す", S_SUB, MUTED)
    d.save("overlay-closing")


def overlay_nesting():
    d = D()
    # stacked layers
    layers = [("ページ", "トリガー"), ("Dialog", "入力欄"), ("Alert Dialog", "最前面")]
    for i, (name, sub) in enumerate(layers):
        x, y = i * 44, i * 76
        fill = ACCENT_SURFACE if i == 2 else SURFACE
        d.rect(x, y, 300, 150, fill=fill, stroke=ACCENT if i == 2 else LINE, sw=1.5)
        d.text(x + 22, y + 18, 220, 24, name, S_NAME, TEXT, bold=True)
        d.text(x + 22, y + 48, 220, 20, sub, S_SUB, MUTED)
    rx = 440
    d.text(rx, 0, 460, 18, "Escape とフォーカスの復帰", S_LABEL, MUTED, bold=True)
    steps = [("1", "Escape", "Alert Dialog だけが閉じる", "フォーカスは Dialog の中の元の要素に戻る"),
             ("2", "Escape", "Dialog が閉じる", "フォーカスはページのトリガーに戻る")]
    for k, (n, key, what, focus) in enumerate(steps):
        y = 32 + k * 96
        d.text(rx, y + 2, 24, 20, n, S_NUM, ACCENT, bold=True)
        d.rect(rx + 30, y, 74, 26, fill="none", stroke=LINE, r=6, sw=1.5)
        d.text(rx + 30, y, 74, 26, key, 14, TEXT, bold=True, align="center", valign="middle")
        d.text(rx + 118, y + 2, 340, 24, what, S_NAME, TEXT, bold=True)
        d.text(rx + 118, y + 34, 340, 20, focus, S_SUB, MUTED)
    oy = 250
    d.text(rx, oy, 460, 18, "認める組み合わせ", S_LABEL, MUTED, bold=True)
    for k, t in enumerate(("Dialog の中の Select、Popover", "Sheet の中の Dropdown Menu",
                           "編集中の変更の破棄を確かめる Alert Dialog")):
        d.dot(rx + 6, oy + 38 + k * 30, d=6, fill=BAR_STRONG, stroke="none")
        d.text(rx + 22, oy + 28 + k * 30, 440, 20, t, S_SUB, TEXT)
    d.text(0, 324, 400, 20, "z-index は共通の 1 つ。開いた順に前面に重なる", S_SUB, MUTED)
    d.save("overlay-nesting")


for f in (journey, principles, wording, layout, visual, process, architecture, site, tokens,
          button_anatomy, button_hierarchy, field_anatomy, form_choice, form_validation,
          feedback_choice, toast_timing, progress_states,
          overlay_choice, sheet_modes, overlay_mobile, overlay_closing, overlay_nesting,
          nav_structure, sidebar_states, tabs_sidebar, breadcrumb_hierarchy, separation_order, content_width):
    f()
print("ok")
