"""Generate Data Browsing (Patterns) diagrams (.drawio) with the shared visual vocabulary of gen.py.

Usage: python3 scripts/diagrams/gen_data_browsing.py [output_dir]
Importing gen also regenerates the diagrams defined there. The output is deterministic.
"""
import os
import sys

sys.dont_write_bytecode = True  # import gen で __pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gen  # noqa: E402,F401
from gen import (  # noqa: E402
    ACCENT, ACCENT_SURFACE, BAR, BAR_STRONG, LINE, MUTED, S_LABEL, S_NAME, S_NUM, S_SUB, SURFACE, TEXT, D,
)

WHITE = "light-dark(#FFFFFF,#0D1117)"  # 図の中の画面の面


def est(s, size, bold=False):
    """文字列の概算幅（全角は 1em、半角は 0.56em）。はみ出しの検査にだけ使う。"""
    k = 0.6 if bold else 0.56
    return sum(size if ord(c) > 0x2E7F else size * k for c in s)


def T(d, x, y, w, text, size=S_SUB, color=MUTED, bold=False, align="left", step=22):
    """複数行のテキスト。行の幅が w を超える場合は警告する。"""
    for k, ln in enumerate(text.split("\n")):
        if est(ln, size, bold) > w:
            print(f"WARN width {est(ln, size, bold):.0f}>{w}: {ln}", file=sys.stderr)
        d.text(x, y + k * step, w, 20, ln, size, color, bold=bold, align=align)


def num(d, n, x, y):
    d.dot(x, y, d=24, fill=ACCENT_SURFACE, stroke=ACCENT)
    d.text(x - 12, y - 12, 24, 24, n, 14, ACCENT, bold=True, align="center", valign="middle")


def hh(n):
    """タイトル 1 行 + 補足 n 行の状態ボックスの高さ"""
    return 52 if n == 0 else 22 * n + 54


def state(d, x, y, w, h, title, subs=(), fill=SURFACE, stroke="none", dashed=False, tsize=16, tcolor=TEXT):
    d.rect(x, y, w, h, fill=fill, stroke=stroke, r=12, dashed=dashed, sw=1.2)
    total = 24 + 22 * len(subs)
    y0 = y + (h - total) / 2
    T(d, x + 8, y0, w - 16, title, tsize, tcolor, bold=True, align="center", step=24)
    for k, s in enumerate(subs):
        T(d, x + 8, y0 + 26 + k * 22, w - 16, s, S_SUB, MUTED, align="center")


def alabel(d, cx, y, w, text, color=MUTED, size=14, align="center"):
    T(d, cx - w / 2, y, w, text, size, color, align=align, step=19)


def checkbox(d, x, y, checked=False, s=14):
    if checked:
        d.rect(x, y, s, s, fill=ACCENT, r=3)
        d.line([(x + 3, y + 7), (x + 6, y + 10), (x + 11, y + 4)], color=WHITE, arrow=False, sw=1.5)
    else:
        d.rect(x, y, s, s, fill="none", stroke=BAR_STRONG, r=3, sw=1)


def field(d, x, y, w, h, label=None, chevron=False, color=MUTED, size=14):
    d.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=8, sw=1)
    if label:
        if est(label, size) > w - 24:
            print(f"WARN field {label}", file=sys.stderr)
        d.text(x + 12, y, w - 24, h, label, size, color, valign="middle")
    if chevron:
        cx, cy = x + w - 18, y + h / 2
        d.line([(cx - 5, cy - 2), (cx, cy + 3), (cx + 5, cy - 2)], color=BAR_STRONG, arrow=False, sw=1.2)


def seg_switch(d, x, y, w=120, h=28, active=0, kinds=("table", "list", "card"), accent=False):
    d.rect(x, y, w, h, fill=WHITE, stroke=ACCENT if accent else LINE, r=8, sw=1.2 if accent else 1)
    sw_ = w / len(kinds)
    d.rect(x + 2 + active * sw_, y + 2, sw_ - 4, h - 4, fill=BAR, r=6)
    for i, k in enumerate(kinds):
        cx = x + i * sw_ + sw_ / 2
        col = TEXT if i == active else BAR_STRONG
        if k == "table":
            d.rect(cx - 8, y + h / 2 - 6, 16, 12, fill="none", stroke=col, r=2, sw=1)
            d.line([(cx - 8, y + h / 2), (cx + 8, y + h / 2)], color=col, arrow=False, sw=1)
        elif k == "list":
            for j in range(3):
                d.bar(cx - 8, y + h / 2 - 6 + j * 5, 16, 2, fill=col)
        else:
            d.rect(cx - 8, y + h / 2 - 6, 7, 12, fill="none", stroke=col, r=2, sw=1)
            d.rect(cx + 1, y + h / 2 - 6, 7, 12, fill="none", stroke=col, r=2, sw=1)


