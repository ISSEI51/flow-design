"""Generate Data Display diagrams (.drawio) with the shared visual vocabulary of gen.py.

Usage: python3 scripts/diagrams/gen_data_display.py [output_dir]
Importing gen also regenerates the diagrams defined there. The output is deterministic.
"""
import os
import sys

sys.dont_write_bytecode = True  # import gen で __pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gen  # noqa: E402
from gen import (  # noqa: E402
    ACCENT, ACCENT_SURFACE, BAR, BAR_STRONG, BTN_FG, DANGER, LINE, MUTED, S_LABEL, S_NAME, S_NUM, S_SUB,
    SURFACE, TEXT, D, node, tw,
)

SUCCESS = "light-dark(#1A7F37,#3FB950)"
WARN = "light-dark(#9A6700,#D29922)"


def frame(d, x, y, w, h):
    d.rect(x, y, w, h, fill="none", stroke=LINE, r=18, sw=1)


def lines_text(d, x, y, w, text, size=S_SUB, color=MUTED, step=24):
    for k, ln in enumerate(text.split("\n")):
        d.text(x, y + k * step, w, 20, ln, size, color)


# ---------------------------------------------------------------- table style
def table_style():
    d = D()
    w, Rx = 420, 480
    cols = [(0, "情報量が少ない", "横線のみ", "背景は background。縦の線は使わない", False, 4, 5),
            (Rx, "列や行が多い", "交互の背景色", "background と muted を交互に。本文の横線は省く", True, 8, 8)]
    for x, label, name, sub, striped, ncol, nrow in cols:
        d.text(x, 0, w, 18, label, S_LABEL, MUTED, bold=True)
        d.text(x, 26, w, 24, name, S_NAME, TEXT, bold=True)
        d.text(x, 56, w, 20, sub, S_SUB, MUTED)
        y0 = 92
        frame(d, x, y0, w, 300)
        px, inner = x + 24, w - 48
        cw = inner / ncol
        hy = y0 + 24
        for c in range(ncol):
            d.bar(px + c * cw, hy + 6, min(cw - 16, 56), 6, fill=BAR_STRONG)
        d.line([(px, hy + 26), (px + inner, hy + 26)], color=LINE, arrow=False, sw=1)
        rh = (300 - 24 - 26 - 24) / nrow
        for r in range(nrow):
            ry = hy + 26 + r * rh
            if striped and r % 2 == 1:
                d.rect(px - 8, ry, inner + 16, rh, fill=SURFACE, r=4)
            for c in range(ncol):
                bw = min(cw - 16, 72) - ((r + c) % 3) * 8
                d.bar(px + c * cw, ry + rh / 2 - 3, bw, 6)
            if not striped and r < nrow - 1:
                d.line([(px, ry + rh), (px + inner, ry + rh)], color=BAR, arrow=False, sw=1)
    by = 424
    d.rect(0, by, 560, 132)
    d.text(24, by + 20, 520, 24, "製品が画面ごとに選ぶ", S_NAME, TEXT, bold=True)
    lines_text(d, 24, by + 52, 520,
               "初期の目安：6 列以上、または 10 行以上で交互の背景色を検討する\n"
               "件数で自動に切り替えない。検索やページ送りで見た目を変えない\n"
               "画面の用途、表の幅、想定するデータの量で決める")
    d.rect(584, by, 316, 132, fill="none", stroke=LINE, dashed=True)
    d.text(608, by + 20, 280, 24, "格子状の線", S_NAME, TEXT, bold=True)
    lines_text(d, 608, by + 52, 280, "セル単位の編集などの特殊用途\n通常の一覧では使わない\nv0.1 では提供しない")
    d.save("table-style")