def table_rows(d, x, y, w, rows=4, step=26, checks=None):
    d.bar(x + 14 + (24 if checks is not None else 0), y + 6, w * 0.18, 6, fill=BAR_STRONG)
    d.bar(x + w * 0.4, y + 6, w * 0.14, 6, fill=BAR_STRONG)
    d.bar(x + w * 0.65, y + 6, w * 0.14, 6, fill=BAR_STRONG)
    d.line([(x + 1, y + 24), (x + w - 1, y + 24)], color=BAR, arrow=False, sw=1)
    for k in range(rows):
        ry = y + 36 + k * step
        if checks is not None:
            checkbox(d, x + 14, ry - 4, checks[k])
        d.bar(x + 14 + (24 if checks is not None else 0), ry, w * (0.2 if k % 2 == 0 else 0.15), 6)
        d.bar(x + w * 0.4, ry, w * 0.16, 6)
        d.bar(x + w * 0.65, ry, w * (0.12 if k % 2 == 0 else 0.16), 6)


# ---------------------------------------------------------------- 1 Data Browsing の 5 種類の関係
def data_browsing():
    d = D()
    W, bw, gap = 920, 270, 55
    # View Switching
    vx, vw = (W - 400) / 2, 400
    d.rect(vx, 0, vw, 96, fill="none", stroke=LINE, r=12, dashed=True, sw=1.2)
    T(d, vx + 24, 14, vw - 48, "View Switching", S_NAME, TEXT, bold=True)
    T(d, vx + 24, 44, vw - 48, "目的に合う形で見る", S_SUB, TEXT)
    T(d, vx + 24, 68, vw - 48, "Table、List、Card、Kanban、Calendar", S_SUB, MUTED)
    cx = vx + vw / 2
    y0, h = 140, 124
    d.line([(cx, 96), (cx, y0 - 4)])
    T(d, cx + 14, 106, 220, "データ表示の領域に適用する", 14, MUTED)
    steps = [("Search & Filter", "見つける", "検索、フィルター、ソート"),
             ("List & Detail", "確かめる", "一覧、詳細、一覧への復帰"),
             ("Bulk Actions", "まとめて操作する", "選択、確認、結果")]
    for i, (name, purpose, sub) in enumerate(steps):
        x = i * (bw + gap)
        d.rect(x, y0, bw, h, fill=SURFACE, r=14)
        d.text(x + 22, y0 + 16, 40, 18, str(i + 1), S_NUM, ACCENT, bold=True)
        T(d, x + 22, y0 + 38, bw - 44, name, S_NAME, TEXT, bold=True)
        T(d, x + 22, y0 + 68, bw - 44, purpose, S_SUB, TEXT)
        T(d, x + 22, y0 + 92, bw - 44, sub, S_SUB, MUTED)
        if i < 2:
            d.line([(x + bw + 6, y0 + h / 2), (x + bw + gap - 6, y0 + h / 2)])
    # Data States
    by = y0 + h + 56
    for i in range(3):
        sx = i * (bw + gap) + bw / 2
        d.line([(sx, y0 + h), (sx, by)], color=ACCENT, arrow=False, sw=1.2)
        d.dot(sx, by, d=8, fill=ACCENT, stroke=ACCENT)
    d.rect(0, by, W, 104, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.2)
    T(d, 24, by + 18, 400, "Data States", S_NAME, TEXT, bold=True)
    T(d, 24, by + 48, 400, "状態を正しく伝える", S_SUB, TEXT)
    T(d, 24, by + 72, 700, "読み込み、再取得、Empty、Error、部分的な失敗", S_SUB, MUTED)
    T(d, W - 324, by + 18, 300, "3 つのすべてに共通する土台", 14, ACCENT, bold=True, align="right")
    d.save("data-browsing")