# ---------------------------------------------------------------- table density
def table_density():
    d = D()
    items = [("Compact", 36, "高密度の業務画面"), ("Default", 48, "標準"), ("Comfortable", 64, "行の情報が多い一覧")]
    cw = 288
    for i, (name, h, use) in enumerate(items):
        x = i * (cw + 18)
        d.text(x, 0, cw, 24, name, S_NAME, TEXT, bold=True)
        d.text(x, 30, cw, 20, f"最小 {h}px・{use}", S_SUB, MUTED)
        y = 72
        rx = x + 56
        for r in range(3):
            ry = y + r * h
            if r == 1:
                d.rect(rx, ry, cw - 64, h, fill=SURFACE, r=4)
            d.bar(rx + 14, ry + h / 2 - 4, 92, 8, fill=BAR_STRONG)
            d.bar(rx + 124, ry + h / 2 - 3, 70, 6)
            d.line([(rx, ry + h), (rx + cw - 64, ry + h)], color=BAR, arrow=False, sw=1)
        # dimension of the middle row
        my = y + h
        d.line([(x + 30, my + 2), (x + 30, my + h - 2)], color=ACCENT, arrow=False, sw=1.5)
        d.line([(x + 24, my + 1), (x + 36, my + 1)], color=ACCENT, arrow=False, sw=1.5)
        d.line([(x + 24, my + h - 1), (x + 36, my + h - 1)], color=ACCENT, arrow=False, sw=1.5)
        d.text(x - 4, my + h / 2 - 9, 30, 18, str(h), 13, ACCENT, bold=True, align="right")
    by = 72 + 3 * 64 + 40
    notes = [("文字は 14px のまま", "Compact でも小さくしない"),
             ("高さは最小の値", "複数行の文字や拡大表示で伸びる"),
             ("指で操作する行は 48px 以上", "Compact でも Checkbox などの行")]
    for i, (name, sub) in enumerate(notes):
        x = i * 306
        d.rect(x, by, 288, 88)
        d.text(x + 22, by + 18, 250, 24, name, S_NAME, TEXT, bold=True)
        d.text(x + 22, by + 50, 250, 20, sub, S_SUB, MUTED)
    d.save("table-density")


# ---------------------------------------------------------------- data table anatomy
def num(d, n, x, y):
    d.dot(x, y, d=24, fill=ACCENT_SURFACE, stroke=ACCENT)
    d.text(x - 12, y - 12, 24, 24, n, 14, ACCENT, bold=True, align="center", valign="middle")