# ---------------------------------------------------------------- 2 検索とフィルターの構成
def search_filter_layout():
    d = D()
    SW_, SH = 630, 372
    d.rect(0, 0, SW_, SH, fill="none", stroke=LINE, r=16, sw=1.5)
    # row 1
    r1 = 36
    field(d, 24, r1, 190, 36, "会社名・電話番号で検索")
    field(d, 224, r1, 100, 36, "契約状況", chevron=True, color=TEXT)
    field(d, 334, r1, 100, 36, "担当者", chevron=True, color=TEXT)
    d.rect(444, r1, 162, 36, fill=SURFACE, r=8)
    d.text(444, r1, 162, 36, "その他の条件（2）", 14, TEXT, bold=True, align="center", valign="middle")
    # row 2
    r2 = 90
    d.rect(24, r2, 124, 28, fill=SURFACE, r=14)
    d.text(24, r2, 124, 28, "地域：関東 ×", 14, TEXT, align="center", valign="middle")
    d.rect(158, r2, 162, 28, fill=SURFACE, r=14)
    d.text(158, r2, 162, 28, "月額：10万円以上 ×", 14, TEXT, align="center", valign="middle")
    d.text(336, r2, 100, 28, "すべて解除", 14, MUTED, valign="middle")
    # row 3
    r3 = 138
    d.text(24, r3, 100, 28, "128件", 16, TEXT, bold=True, valign="middle")
    seg_switch(d, SW_ - 24 - 120, r3, 120, 28)
    # table
    d.rect(24, 182, SW_ - 48, 166, fill="none", stroke=LINE, r=10, sw=1)
    table_rows(d, 24, 190, SW_ - 48, rows=4)
    for k, (cx, cy) in enumerate([(119, 0), (329, 0), (525, 0), (0, r2 + 14), (0, r3 + 14), (SW_, r3 + 14)]):
        num(d, str(k + 1), cx, cy)
    LX = 690
    rows = [("検索欄", "検索対象がわかる表現にする"),
            ("よく使う条件", "常時表示する\nChip に重複して表示しない"),
            ("追加フィルター", "使用頻度の低い条件を集約する\n隠れた適用済みの条件の件数を示す"),
            ("Chip", "隠れている条件だけを表示する\n個別の解除と、すべて解除ができる"),
            ("件数", "正確な総件数がわかる場合だけ\n表示する"),
            ("表示形式の切り替え", "データ領域の直上・右に置く")]
    y = 0
    for i, (name, sub) in enumerate(rows):
        n = sub.count("\n") + 1
        d.text(LX, y + 2, 24, 20, str(i + 1), S_NUM, ACCENT, bold=True)
        T(d, LX + 30, y, 270, name, S_NAME, TEXT, bold=True)
        T(d, LX + 30, y + 28, 270, sub, S_SUB, MUTED)
        y += 28 + 22 * n + 26
    # mobile
    my = 430
    d.text(0, my, 300, 18, "モバイル", S_LABEL, MUTED, bold=True)
    py = my + 32
    d.rect(0, py, 170, 190, fill="none", stroke=LINE, r=18, sw=1.2)
    field(d, 12, py + 16, 90, 30, "検索", size=13)
    d.rect(108, py + 16, 50, 30, fill=SURFACE, r=8)
    d.text(108, py + 16, 50, 30, "条件", 13, TEXT, bold=True, align="center", valign="middle")
    for k in range(4):
        d.bar(16, py + 70 + k * 26, 130 if k % 2 == 0 else 100, 6)
    d.line([(184, py + 31), (184, py + 31)], arrow=False)
    d.line([(182, py + 95), (238, py + 95)])
    sx = 250
    d.rect(sx, py, 170, 190, fill="none", stroke=LINE, r=18, sw=1.2)
    for k in range(2):
        d.bar(sx + 16, py + 22 + k * 26, 110 if k == 0 else 80, 6)
    d.rect(sx + 1, py + 80, 168, 109, fill=SURFACE, stroke=LINE, r=17, sw=1)
    d.bar(sx + 65, py + 90, 40, 4, fill=BAR_STRONG)
    for k in range(3):
        d.bar(sx + 20, py + 114 + k * 24, 50, 6, fill=BAR_STRONG)
        field(d, sx + 80, py + 108 + k * 24, 70, 18)
    T(d, 0, py + 202, 200, "検索欄と「条件」を表示", 14, MUTED)
    T(d, sx, py + 202, 200, "Drawer / Sheet", 14, MUTED)
    T(d, 450, py + 50, 230, "検索欄と「条件」のボタンを\n常時表示する\n条件は Drawer / Sheet に\nまとめる", S_SUB, MUTED)
    d.save("search-filter-layout")


# ---------------------------------------------------------------- 3 入力中の条件と適用済み条件
def filter_draft():
    d = D()
    xs, bw = [0, 360, 720], 210
    # lane 1
    y0 = 0
    d.text(0, y0, 600, 18, "検索欄", S_LABEL, MUTED, bold=True)
    by, bh = y0 + 40, 64
    state(d, xs[0], by, bw, bh, "入力値")
    state(d, xs[1], by, bw, bh, "適用済みの検索語")
    state(d, xs[2], by, bw, bh, "要求")
    ay = by + bh / 2
    d.line([(xs[0] + bw + 6, ay), (xs[1] - 6, ay)])
    alabel(d, (xs[0] + bw + xs[1]) / 2, ay - 48, 150, "IME の変換が確定、\n300ms 入力が止まる")
    d.line([(xs[1] + bw + 6, ay), (xs[2] - 6, ay)])
    T(d, xs[2], by + bh + 10, bw, "最新の要求の結果だけを反映\n古い応答は破棄", 14, MUTED, align="center", step=20)
    # lane 2
    y0 = 190
    d.text(0, y0, 600, 18, "即時適用（Select、Checkbox）", S_LABEL, MUTED, bold=True)
    by = y0 + 40
    state(d, xs[0], by, bw, bh, "操作")
    state(d, xs[1], by, bw, bh, "適用済みの条件")
    state(d, xs[2], by, bw, bh, "1 ページ目に戻す", ["再取得する"])
    ay = by + bh / 2
    d.line([(xs[0] + bw + 6, ay), (xs[1] - 6, ay)])
    d.line([(xs[1] + bw + 6, ay), (xs[2] - 6, ay)])
    # lane 3
    y0 = 370
    d.text(0, y0, 600, 18, "まとめて適用（Sheet）", S_LABEL, MUTED, bold=True)
    by, bh3 = y0 + 40, 84
    state(d, xs[0], by, bw, bh3, "適用済みの条件")
    state(d, xs[1], by, bw, bh3, "編集中の条件", ["適用済みのコピー"])
    state(d, xs[2], by, bw, bh3, "編集中の条件を破棄", ["適用済みは変わらない"], stroke=LINE, dashed=True, fill="none")
    gx0, gx1 = xs[0] + bw, xs[1]
    gc = (gx0 + gx1) / 2
    d.line([(gx0 + 6, by + 26), (gx1 - 6, by + 26)])
    alabel(d, gc, by + 4, 100, "開く")
    d.line([(gx1 - 6, by + 58), (gx0 + 6, by + 58)])
    alabel(d, gc, by + 62, 100, "適用")
    d.line([(xs[1] + bw + 6, by + bh3 / 2), (xs[2] - 6, by + bh3 / 2)])
    alabel(d, (xs[1] + bw + xs[2]) / 2, by + bh3 / 2 - 48, 150, "キャンセル、\nEscape、閉じる")
    d.save("filter-draft")