def data_table_anatomy():
    d = D()
    X, W = 40, 400
    y = 8
    # 1 toolbar
    d.rect(X, y, 150, 34, fill="none", stroke=LINE, r=9, sw=1.2)
    d.dot(X + 16, y + 17, d=10, fill="none", stroke=MUTED)
    d.bar(X + 30, y + 14, 64, 6)
    for k, bw in enumerate((76, 70, 92)):
        bx = X + 160 + sum((76, 70, 92)[:k]) + k * 8
        d.rect(bx, y, bw, 34, fill="none", stroke=LINE, r=9, sw=1.2)
        d.bar(bx + 12, y + 14, bw - 34, 6, fill=BAR_STRONG)
    num(d, "1", X - 24, y + 17)
    # 2 applied filters
    y = 62
    for k in range(2):
        d.rect(X + k * 92, y, 82, 26, fill=SURFACE, r=8)
        d.bar(X + k * 92 + 12, y + 10, 46, 6, fill=BAR_STRONG)
    d.bar(X + 196, y + 10, 52, 6, fill=ACCENT)
    num(d, "2", X - 24, y + 13)
    # 3 count / bulk
    y = 106
    d.bar(X, y + 10, 70, 8, fill=TEXT)
    d.bar(X + 86, y + 11, 56, 6, fill=ACCENT)
    for k in range(2):
        d.rect(X + W - 150 + k * 78, y, 70, 28, fill="none", stroke=LINE, r=8, sw=1.2)
    num(d, "3", X - 24, y + 14)
    # 4 table
    ty = 152
    rh = 34
    d.line([(X, ty + 30), (X + W, ty + 30)], color=LINE, arrow=False, sw=1)
    pin_x = X + 150
    for r in range(7):
        ry = ty + 30 + r * rh
        if r == 2:
            d.rect(X, ry, W, rh, fill=ACCENT_SURFACE, r=0)
        elif r % 2 == 1:
            d.rect(X, ry, W, rh, fill=SURFACE, r=0)
    for r in range(8):
        ry = ty + (0 if r == 0 else 30 + (r - 1) * rh)
        h = 30 if r == 0 else rh
        cy = ry + h / 2
        d.rect(X + 10, cy - 7, 14, 14, fill=TEXT if r == 3 else "none", stroke=TEXT if r == 3 else LINE, r=3, sw=1.2)
        if r == 0:
            d.bar(X + 40, cy - 3, 54, 6, fill=BAR_STRONG)
            d.line([(X + 104, cy - 5), (X + 108, cy - 9), (X + 112, cy - 5)], color=TEXT, arrow=False, sw=1.2)
            d.line([(X + 104, cy + 5), (X + 108, cy + 9), (X + 112, cy + 5)], color=TEXT, arrow=False, sw=1.2)
            for c in range(3):
                d.bar(pin_x + 20 + c * 80, cy - 3, 44, 6, fill=BAR_STRONG)
        else:
            d.bar(X + 40, cy - 3, 90 - (r % 3) * 14, 6, fill=TEXT if r == 3 else BAR_STRONG)
            for c in range(3):
                d.bar(pin_x + 20 + c * 80, cy - 3, 50 - ((r + c) % 3) * 10, 6)
    d.line([(pin_x, ty), (pin_x, ty + 30 + 7 * rh)], color=LINE, arrow=False, sw=1)
    d.rect(X, ty + 30 + 2 * rh, 3, rh, fill=ACCENT, r=0)
    num(d, "4", X - 24, ty + 15)
    # 5 pagination
    py = ty + 30 + 7 * rh + 24
    d.bar(X, py + 12, 96, 8, fill=BAR_STRONG)
    for k in range(5):
        bx = X + W - 5 * 36 + k * 36
        d.rect(bx, py, 30, 30, fill=TEXT if k == 1 else "none", stroke="none" if k == 1 else BAR, r=7, sw=1)
        d.bar(bx + 11, py + 12, 8, 6, fill=BTN_FG if k == 1 else BAR_STRONG)
    num(d, "5", X - 24, py + 15)
    # 6 sheet
    sx = X + W + 20
    d.rect(sx, ty - 46, 118, 7 * rh + 76, fill="none", stroke=ACCENT, dashed=True, sw=1.5)
    d.bar(sx + 14, ty - 26, 70, 10, fill=TEXT)
    for k in range(6):
        d.bar(sx + 14, ty + 4 + k * 28, 30, 6)
        d.bar(sx + 52, ty + 4 + k * 28, 50 - (k % 3) * 8, 6, fill=BAR_STRONG)
    num(d, "6", sx + 118, ty - 46)
    # legend
    LX = 620
    rows = [("1", "検索と絞り込み", "検索欄、よく使う条件の Select\nその他の条件、列の表示"),
            ("2", "適用中の条件", "個別に表示していない条件を\n解除できる形で。すべて解除"),
            ("3", "件数と一括操作", "選ぶと同じ行が一括操作になる\n表の位置は動かない"),
            ("4", "表", "選択列と主要な列を固定\n見出しで並べ替え、行で詳細"),
            ("5", "Pagination", "表示範囲、総件数、表示件数\nページ番号と前後の移動"),
            ("6", "詳細（非モーダルの Sheet）", "一覧を操作しながら\n別の行の詳細に切り替える")]
    for i, (n, name, sub) in enumerate(rows):
        y = i * 84
        d.text(LX, y + 2, 24, 20, n, S_NUM, ACCENT, bold=True)
        d.text(LX + 30, y, 290, 24, name, S_NAME, TEXT, bold=True)
        lines_text(d, LX + 30, y + 30, 290, sub, step=22)
    d.save("data-table-anatomy")


# ---------------------------------------------------------------- data table flow
def data_table_flow():
    d = D()
    steps = [("データ", "全件、または\n1 ページ分"), ("絞り込み", "検索、フィルター"), ("並べ替え", "1 列。昇順、\n降順、解除"),
             ("ページ送り", "50 件ずつ"), ("表示する行", "表に描画する")]
    w, g = 160, 25
    xs = [i * (w + g) for i in range(5)]
    top = 48
    # server bracket over steps 1..3
    bx0, bx1 = xs[1], xs[3] + w
    d.line([(bx0, 28), (bx1, 28)], color=ACCENT, arrow=False, sw=1.5)
    d.line([(bx0, 28), (bx0, 38)], color=ACCENT, arrow=False, sw=1.5)
    d.line([(bx1, 28), (bx1, 38)], color=ACCENT, arrow=False, sw=1.5)
    d.text(bx0, 0, bx1 - bx0, 18, "サーバー側の処理では、この 3 つをサーバーが行う（manual*）", S_SUB, ACCENT, align="center")
    for i, (name, sub) in enumerate(steps):
        node(d, xs[i], top, w, 124, name, sub, fill=ACCENT_SURFACE if i == 4 else SURFACE)
    for i in range(4):
        d.line([(xs[i] + w + 3, top + 62), (xs[i + 1] - 3, top + 62)])
    # reset page
    ly = top + 124 + 30
    c1, c3 = xs[1] + w / 2, xs[3] + w / 2
    d.line([(c1, top + 128), (c1, ly), (c3, ly), (c3, top + 130)], color=ACCENT, dashed=True)
    d.text(c1 + 12, ly + 8, c3 - c1 - 24, 20, "条件を変えたら 1 ページ目に戻す", S_SUB, ACCENT, align="center")
    by = ly + 56
    d.rect(0, by, 560, 104, fill=ACCENT_SURFACE)
    d.text(24, by + 20, 520, 24, "選択は行の ID で保持する", S_NAME, TEXT, bold=True)
    lines_text(d, 24, by + 52, 520, "並べ替え、絞り込み、ページ移動の後も同じ行が選ばれたまま\n表示していない行の選択は、件数で示す")
    d.rect(584, by, 316, 104)
    d.text(608, by + 20, 280, 24, "一括操作", S_NAME, TEXT, bold=True)
    lines_text(d, 608, by + 52, 280, "1 件以上選んだときだけ表示\n危険な操作は確認してから行う")
    d.line([(562, by + 52), (582, by + 52)])
    d.save("data-table-flow")