# ---------------------------------------------------------------- 4 一覧と詳細の表示方式
def list_detail_modes():
    d = D()
    W, G, H = 210, 26, 150
    items = [("Sheet", "非モーダル", "簡単な詳細の確認に使う\n背景を暗くせず、\n一覧の別の行に切り替えられる"),
             ("別ページ", "", "情報量が多い詳細、\n複雑な操作に使う\n一覧に戻ると、\n条件と位置を復元する"),
             ("Split View", "", "連続して複数の情報を\n処理する場合に使う\n一覧と詳細を並べる"),
             ("Inline Expansion", "", "少量の補足、\n複数行の比較に使う\n行の下に開く")]

    def rows(x, y, w, n=4, sel=1, bw_=None):
        for k in range(n):
            ry = y + k * 28
            if k == sel:
                d.rect(x - 6, ry - 8, w + 12, 24, fill=ACCENT_SURFACE, r=6)
            d.bar(x, ry, (bw_ or w) * (0.9 if k % 2 == 0 else 0.7), 6, fill=BAR_STRONG if k == sel else BAR)

    for i, (name, tag, use) in enumerate(items):
        x = i * (W + G)
        if i == 1:
            for px in (x + 14, x + W - 90):
                d.rect(px, 14, 76, H - 28, fill="none", stroke=LINE, r=8, sw=1)
            rows(x + 26, 38, 52, sel=1)
            d.bar(x + W - 78, 30, 40, 8, fill=TEXT)
            for k in range(4):
                d.bar(x + W - 78, 54 + k * 18, 52 if k % 2 == 0 else 40, 6)
            d.line([(x + 96, H / 2), (x + 118, H / 2)])
        else:
            d.rect(x, 0, W, H, fill="none", stroke=LINE, r=12, sw=1.2)
        if i == 0:
            rows(x + 18, 34, 70)
            d.rect(x + W - 100, 12, 88, H - 24, fill=SURFACE, stroke=LINE, r=8, sw=1)
            d.bar(x + W - 88, 28, 44, 8, fill=TEXT)
            for k in range(4):
                d.bar(x + W - 88, 52 + k * 18, 62 if k % 2 == 0 else 46, 6)
        elif i == 2:
            rows(x + 18, 34, 70)
            d.line([(x + 110, 12), (x + 110, H - 12)], color=LINE, arrow=False, sw=1)
            d.bar(x + 126, 28, 44, 8, fill=TEXT)
            for k in range(4):
                d.bar(x + 126, 52 + k * 18, 62 if k % 2 == 0 else 46, 6)
        elif i == 3:
            for k, ry in enumerate((22, 50, 118)):
                d.bar(x + 20, ry, 140 if k != 1 else 120, 6, fill=BAR_STRONG if k == 1 else BAR)
            d.rect(x + 12, 40, W - 24, 24, fill=ACCENT_SURFACE, r=6, opacity=100)
            d.bar(x + 20, 50, 120, 6, fill=BAR_STRONG)
            d.rect(x + 12, 70, W - 24, 38, fill=SURFACE, r=6)
            d.bar(x + 24, 80, 120, 6)
            d.bar(x + 24, 94, 90, 6)
            d.bar(x + 20, 122, 130, 6)
        T(d, x, H + 20, W, name, S_NAME, TEXT, bold=True)
        if tag:
            T(d, x + 66, H + 22, W - 66, tag, S_SUB, MUTED)
        T(d, x, H + 50, W, use, S_SUB, MUTED)
    by = H + 168
    d.rect(0, by, 4 * W + 3 * G, 72, fill=SURFACE)
    T(d, 24, by + 14, 860, "編集はモーダルの Sheet（複雑な編集は別ページ）", S_NAME, TEXT, bold=True)
    T(d, 24, by + 42, 860, "未保存の変更は、破棄してよいかを確認する", S_SUB, MUTED)
    d.save("list-detail-modes")


# ---------------------------------------------------------------- 5 一覧への復帰と状態復元
def list_return():
    d = D()
    W = 960
    fy, fh = 30, 64
    state(d, 170, fy, 170, fh, "一覧")
    state(d, 620, fy, 170, fh, "詳細ページ")
    d.line([(346, fy + 20), (614, fy + 20)])
    alabel(d, 480, fy - 6, 260, "行の名前のリンク")
    d.line([(614, fy + 46), (346, fy + 46)])
    alabel(d, 480, fy + 52, 260, "戻る、ブラウザの戻る")
    y2, h2 = 200, 304
    # 離れるときに保存する
    d.rect(0, y2, 450, h2, fill=SURFACE, r=14)
    T(d, 24, y2 + 20, 400, "離れるときに保存する", S_NAME, TEXT, bold=True)
    saved = ["検索語", "フィルター", "ソート", "ページ番号", "ページサイズ", "縦のスクロール（main）",
             "横のスクロール（表）", "フォーカスしていた行の ID と位置"]
    for k, s in enumerate(saved):
        yy = y2 + 62 + k * 28
        d.dot(32, yy + 10, d=6, fill=BAR_STRONG, stroke=BAR_STRONG)
        T(d, 48, yy, 380, s, S_SUB, TEXT)
    # 戻ったときの復元の順序
    X = 510
    d.rect(X, y2, 450, h2, fill=SURFACE, r=14)
    T(d, X + 24, y2 + 20, 400, "戻ったときの復元の順序", S_NAME, TEXT, bold=True)
    order = [("1", "条件を戻して取得する", None), ("2", "取得が終わってから", "スクロールの位置を戻す"),
             ("3", "行のリンクにフォーカスする", None)]
    yy = y2 + 62
    for n, a, b in order:
        d.text(X + 24, yy, 24, 20, n, S_NUM, ACCENT, bold=True)
        T(d, X + 52, yy, 370, a, S_SUB, TEXT)
        if b:
            T(d, X + 52, yy + 22, 370, b, S_SUB, TEXT)
            yy += 22
        yy += 40
    d.line([(X + 24, y2 + 206), (X + 426, y2 + 206)], color=LINE, arrow=False, sw=1)
    T(d, X + 24, y2 + 222, 400, "行がない場合", S_SUB, TEXT, bold=True)
    T(d, X + 24, y2 + 248, 400, "同じ位置の行にフォーカスする\nなければ検索欄、Empty の操作", S_SUB, MUTED)
    d.line([(454, y2 + 150), (506, y2 + 150)])
    d.line([(255, fy + fh), (255, y2 - 6)], dashed=True, sw=1.2)
    T(d, 269, 124, 200, "離れるとき", 14, MUTED)
    d.line([(705, fy + fh), (705, y2 - 6)], dashed=True, sw=1.2)
    T(d, 719, 124, 220, "一覧に戻ったとき", 14, MUTED)
    fy2 = y2 + h2 + 32
    d.rect(0, fy2, W, 76, fill=SURFACE)
    T(d, 24, fy2 + 14, 900, "URL への同期と保存は製品の責務", S_NAME, TEXT, bold=True)
    T(d, 24, fy2 + 44, 900, "個人情報は URL に入れない", S_SUB, MUTED)
    d.save("list-return")


# ---------------------------------------------------------------- 6 ページ内選択と全件選択
def bulk_selection_scope():
    d = D()
    BW, GX, X2 = 450, 40, 490
    blocks = [(0, "ページ内の選択", "このページの 50件を選択中",
               ["選択は行の ID で持つ", "ページを移動しても、ID で残す", "表示していない件数を示す"],
               "例：3件を選択中（表示していない 2件を含む）"),
              (X2, "検索結果全件の選択", "検索結果 580件をすべて選択",
               ["選択は検索条件と除外した ID で持つ", "件数が正確にわからない場合は、", "件数を表示しない"],
               None)]
    for x, name, banner, lines, ex in blocks:
        d.rect(x, 0, BW, 372, fill=SURFACE, r=14)
        T(d, x + 24, 20, 400, name, S_NAME, TEXT, bold=True)
        d.rect(x + 24, 60, BW - 48, 40, fill=WHITE, stroke=ACCENT, r=10, sw=1.2)
        d.text(x + 24, 60, BW - 48, 40, banner, 16, TEXT, bold=True, align="center", valign="middle")
        d.rect(x + 24, 114, BW - 48, 122, fill=WHITE, r=10)
        for k in range(4):
            ry = 130 + k * 26
            checkbox(d, x + 40, ry - 4, True)
            d.bar(x + 68, ry, 110 if k % 2 == 0 else 80, 6)
            d.bar(x + 230, ry, 90, 6)
        for k, ln in enumerate(lines):
            T(d, x + 24, 256 + k * 24, BW - 48, ln, S_SUB, TEXT, step=24)
        if ex:
            T(d, x + 24, 256 + 3 * 24 + 2, BW - 48, ex, 14, MUTED)
    y = 410
    d.text(0, y, 400, 18, "条件を変えたとき", S_LABEL, MUTED, bold=True)
    for x, pill, res in ((0, "個別の選択", "ID で保持する"),
                         (X2, "全件の選択", "解除して知らせる\n（または元の条件に固定して示す）")):
        d.rect(x, y + 34, 140, 40, fill=SURFACE, r=10)
        d.text(x, y + 34, 140, 40, pill, S_SUB, TEXT, bold=True, align="center", valign="middle")
        d.line([(x + 150, y + 54), (x + 200, y + 54)])
        if "\n" in res:
            T(d, x + 212, y + 42, 280, res, S_SUB, TEXT)
        else:
            T(d, x + 212, y + 44, 280, res, S_SUB, TEXT)
    ny = y + 112
    d.rect(0, ny, 940, 52, fill=SURFACE)
    T(d, 24, ny + 15, 880, "実行の対象の確定、権限、件数の検証はバックエンドの責務", S_SUB, TEXT, bold=True)
    d.save("bulk-selection-scope")