# ---------------------------------------------------------------- selection scope
def pages(d, x, y, selected_all):
    pw, g = 78, 12
    for p in range(4):
        px = x + p * (pw + g)
        sel = selected_all or p == 0
        d.rect(px, y, pw, 132, fill=ACCENT_SURFACE if sel else "none", stroke=ACCENT if sel else LINE, r=10, sw=1.2)
        d.text(px, y + 10, pw, 16, f"{p + 1}" if p < 3 else "12", 13, ACCENT if sel else MUTED, bold=True, align="center")
        for r in range(5):
            ry = y + 36 + r * 18
            d.rect(px + 10, ry - 5, 10, 10, fill=ACCENT if sel else "none", stroke=ACCENT if sel else LINE, r=2, sw=1)
            d.bar(px + 26, ry - 3, 40 - (r % 2) * 10, 6, fill=BAR_STRONG if sel else BAR)
    d.text(x + 3 * (pw + g) - 12, y + 56, 14, 20, "…", 16, MUTED, align="center")


def selection_scope():
    d = D()
    w, Rx = 420, 480
    cols = [(0, "ページ内の全選択", "表示中の 50 件", "見出しの Checkbox で選ぶ\n行の ID で選ぶ", False),
            (Rx, "検索条件に一致する全データ", "580 件", "件数の行の「すべて選択」で選ぶ\nサーバー側では「全データを選択中」という\n状態で持つ。読み込んでいない行は\nID で選ばない", True)]
    for x, label, count, sub, all_ in cols:
        d.text(x, 0, w, 18, label, S_LABEL, MUTED, bold=True)
        d.text(x, 26, w, 30, count, 24, TEXT, bold=True)
        pages(d, x, 76, all_)
        lines_text(d, x, 232, w, sub)
    by = 352
    d.rect(0, by, 900, 84)
    d.text(24, by + 18, 852, 24, "ページ内をすべて選ぶと、「検索条件に一致する 580 件をすべて選択」を示す", S_NAME, TEXT, bold=True)
    d.text(24, by + 50, 852, 20, "検索や絞り込みの条件を変えたら、全データの選択は解除する", S_SUB, MUTED)
    d.save("selection-scope")


# ---------------------------------------------------------------- chart choice
def glyph(d, kind, x, cy):
    # glyph area: 64 x 40, centered vertically on cy
    t, b = cy - 18, cy + 18
    if kind == "line":
        d.line([(x, b - 6), (x + 16, b - 16), (x + 32, b - 12), (x + 48, t + 6), (x + 64, t)], color=ACCENT, arrow=False, sw=2.5)
    elif kind == "bar":
        for k, h in enumerate((22, 34, 14, 28)):
            d.rect(x + k * 17, b - h, 11, h, fill=ACCENT, r=2)
    elif kind == "area":
        d.line([(x, b - 8), (x + 22, b - 18), (x + 44, b - 14), (x + 64, t + 2)], color=ACCENT, arrow=False, sw=2.5)
        d.line([(x, b - 2), (x + 22, b - 6), (x + 44, b - 4), (x + 64, b - 10)], color=BAR_STRONG, arrow=False, sw=2.5)
        d.line([(x, b), (x + 64, b)], color=LINE, arrow=False, sw=1)
    elif kind == "donut":
        d.dot(x + 32, cy, d=38, fill=ACCENT, stroke="none")
        d.dot(x + 32, cy, d=20, fill=SURFACE, stroke="none")
        d.line([(x + 32, cy - 19), (x + 32, cy - 10)], color=SURFACE, arrow=False, sw=2)
        d.line([(x + 23, cy + 6), (x + 15, cy + 12)], color=SURFACE, arrow=False, sw=2)
    elif kind == "stacked":
        for k, (h1, h2) in enumerate(((14, 12), (20, 14), (10, 16), (18, 10))):
            d.rect(x + k * 17, b - h1, 11, h1, fill=ACCENT, r=0)
            d.rect(x + k * 17, b - h1 - h2 - 2, 11, h2, fill=BAR_STRONG, r=0)
    elif kind == "scatter":
        for px, py in ((4, 30), (14, 22), (22, 26), (30, 14), (40, 18), (48, 8), (58, 6), (36, 28)):
            d.dot(x + px, t + py, d=7, fill=ACCENT, stroke="none")