# ---------------------------------------------------------------- 7 一括操作の状態遷移
def bulk_action_states():
    d = D()
    oy = 56
    # 結果の列
    RX, RW, RG = 780, 190, 16
    results = [("すべて成功", ["選択を解除する", "Toast で知らせる"]),
               ("一部失敗", ["成功分の選択を解除", "失敗分は選択のまま", "結果を画面に残す", "失敗分だけ再試行"]),
               ("すべて失敗", ["選択を維持する", "再試行できる"]),
               ("結果が不明", ["無条件に再試行しない", "最新の状態を確認する"])]
    ys, y = [], oy
    for title, subs in results:
        h = hh(len(subs))
        ys.append((y, h))
        state(d, RX, y, RW, h, title, subs)
        y += h + RG
    total = y - RG - oy
    mid = oy + total / 2
    # 主な流れ
    mh = 64
    my = mid - mh / 2
    boxes = [(0, 110, "選択なし", ["操作バーを表示しない"]),
             (190, 120, "選択中", ["操作バーを", "表示する"]),
             (390, 140, "確認", ["不可逆な操作は", "Alert Dialog で確認", "対象、件数、変更内容、", "取り消せるか"]),
             (600, 140, "実行中", ["開始時に対象を固定", "二重実行を防ぐ", "実際の進捗がある", "ときだけ Progress を", "表示する"])]
    for x, w, title, subs in boxes:
        state(d, x, my, w, mh, title)
        sw_ = 190 if title in ("確認", "実行中") else w + 40
        T(d, x + (0 if title in ("確認", "実行中") else 0), my + mh + 12, sw_, "\n".join(subs), 14 if title == "選択なし" else S_SUB, MUTED, step=22)
    labels = ["行を選ぶ", "操作", "実行"]
    for i in range(3):
        x0 = boxes[i][0] + boxes[i][1]
        x1 = boxes[i + 1][0]
        d.line([(x0 + 6, my + mh / 2), (x1 - 6, my + mh / 2)])
        alabel(d, (x0 + x1) / 2, my + mh / 2 - 26, x1 - x0, labels[i])
    # 結果への分岐
    ex = boxes[3][0] + boxes[3][1]
    bus = ex + 24
    d.line([(ex + 6, mid), (bus, mid)], arrow=False)
    d.line([(bus, ys[0][0] + ys[0][1] / 2), (bus, ys[3][0] + ys[3][1] / 2)], arrow=False)
    for (yy, h) in ys:
        d.line([(bus, yy + h / 2), (RX - 6, yy + h / 2)])
    # 失敗分だけ再試行（一部失敗 → 実行中）
    cy = ys[1][0] + ys[1][1] / 2
    rx = RX + RW + 22
    top = oy - 30
    cx = boxes[3][0] + boxes[3][1] / 2
    d.line([(RX + RW + 2, cy), (rx, cy), (rx, top), (cx, top), (cx, my - 6)], color=ACCENT, sw=1.5)
    alabel(d, (cx + rx) / 2, top - 26, 240, "失敗分だけ再試行", color=ACCENT, size=14)
    # 低リスクで元に戻せる操作
    uy = my + mh + 12 + 4 * 22 + 40
    uy = max(uy, 440)
    T(d, 0, (my + mh + uy) / 2 - 4, 276, "低リスクで取り消せる操作は\n確認しない", S_SUB, MUTED, bold=True, align="right")
    d.line([(290, my + mh), (290, uy - 6)], dashed=True, sw=1.2)
    state(d, 190, uy, 120, 56, "実行")
    state(d, 390, uy, 140, 56, "元に戻す")
    d.line([(316, uy + 28), (384, uy + 28)])
    T(d, 390, uy + 66, 190, "Toast で「元に戻す」を示す", 14, MUTED)
    d.save("bulk-action-states")


# ---------------------------------------------------------------- 8 表示形式の使い分け
def view_choice():
    d = D()
    W, G, H = 170, 28, 124
    items = [("Table", "多数の属性を比較する"), ("List", "順番に情報を確認する"),
             ("Card", "個々の情報を\n独立した単位として\n認識する"), ("Kanban", "状態や進捗を把握する"),
             ("Calendar", "日付や時間の関係を\n把握する")]
    for i, (name, use) in enumerate(items):
        x = i * (W + G)
        d.rect(x, 0, W, H, fill="none", stroke=ACCENT if i == 0 else LINE, r=12, sw=1.5 if i == 0 else 1.2)
        if i == 0:
            for k, cx in enumerate((14, 66, 118)):
                d.bar(x + cx, 18, 36, 6, fill=BAR_STRONG)
            for k in range(4):
                ry = 40 + k * 20
                d.line([(x + 1, ry - 8), (x + W - 1, ry - 8)], color=BAR, arrow=False, sw=1)
                for cx in (14, 66, 118):
                    d.bar(x + cx, ry, 30 if k % 2 == 0 else 24, 5)
        elif i == 1:
            for k in range(4):
                ry = 20 + k * 25
                d.dot(x + 20, ry + 3, d=8, fill="none", stroke=BAR_STRONG)
                d.bar(x + 36, ry, 100 if k % 2 == 0 else 80, 6, fill=BAR_STRONG if k == 0 else BAR)
                if k < 3:
                    d.line([(x + 14, ry + 16), (x + W - 14, ry + 16)], color=BAR, arrow=False, sw=1)
        elif i == 2:
            for k in range(4):
                cx, cy = x + 14 + (k % 2) * 76, 14 + (k // 2) * 56
                d.rect(cx, cy, 66, 48, fill=SURFACE, r=8)
                d.bar(cx + 10, cy + 12, 30, 6, fill=BAR_STRONG)
                d.bar(cx + 10, cy + 28, 42, 5)
        elif i == 3:
            for k in range(3):
                cx = x + 12 + k * 52
                d.rect(cx, 14, 46, H - 28, fill=SURFACE, r=8)
                for j in range(3 - k if k < 2 else 1):
                    d.rect(cx + 6, 24 + j * 28, 34, 22, fill=WHITE, r=5)
                    d.bar(cx + 11, 32 + j * 28, 22, 5)
        else:
            cw_ = (W - 28) / 7
            for k in range(4):
                for j in range(7):
                    d.rect(x + 14 + j * cw_, 16 + k * 24, cw_ - 3, 20, fill=SURFACE, r=3)
            for (j, k, ww) in ((1, 1, 1), (3, 2, 2), (5, 0, 1)):
                d.rect(x + 14 + j * cw_ + 2, 16 + k * 24 + 12, cw_ * ww - 7, 5, fill=BAR_STRONG, r=2)
        T(d, x, H + 20, W, name, S_NAME, TEXT, bold=True)
        if i == 0:
            T(d, x + 64, H + 22, 60, "標準", S_SUB, ACCENT, bold=True)
        T(d, x, H + 50, W, use, S_SUB, MUTED)
    # 切り替えの位置
    y = 300
    d.text(0, y, 500, 18, "切り替えの位置", S_LABEL, MUTED, bold=True)
    my = y + 34
    d.rect(0, my, 440, 176, fill="none", stroke=LINE, r=14, sw=1)
    d.bar(24, my + 24, 110, 12, fill=TEXT)
    seg_switch(d, 440 - 24 - 120, my + 54, 120, 28, accent=True)
    d.rect(24, my + 92, 392, 64, fill="none", stroke=LINE, r=8, dashed=True, sw=1.2)
    for k in range(3):
        d.bar(40, my + 106 + k * 14, 150 if k % 2 == 0 else 110, 5)
        d.bar(230, my + 106 + k * 14, 70, 5)
    d.line([(486, my + 68), (446, my + 68)], color=ACCENT)
    T(d, 496, my + 46, 440, "切り替えは対象のデータ領域の直上・右", S_NAME, TEXT, bold=True)
    T(d, 496, my + 78, 440, "Segmented Control を右に寄せて置く", S_SUB, MUTED)
    by = my + 176 + 36
    d.rect(0, by, 5 * W + 4 * G, 88, fill=SURFACE)
    T(d, 24, by + 16, 880, "業務データは Table を基本にする", S_NAME, TEXT, bold=True)
    T(d, 24, by + 48, 880, "異なる作業目的がある場合だけ切り替えを提供する。見た目の変化だけを理由に形式を増やさない", S_SUB, MUTED)
    d.save("view-choice")


# ---------------------------------------------------------------- 9 表示形式ごとの状態管理
def view_state_scope():
    d = D()
    BH = 220
    d.text(0, 0, 400, 18, "表示形式を変えても維持する", S_LABEL, MUTED, bold=True)
    d.rect(0, 30, 330, BH, fill=SURFACE, r=14)
    keep = ["検索語", "フィルター", "選択中のレコード ID", "詳細の表示（対応できる場合）", "切り替え先でも意味を持つソート"]
    for k, s in enumerate(keep):
        yy = 56 + k * 34
        d.dot(32, yy + 10, d=6, fill=BAR_STRONG, stroke=BAR_STRONG)
        T(d, 48, yy, 270, s, S_SUB, TEXT)
    d.text(390, 0, 400, 18, "表示形式ごとに持つ", S_LABEL, MUTED, bold=True)
    cols = [("Table", ["ページ番号", "スクロール位置", "列の設定"]), ("Kanban", ["グループ", "スクロール位置"]),
            ("Calendar", ["表示期間"])]
    for i, (name, items) in enumerate(cols):
        x = 390 + i * 190
        d.rect(x, 30, 170, BH, fill=SURFACE, r=14)
        T(d, x + 22, 48, 130, name, S_NAME, TEXT, bold=True)
        for k, s in enumerate(items):
            yy = 92 + k * 34
            d.dot(x + 28, yy + 10, d=6, fill=BAR_STRONG, stroke=BAR_STRONG)
            T(d, x + 44, yy, 120, s, S_SUB, TEXT)
    y = 30 + BH + 50
    d.text(0, y, 400, 18, "最初の表示形式", S_LABEL, MUTED, bold=True)
    steps = [("1", "URL などで\n指定された形式"), ("2", "そのページで\n前回使った形式"), ("3", "製品の標準")]
    for i, (n, s) in enumerate(steps):
        x = i * 290
        d.rect(x, y + 34, 230, 68, fill=SURFACE, r=12)
        d.text(x + 20, y + 34, 24, 68, n, S_NUM, ACCENT, bold=True, valign="middle")
        lines = s.split("\n")
        yy = y + 34 + (68 - 22 * len(lines)) / 2
        T(d, x + 52, yy, 170, s, S_SUB, TEXT)
        if i < 2:
            d.line([(x + 236, y + 68), (x + 284, y + 68)])
    T(d, 0, y + 128, 600, "保存は製品の責務", S_SUB, MUTED, bold=True)
    d.save("view-state-scope")


# ---------------------------------------------------------------- 10 Data States の状態遷移
def data_state_transitions():
    d = D()
    oy = 44
    h4 = hh(1)
    ys = [oy + k * (h4 + 18) for k in range(4)]
    cy = (ys[0] + ys[3] + h4) / 2
    ih = hh(2)
    state(d, 0, cy - ih / 2, 210, ih, "初回読み込み", ["Skeleton を表示する", "200ms 未満なら表示しない"])
    res = [("取得成功", "データを表示する"), ("未登録", "Empty、登録の操作"),
           ("検索結果 0件", "Empty、条件の変更と解除"), ("取得失敗", "Error、再取得")]
    RX, RW = 300, 230
    for k, (t, s) in enumerate(res):
        state(d, RX, ys[k], RW, h4, t, [s])
    bus = 255
    d.line([(216, cy), (bus, cy)], arrow=False)
    d.line([(bus, ys[0] + h4 / 2), (bus, ys[3] + h4 / 2)], arrow=False)
    for k in range(4):
        d.line([(bus, ys[k] + h4 / 2), (RX - 6, ys[k] + h4 / 2)])
    # 部分的な失敗
    ph = hh(2)
    state(d, RX, ys[3] + h4 + 40, RW, ph, "部分的な失敗", ["利用できるデータ＋", "失敗した領域の Alert"],
          fill="none", stroke=LINE, dashed=True)
    # 再取得中
    X3, W3 = 650, 230
    rh = hh(2)
    state(d, X3, oy, W3, rh, "再取得中", ["既存のデータ＋更新中", "古いデータへの操作を制限"])
    d.line([(RX + RW + 6, oy + 24), (X3 - 6, oy + 24)])
    alabel(d, (RX + RW + X3) / 2, oy - 24, 120, "条件の変更、\n再読み込み")
    d.line([(X3 - 6, oy + 54), (RX + RW + 6, oy + 54)])
    alabel(d, (RX + RW + X3) / 2, oy + 62, 120, "取得成功")
    o1y, o1h = oy + rh + 44, hh(3)
    o2y = o1y + o1h + 28
    state(d, X3, o1y, W3, o1h, "再取得の失敗", ["同じ条件の場合", "既存のデータ＋Alert", "最終取得時刻を表示"])
    state(d, X3, o2y, W3, o1h, "取得失敗", ["条件を変えた後の失敗", "古い条件のデータを", "表示しない"])
    bx = X3 + W3 + 26
    for yy in (o1y + o1h / 2, o2y + o1h / 2):
        d.line([(X3 + W3 + 6, oy + rh / 2), (bx, oy + rh / 2), (bx, yy), (X3 + W3 + 6, yy)])
    # どの状態からでも
    Yb = max(o2y + o1h, ys[3] + h4 + 40 + ph) + 90
    d.dot(bx, Yb, d=8, fill=LINE, stroke=LINE)
    d.line([(bx, Yb), (105, Yb), (105, cy + ih / 2 + 6)])
    T(d, 125, Yb - 52, 700, "どの状態からでも", S_SUB, TEXT, bold=True)
    T(d, 125, Yb - 28, 760, "アカウント、ワークスペースの切り替え：データを破棄して初回読み込み", S_SUB, MUTED)
    ny = Yb + 40
    d.rect(0, ny, bx, 56, fill=SURFACE)
    T(d, 24, ny + 17, 860, "操作の制限はすぐに行い、読み込みの表示だけを 200ms 遅らせる", S_SUB, TEXT, bold=True)
    d.save("data-state-transitions")


for f in (data_browsing, search_filter_layout, filter_draft, list_detail_modes, list_return, bulk_selection_scope,
          bulk_action_states, view_choice, view_state_scope, data_state_transitions):
    f()
print("ok data-browsing")