def chart_choice():
    d = D()
    d.text(0, 0, 400, 18, "知りたいこと", S_LABEL, MUTED, bold=True)
    d.text(520, 0, 300, 18, "使うグラフ", S_LABEL, MUTED, bold=True)
    rows = [("時間による推移", "月ごとの売上の変化", "Line Chart", "line"),
            ("項目ごとの量の比較", "担当者ごとの契約件数", "Bar Chart", "bar"),
            ("推移と量の積み重なり", "期間ごとの合計の変化", "Area Chart", "area"),
            ("全体に対する構成比", "合計が 100%。負の値は使わない", "Donut Chart", "donut"),
            ("構成の比較", "地域ごとのプランの内訳", "Stacked Bar Chart", "stacked"),
            ("2 つの量の関係", "利用者数と月額", "Scatter Chart", "scatter")]
    for i, (q, sub, name, kind) in enumerate(rows):
        y = 32 + i * 88
        d.text(0, y + 12, 440, 24, q, S_NAME, TEXT, bold=True)
        d.text(0, y + 42, 440, 20, sub, S_SUB, MUTED)
        d.line([(452, y + 36), (508, y + 36)])
        d.rect(520, y, 380, 72)
        glyph(d, kind, 544, y + 36)
        d.text(632, y, 250, 72, name, S_NAME, TEXT, bold=True, valign="middle")
    d.save("chart-choice")


# ---------------------------------------------------------------- chart honesty
def chart_honesty():
    d = D()
    w, Rx, ch = 420, 480, 104
    d.text(0, 0, w, 20, "避ける", 16, MUTED, bold=True)
    d.text(Rx, 0, w, 20, "使う", 16, ACCENT, bold=True)
    rows = ["棒の数値軸はゼロから始める", "欠損をゼロにしない", "予測は線の種類で区別する", "すべての棒を別の色にしない"]
    for i, title in enumerate(rows):
        y0 = 40 + i * (ch + 64)
        d.text(0, y0, 900, 18, title, S_LABEL, MUTED, bold=True)
        y = y0 + 28
        for side, x in ((0, 0), (1, Rx)):
            d.rect(x, y, w, ch)
            base = y + ch - 20
            px = x + 56
            if i == 0:
                vals = (96, 98, 94, 100)
                for k, v in enumerate(vals):
                    h = (v - 90) * 7 if side == 0 else v * 0.62
                    d.rect(px + k * 74, base - h, 40, h, fill=ACCENT if side else BAR_STRONG, r=3)
                d.line([(x + 40, base), (x + w - 24, base)], color=LINE, arrow=False, sw=1)
                d.text(x + 10, base - 9, 26, 18, "90" if side == 0 else "0", 13, DANGER if side == 0 else MUTED, align="right")
            elif i == 1:
                pts = [(px, base - 40), (px + 60, base - 50), (px + 120, base - 46)]
                pts2 = [(px + 240, base - 58), (px + 300, base - 62)]
                if side == 0:
                    d.line(pts + [(px + 180, base)] + pts2, color=BAR_STRONG, arrow=False, sw=2.5)
                    d.text(px + 238, base - 22, 120, 16, "欠損を 0 で描く", 13, DANGER)
                else:
                    d.line(pts, color=ACCENT, arrow=False, sw=2.5)
                    d.line(pts2, color=ACCENT, arrow=False, sw=2.5)
                    d.text(px + 128, base - 64, 104, 16, "データなし", 13, MUTED, align="center")
                d.line([(x + 40, base), (x + w - 24, base)], color=LINE, arrow=False, sw=1)
            elif i == 2:
                act = [(px, base - 20), (px + 60, base - 34), (px + 120, base - 30), (px + 180, base - 48)]
                fc = [(px + 180, base - 48), (px + 240, base - 58), (px + 300, base - 66)]
                if side == 0:
                    d.line(act + fc[1:], color=BAR_STRONG, arrow=False, sw=2.5)
                else:
                    d.line(act, color=ACCENT, arrow=False, sw=2.5)
                    d.line(fc, color=ACCENT, arrow=False, dashed=True, sw=2.5)
                    d.text(px + 40, base - 66, 60, 16, "実績", 13, TEXT, bold=True)
                    d.text(px + 250, base - 90, 60, 16, "予測", 13, TEXT, bold=True)
                d.line([(x + 40, base), (x + w - 24, base)], color=LINE, arrow=False, sw=1)
            else:
                colors = (ACCENT, DANGER, SUCCESS, WARN)
                for k, h in enumerate((44, 62, 36, 54)):
                    fill = colors[k] if side == 0 else (ACCENT if k == 1 else BAR)
                    d.rect(px + k * 74, base - h, 40, h, fill=fill, r=3)
                if side == 1:
                    d.text(px + 74 - 10, base - 62 - 20, 60, 16, "62", 13, TEXT, bold=True, align="center")
                d.line([(x + 40, base), (x + w - 24, base)], color=LINE, arrow=False, sw=1)
    d.save("chart-honesty")


# ---------------------------------------------------------------- data states
def data_states():
    d = D()
    d.text(0, 0, 400, 18, "状態", S_LABEL, MUTED, bold=True)
    d.text(400, 0, 300, 18, "表示と次の操作", S_LABEL, MUTED, bold=True)
    rows = [("読み込み中", "初めての読み込み", "行の形の仮の表示（Skeleton）", "表の位置と大きさを先に示す", "skeleton"),
            ("データ未登録", "1 件も登録されていない", "最初の登録を促す", "「顧客を登録する」ボタン", "primary"),
            ("検索結果なし", "条件に一致しない", "条件の変更と解除を促す", "「条件をすべて解除」ボタン", "outline"),
            ("取得失敗", "通信やサーバーの失敗", "原因と再試行の手段を示す", "0 件として表示しない", "error"),
            ("再取得中", "条件の変更、更新の後", "表示中のデータを残す", "「更新中」とだけ示す", "refresh")]
    for i, (state, cause, show, action, kind) in enumerate(rows):
        y = 32 + i * 96
        d.text(0, y + 14, 320, 24, state, S_NAME, TEXT, bold=True)
        d.text(0, y + 46, 320, 20, cause, S_SUB, MUTED)
        d.line([(332, y + 40), (388, y + 40)])
        d.rect(400, y, 500, 80, fill="none" if kind == "error" else SURFACE, stroke=DANGER if kind == "error" else "none", sw=1.5)
        gx, cy = 424, y + 40
        if kind == "skeleton":
            for k in range(3):
                d.bar(gx, cy - 18 + k * 14, 64 - k * 12, 8)
        elif kind in ("primary", "outline"):
            d.rect(gx, cy - 14, 72, 28, fill=TEXT if kind == "primary" else "none", stroke="none" if kind == "primary" else LINE, r=8, sw=1.2)
            d.bar(gx + 16, cy - 3, 40, 6, fill=BTN_FG if kind == "primary" else BAR_STRONG)
        elif kind == "error":
            d.dot(gx + 12, cy, d=22, fill="none", stroke=DANGER)
            d.line([(gx + 12, cy - 6), (gx + 12, cy + 2)], color=DANGER, arrow=False, sw=2)
            d.rect(gx + 32, cy - 14, 40, 28, fill="none", stroke=LINE, r=8, sw=1.2)
        else:
            for k in range(3):
                d.bar(gx, cy - 18 + k * 14, 56, 6, fill=BAR_STRONG)
            d.dot(gx + 70, cy - 15, d=10, fill="none", stroke=ACCENT)
        d.text(516, y + 14, 370, 24, show, S_NAME, TEXT, bold=True)
        d.text(516, y + 46, 370, 20, action, S_SUB, DANGER if kind == "error" else MUTED)
    d.save("data-states")


for f in (table_style, table_density, data_table_anatomy, data_table_flow, selection_scope, chart_choice,
          chart_honesty, data_states):
    f()
print("ok data-display")
