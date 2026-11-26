"""Generate Data Analysis (Patterns) diagrams (.drawio) with the shared visual vocabulary of gen.py.

Usage: python3 scripts/diagrams/gen_data_analysis.py [output_dir]
Importing gen also regenerates the diagrams defined there. The output is deterministic.
"""
import os
import sys

sys.dont_write_bytecode = True  # import gen で __pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gen  # noqa: E402,F401
from gen import (  # noqa: E402
    ACCENT, ACCENT_SURFACE, BAR, BAR_STRONG, DANGER, LINE, MUTED, S_LABEL, S_NAME, S_NUM, S_SUB, SUCCESS_C,
    SURFACE, TEXT, WARNING_C, D,
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


def M(d, x, y, w, h, text, size=S_SUB, color=TEXT, bold=False, align="center"):
    """箱の中で上下中央に置く 1 行のテキスト"""
    if est(text, size, bold) > w:
        print(f"WARN width {est(text, size, bold):.0f}>{w}: {text}", file=sys.stderr)
    d.text(x, y, w, h, text, size, color, bold=bold, align=align, valign="middle")


def num(d, n, x, y):
    d.dot(x, y, d=24, fill=ACCENT_SURFACE, stroke=ACCENT)
    d.text(x - 12, y - 12, 24, 24, n, 14, ACCENT, bold=True, align="center", valign="middle")


def chip(d, x, y, w, text, fill=SURFACE, stroke="none", color=TEXT, size=14, h=28, bold=False, dashed=False):
    d.rect(x, y, w, h, fill=fill, stroke=stroke, r=h // 2, sw=1.2, dashed=dashed)
    if est(text, size, bold) > w - 16:
        print(f"WARN chip {text}", file=sys.stderr)
    d.text(x, y, w, h, text, size, color, bold=bold, align="center", valign="middle")


def bars(d, x, base, hs, w=24, gap=14, fills=None):
    for i, h in enumerate(hs):
        f = fills[i] if fills else BAR
        d.rect(x + i * (w + gap), base - h, w, h, fill=f, r=4)


def stack(d, x, y, n, w=70, step=12, fill=BAR):
    for k in range(n):
        d.bar(x, y + k * step, w if k % 3 else w - 14, 6, fill=fill)


def note(d, x, y, w, h, lines, fill=SURFACE, stroke="none", bold_first=False, size=S_SUB):
    d.rect(x, y, w, h, fill=fill, stroke=stroke, r=14, sw=1.2)
    total = 22 * len(lines)
    y0 = y + (h - total) / 2 + 1
    for k, ln in enumerate(lines):
        T(d, x + 24, y0 + k * 22, w - 48, ln, size, TEXT if (k == 0 and bold_first) or not bold_first else MUTED,
          bold=(k == 0 and bold_first))


# ---------------------------------------------------------------- 1 Data Analysis の 5 種類の関係
def data_analysis():
    d = D()
    W, bw, gap = 920, 270, 55
    d.rect(0, 0, W, 92, fill="none", stroke=LINE, r=12, dashed=True, sw=1.2)
    T(d, 24, 14, 400, "Dashboard Layout", S_NAME, TEXT, bold=True)
    T(d, 24, 44, 840, "考える順に並べる。Overview → Trend → Breakdown → Detail → Action", S_SUB, TEXT)
    T(d, W - 324, 14, 300, "画面全体に適用する", 14, MUTED, align="right")
    y0, h = 136, 124
    steps = [("Metric Overview", "現在の状況を知る", "主要指標、比較、目標"),
             ("Period Comparison", "何が変化したか", "前期間、前年同期、同経過期間"),
             ("Drill-down", "なぜ・どこで変化したか", "内訳、明細、業務画面")]
    for i, (name, purpose, sub) in enumerate(steps):
        x = i * (bw + gap)
        d.rect(x, y0, bw, h, fill=SURFACE, r=14)
        d.text(x + 22, y0 + 16, 40, 18, str(i + 1), S_NUM, ACCENT, bold=True)
        T(d, x + 22, y0 + 38, bw - 44, name, S_NAME, TEXT, bold=True)
        T(d, x + 22, y0 + 68, bw - 44, purpose, S_SUB, TEXT)
        T(d, x + 22, y0 + 92, bw - 44, sub, S_SUB, MUTED)
        if i < 2:
            d.line([(x + bw + 6, y0 + h / 2), (x + bw + gap - 6, y0 + h / 2)])
    by = y0 + h + 56
    for i in range(3):
        sx = i * (bw + gap) + bw / 2
        d.line([(sx, y0 + h), (sx, by)], color=ACCENT, arrow=False, sw=1.2)
        d.dot(sx, by, d=8, fill=ACCENT, stroke=ACCENT)
    d.rect(0, by, W, 104, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.2)
    T(d, 24, by + 18, 400, "Analysis Filters", S_NAME, TEXT, bold=True)
    T(d, 24, by + 48, 400, "対象と期間を決める", S_SUB, TEXT)
    T(d, 24, by + 72, 700, "全体条件、個別条件、集計単位", S_SUB, MUTED)
    T(d, W - 424, by + 18, 400, "すべての領域の前提になる条件", 14, ACCENT, bold=True, align="right")
    d.save("data-analysis")


# ---------------------------------------------------------------- 2 Metric の情報構成と優先順位
def metric_anatomy():
    d = D()
    d.rect(0, 0, 330, 232, fill=WHITE, stroke=LINE, r=14, sw=1.2)
    T(d, 52, 20, 200, "月次経常収益（MRR）", 14, TEXT, bold=True)
    d.dot(276, 31, d=16, fill="none", stroke=BAR_STRONG)
    d.text(268, 23, 16, 16, "i", 11, BAR_STRONG, bold=True, align="center", valign="middle")
    d.text(52, 46, 260, 48, "4.42億円", 36, TEXT, bold=True, valign="middle")
    T(d, 52, 102, 262, "前月比 +4.2%　前月 4.24億円", 14, MUTED)
    T(d, 52, 130, 262, "目標 4.50億円（達成率 98%）", 14, MUTED)
    pts = [(52, 198), (80, 192), (108, 195), (136, 184), (164, 178), (192, 170)]
    d.line(pts, color=ACCENT, arrow=False, sw=1.5)
    d.dot(192, 170, d=8, fill=ACCENT, stroke=ACCENT)
    for n, cy in (("1", 31), ("2", 70), ("3", 112), ("4", 140), ("5", 184)):
        num(d, n, 24, cy)
    num(d, "6", 312, 31)
    rows = ["指標名（14px / 500）", "現在値と単位（36px / 600。最重要は 48px / 700）",
            "比較値（14px）。比較対象の実数も並べる", "目標（実際に目標がある場合だけ）",
            "Sparkline（推移に意味がある場合だけ）", "定義（Popover で示す）"]
    for k, s in enumerate(rows):
        yy = 8 + k * 38
        num(d, str(k + 1), 382, yy + 12)
        M(d, 406, yy, 514, 24, s, S_SUB, TEXT, align="left")
    py = 262
    d.text(0, py, 300, 18, "優先順位", S_LABEL, MUTED, bold=True)
    d.rect(0, py + 28, 300, 84, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.2)
    T(d, 24, py + 44, 252, "必須", 14, ACCENT, bold=True)
    T(d, 24, py + 72, 252, "指標名、現在値", 16, TEXT, bold=True)
    d.rect(324, py + 28, 596, 84, fill=SURFACE, r=14)
    T(d, 348, py + 44, 548, "必要な場合だけ", 14, MUTED, bold=True)
    T(d, 348, py + 72, 548, "単位、比較値、比較対象、目標、Sparkline、定義、詳細への移動", S_SUB, TEXT)
    ly = 410
    d.text(0, ly, 600, 18, "数値の大きさ（上位ほど大きい）", S_LABEL, MUTED, bold=True)
    cw, g = 215, 20
    ladder = [("特別に強調", 48, 700), ("主要", 36, 600), ("補助", 28, 600), ("コンパクト", 20, 600)]
    for i, (nm, sz, wt) in enumerate(ladder):
        x = i * (cw + g)
        d.rect(x, ly + 28, cw, 132, fill=SURFACE, r=14)
        val = "428社"
        if est(val, sz, True) > cw - 32:
            print(f"WARN ladder {nm}", file=sys.stderr)
        d.text(x + 20, ly + 40, cw - 40, 56, val, sz, TEXT, bold=True, valign="bottom")
        T(d, x + 20, ly + 106, cw - 40, nm, S_SUB, TEXT, bold=True)
        T(d, x + 20, ly + 130, cw - 40, f"{sz}px / {wt}", 14, MUTED)
    d.save("metric-anatomy")


# ---------------------------------------------------------------- 3 数値の増減と良否の関係
def change_evaluation():
    d = D()
    colx = [224, 456, 688]
    cw = 224
    for i, nm in enumerate(["増加", "減少", "変化なし"]):
        M(d, colx[i], 0, cw, 28, nm, S_SUB, MUTED, bold=True)
    rows = [("増加が望ましい", "売上",
             [("↑ +8.2%", "改善", SUCCESS_C), ("↓ −3.1%", "悪化", DANGER), ("→ 0%", "変化なし", MUTED)]),
            ("減少が望ましい", "解約率、エラー率",
             [("↑ +0.5pt", "悪化", DANGER), ("↓ −0.8pt", "改善", SUCCESS_C), ("→ 0pt", "変化なし", MUTED)]),
            ("良否を定義しない", "問い合わせ件数",
             [("↑ +3件", "中立", MUTED), ("↓ −3件", "中立", MUTED), ("→ 0件", "変化なし", MUTED)])]
    for r, (ttl, sub, cells) in enumerate(rows):
        y = 44 + r * 76
        T(d, 20, y + 10, 190, ttl, 16, TEXT, bold=True)
        T(d, 20, y + 34, 190, sub, 14, MUTED)
        for c, (val, word, col) in enumerate(cells):
            x = colx[c]
            d.rect(x, y, cw, 64, fill=SURFACE, r=12)
            vw = est(val, 18, True)
            d.text(x + 24, y, vw + 4, 64, val, 18, TEXT, bold=True, valign="middle")
            d.text(x + 24 + vw + 20, y, 100, 64, word, 16, col, bold=True, valign="middle")
    ny = 44 + 3 * 76 + 12
    note(d, 0, ny, 912, 88, ["増減の向きは矢印と符号で、良否は文字でも示す。色だけで伝えない。",
                              "評価の方向は製品が指標ごとに定義する"], fill=ACCENT_SURFACE, stroke=ACCENT, bold_first=True)
    d.save("change-evaluation")


# ---------------------------------------------------------------- 4 Dashboard の思考順序
def dashboard_flow():
    d = D()
    bands = [("1", "Overview", "現在の状況はどうか", "主要指標"),
             ("2", "Trend", "どのように変化したか", "推移のグラフ"),
             ("3", "Breakdown", "なぜ変化したか", "内訳・増減要因"),
             ("4", "Detail", "具体的にどこか", "明細の表"),
             ("5", "Action", "次に何をするか", "業務画面への移動")]
    bw, bh, step = 600, 88, 110
    for i, (n, nm, q, what) in enumerate(bands):
        y = i * step
        d.rect(0, y, bw, bh, fill=SURFACE, r=14)
        d.text(22, y + 18, 40, 18, n, S_NUM, ACCENT, bold=True)
        T(d, 56, y + 16, 280, nm, S_NAME, TEXT, bold=True)
        T(d, 56, y + 48, 280, q, S_SUB, TEXT)
        T(d, 360, y + 34, 220, what, S_SUB, MUTED)
        if i < 4:
            d.line([(30, y + bh + 2), (30, y + step - 2)])
    d.text(640, 0, 280, 18, "Dashboard の型と厚くする領域", S_LABEL, MUTED, bold=True)
    types = [("Strategic", ["1・2 を厚く"]), ("Analytical", ["3・4 を厚く"]),
             ("Operational", ["異常と対応が必要な", "情報を先頭に"])]
    for i, (nm, subs) in enumerate(types):
        y = 28 + i * 116
        d.rect(640, y, 280, 104, fill=SURFACE, r=14)
        T(d, 664, y + 18, 232, nm, S_NAME, TEXT, bold=True)
        for k, s in enumerate(subs):
            T(d, 664, y + 50 + k * 22, 232, s, S_SUB, TEXT if k == 0 else TEXT)
    ny = 4 * step + bh + 28
    note(d, 0, ny, 920, 56, ["すべての領域を必須にしない"], fill="none", bold_first=True)
    d.rect(0, ny, 920, 56, fill="none", stroke=LINE, r=14, dashed=True, sw=1.2)
    d.save("dashboard-flow")


# ---------------------------------------------------------------- 5 全体条件と個別条件の適用範囲
def filter_scope():
    d = D()
    PW = 640
    d.rect(0, 0, PW, 500, fill="none", stroke=LINE, r=16, sw=1.5)
    d.rect(16, 14, PW - 32, 72, fill=ACCENT_SURFACE, stroke=ACCENT, r=12, sw=1.2)
    T(d, 32, 20, 300, "全体条件（ページ全体に適用）", 13, ACCENT, bold=True)
    chip(d, 32, 46, 164, "期間：2026年11月", fill=WHITE, stroke=LINE)
    chip(d, 206, 46, 110, "地域：関東", fill=WHITE, stroke=LINE)
    chip(d, 326, 46, 110, "比較：前月", fill=WHITE, stroke=LINE)

    def chart(x, y, w, h, title, hs):
        d.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=10, sw=1)
        T(d, x + 14, y + 10, 150, title, 13, MUTED, bold=True)
        bars(d, x + 24, y + h - 14, hs, w=26, gap=16)
    # A, B
    chart(24, 150, 288, 130, "Chart A", [40, 62, 50, 74, 58])
    chart(328, 150, 288, 130, "Chart B", [28, 40, 34, 50, 38])
    d.line([(100, 88), (100, 148)], color=ACCENT)
    T(d, 110, 108, 90, "引き継ぐ", 14, ACCENT, bold=True)
    d.line([(380, 88), (380, 148)], color=ACCENT)
    chip(d, 452, 112, 164, "プラン：スタンダード", fill=SURFACE, stroke=LINE)
    T(d, 24, 288, 290, "全体の条件を引き継ぐ", 14, MUTED)
    T(d, 328, 288, 290, "全体の条件＋プラン（さらに絞り込む）", 14, MUTED)
    # C
    chart(24, 340, 380, 130, "Chart C", [30, 44, 38, 58, 52, 70, 64])
    d.rect(424, 360, 192, 90, fill="none", stroke=WARNING_C, r=12, dashed=True, sw=1.5)
    T(d, 440, 378, 164, "期間：過去12か月", 14, WARNING_C, bold=True)
    T(d, 440, 404, 164, "（全体の期間とは別）", 14, TEXT)
    d.line([(404, 405), (418, 405)], color=WARNING_C, arrow=False, sw=1.5, dashed=True)
    # legend
    lx = 690
    d.text(lx, 0, 230, 18, "適用範囲の規則", S_LABEL, MUTED, bold=True)
    items = [(ACCENT, "全体条件はページ全体に\n適用する"), (LINE, "個別条件は対象の直上・\n右に置く"),
             (WARNING_C, "例外の条件は対象の近くで\n明示する"), (BAR_STRONG, "解除の範囲を分ける")]
    for k, (col, s) in enumerate(items):
        yy = 36 + k * 76
        d.dot(lx + 6, yy + 10, d=10, fill=col, stroke=col)
        T(d, lx + 24, yy, 206, s, 14, TEXT, step=22)
    d.save("filter-scope")


# ---------------------------------------------------------------- 6 Filter・Group by・Granularity の違い
def analysis_operations():
    d = D()
    cw, gap = 280, 40
    cards = [("Filter", "対象を絞り込む", "行が減る"),
             ("Group by", "集計軸を変える", "同じ対象をプラン別に分ける"),
             ("Granularity", "時間の単位を変える", "日別 → 週別。合計は変わらない")]
    for i, (nm, purpose, cap) in enumerate(cards):
        x = i * (cw + gap)
        d.rect(x, 0, cw, 256, fill=SURFACE, r=14)
        d.text(x + 22, 16, 40, 18, str(i + 1), S_NUM, ACCENT, bold=True)
        T(d, x + 22, 38, cw - 44, nm, S_NAME, TEXT, bold=True)
        T(d, x + 22, 68, cw - 44, purpose, S_SUB, TEXT)
        T(d, x + 22, 214, cw - 44, cap, 14, MUTED)
    # Filter
    x = 22
    stack(d, x, 112, 7, 70)
    d.line([(x + 90, 130), (x + 124, 130)])
    stack(d, x + 144, 112, 3, 70, fill=ACCENT)
    T(d, x, 190, 100, "全 428 社", 14, TEXT, bold=True)
    T(d, x + 138, 190, 100, "関東 162 社", 14, TEXT, bold=True)
    # Group by
    x = cw + gap + 22
    stack(d, x, 112, 7, 70)
    d.line([(x + 90, 130), (x + 124, 130)])
    for k, f in enumerate((BAR, BAR_STRONG, ACCENT)):
        stack(d, x + 144 + k * 32, 112, 3, 24, fill=f)
        stack(d, x + 144 + k * 32, 152, 2, 24, fill=f)
    T(d, x, 190, 100, "全 428 社", 14, TEXT, bold=True)
    T(d, x + 138, 190, 100, "プラン別", 14, TEXT, bold=True)
    # Granularity
    x = 2 * (cw + gap) + 22
    hs = [30, 44, 36, 52, 40, 58, 46]
    bars(d, x, 182, hs, w=10, gap=4, fills=[BAR] * 7)
    d.line([(x + 110, 150), (x + 144, 150)])
    bars(d, x + 160, 182, [sum(hs[:4]) // 3, sum(hs[4:]) // 2 + 18], w=30, gap=12, fills=[ACCENT, ACCENT])
    T(d, x, 190, 100, "日別", 14, TEXT, bold=True)
    T(d, x + 158, 190, 100, "週別", 14, TEXT, bold=True)
    d.text(0, 288, 600, 18, "あわせて分ける項目", S_LABEL, MUTED, bold=True)
    small = [("Metric", "指標の切り替え", "MRR ↔ 契約企業数"), ("View", "表示形式", "グラフ ↔ 表"),
             ("Comparison", "比較の条件", "前月 ↔ 前年同期")]
    for i, (nm, purpose, ex) in enumerate(small):
        x = i * (cw + gap)
        d.rect(x, 316, cw, 96, fill="none", stroke=LINE, r=14, sw=1.2)
        T(d, x + 22, 330, cw - 44, nm, 16, TEXT, bold=True)
        T(d, x + 22, 356, cw - 44, purpose, S_SUB, TEXT)
        T(d, x + 22, 380, cw - 44, ex, 14, MUTED)
    note(d, 0, 436, 920, 56, ["1 つのフィルターのメニューにまとめない"], fill=ACCENT_SURFACE, stroke=ACCENT,
         bold_first=True)
    d.save("analysis-operations")


# ---------------------------------------------------------------- 7 比較期間の境界と同経過期間比較
def period_alignment():
    d = D()

    def X(i):
        return 30 + 14 * i
    d.line([(30, 28), (884, 28)], color=BAR, arrow=False, sw=1.5)
    for xi, lab in ((0, "2026年10月"), (31, "2026年11月")):
        d.line([(X(xi), 22), (X(xi), 34)], color=BAR_STRONG, arrow=False, sw=1.5)
        T(d, X(xi) + 4, 0, 120, lab, 14, MUTED, bold=True)
    d.line([(X(61), 22), (X(61), 34)], color=BAR_STRONG, arrow=False, sw=1.5)
    # current
    d.rect(X(31), 46, 350, 14, fill=ACCENT, r=7)
    T(d, 0, 42, 450, "現在の期間　11/1〜11/25", 15, TEXT, bold=True, align="right")
    T(d, X(31), 66, 300, "途中の期間（25日経過）", 14, MUTED)
    d.line([(X(56), 22), (X(56), 70)], color=ACCENT, arrow=False, dashed=True, sw=1.5)
    T(d, X(56) - 50, 0, 100, "今日 11/25", 14, ACCENT, bold=True, align="center")
    # A
    d.rect(0, 100, 920, 88, fill="none", stroke=DANGER, r=14, dashed=True, sw=1.5)
    T(d, 20, 110, 100, "避ける", 15, DANGER, bold=True)
    d.rect(X(0), 148, 434, 14, fill=BAR_STRONG, r=7)
    T(d, 484, 116, 400, "10/1〜10/31 全体と比較", 15, TEXT, bold=True)
    T(d, 484, 142, 410, "月途中を前月全体と比べると、悪化に見える", 14, MUTED)
    # B
    d.rect(0, 204, 920, 88, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.5)
    T(d, 20, 214, 100, "使う", 15, ACCENT, bold=True)
    d.rect(X(0), 252, 350, 14, fill=BAR_STRONG, r=7)
    T(d, 484, 220, 400, "10/1〜10/25 同経過期間", 15, TEXT, bold=True)
    T(d, 484, 246, 410, "同じ 25 日間で比べる", 14, MUTED)
    cards = [("うるう年", ["2024/2/29 の前年同日 → 2023/2/28", "調整したことを示す"]),
             ("月末", ["3/31 の前月同日 → 2/28"]),
             ("半開区間", ["開始日 00:00 を含み、", "終了日の翌日 00:00 を含まない", "[11/1, 12/1)"])]
    d.text(0, 316, 600, 18, "境界の扱い", S_LABEL, MUTED, bold=True)
    for i, (nm, ls) in enumerate(cards):
        x = i * 315
        d.rect(x, 344, 290, 132, fill=SURFACE, r=14)
        T(d, x + 22, 360, 246, nm, 16, TEXT, bold=True)
        for k, s in enumerate(ls):
            T(d, x + 22, 390 + k * 22, 250, s, 14, TEXT if k == 0 or i == 2 else MUTED)
    d.save("period-alignment")


# ---------------------------------------------------------------- 8 比較値の算出可否
def comparison_availability():
    d = D()
    cx = [0, 290, 410, 570]
    cwid = [280, 110, 150, 350]
    for c, nm in enumerate(["状態", "実数差", "増減率", "表示"]):
        T(d, cx[c] + (20 if c == 0 else 0), 0, cwid[c], nm, S_SUB, MUTED, bold=True,
          align="left" if c in (0, 3) else "center")
    rows = [("通常", "基準 400、現在 428", "+28", "+7.0%", TEXT, "+7.0%（前月 400社）"),
            ("基準値が 0", "基準 0、現在 12", "+12", "算出不可", MUTED, "+12（前月 0）"),
            ("ともに 0", "基準 0、現在 0", "0", "算出不可", MUTED, "変化なし"),
            ("基準値が負", "−120 → 80", "+200", "原則示さない", MUTED, "+200万円（赤字から黒字）"),
            ("データなし", "", "—", "—", MUTED, "比較データなし"),
            ("取得失敗", "", "—", "—", MUTED, "比較データを取得できません"),
            ("集計条件が異なる", "", "—", "—", MUTED, "比較できません（条件が異なる）")]
    for r, (st, sub, diff, rate, rc, disp) in enumerate(rows):
        y = 30 + r * 58
        d.rect(0, y, 920, 50, fill=SURFACE, r=12)
        if sub:
            T(d, 20, y + 5, 260, st, 15, TEXT, bold=True)
            T(d, 20, y + 27, 260, sub, 13, MUTED)
        else:
            M(d, 20, y, 260, 50, st, 15, TEXT, bold=True, align="left")
        M(d, cx[1], y, cwid[1], 50, diff, 16, TEXT if diff != "—" else MUTED, bold=True)
        M(d, cx[2], y, cwid[2], 50, rate, 15, rc, bold=(rc == TEXT))
        M(d, cx[3], y, cwid[3] + 0, 50, disp, 15, TEXT, bold=True, align="left")
    note(d, 0, 30 + 7 * 58 + 14, 920, 84,
         ["NaN や Infinity を表示しない。",
          "割合の差は pt（パーセントポイント）で示す：4.0% → 3.2% は −0.8pt（相対 −20.0%）"],
         fill=ACCENT_SURFACE, stroke=ACCENT, bold_first=True)
    d.save("comparison-availability")


# ---------------------------------------------------------------- 9 実績と予測の区別
def actual_forecast():
    d = D()
    base = 300
    xs = [80 + i * 92 for i in range(9)]
    labels = ["6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月"]
    v = [100, 110, 120, 128, 140, 150, 158, 166, 174]
    pv = [90, 98, 106, 112, 122, 130, 138, 146, 152]
    Y = [base - a for a in v]
    PY = [base - a for a in pv]
    d.text(0, 0, 400, 18, "予測データがある場合", S_LABEL, MUTED, bold=True)
    d.line([(40, base), (880, base)], color=BAR, arrow=False, sw=1.5)
    for x, lb in zip(xs, labels):
        d.text(x - 30, base + 8, 60, 18, lb, 13, MUTED, align="center")
    # 不確実性の範囲
    x0, x1 = xs[5], xs[8]
    for px in range(x0, x1, 2):
        t = (px - x0) / (x1 - x0)
        i = 5 + min(int((px - x0) // 92), 2)
        yc = Y[i] + (Y[i + 1] - Y[i]) * ((px - xs[i]) / 92)
        half = 3 + t * 26
        d.rect(px, yc - half, 3, half * 2, fill=ACCENT_SURFACE, r=0)
    # 目標
    ty = base - 160
    d.line([(40, ty), (826, ty)], color=BAR_STRONG, arrow=False, sw=1)
    T(d, 836, ty - 10, 60, "目標", 14, BAR_STRONG, bold=True)
    # 前年
    d.line([(xs[i], PY[i]) for i in range(9)], color=BAR_STRONG, arrow=False, dashed=True, sw=1.5)
    T(d, xs[0] - 10, PY[0] + 14, 120, "前年", 14, MUTED)
    # 実績
    d.line([(xs[i], Y[i]) for i in range(6)], color=ACCENT, arrow=False, sw=2.5)
    for i in range(5):
        d.dot(xs[i], Y[i], d=8, fill=ACCENT, stroke=ACCENT)
    d.dot(xs[5], Y[5], d=12, fill=WHITE, stroke=ACCENT)
    # 予測
    d.line([(xs[i], Y[i]) for i in range(5, 9)], color=ACCENT, arrow=False, dashed=True, sw=2.5)
    # ラベル
    T(d, xs[1] - 20, ty - 32, 120, "確定実績", 14, ACCENT, bold=True)
    T(d, xs[5] - 250, 66, 250, "途中経過（11/25 時点）", 14, TEXT, bold=True, align="right")
    d.line([(xs[5], 90), (xs[5], Y[5] - 9)], color=LINE, arrow=False, sw=1)
    T(d, xs[6] + 10, 28, 280, "予測（基準日 11/25、製品が算出）", 14, TEXT, bold=True)
    d.line([(xs[7], 52), (xs[7], Y[7] - 30)], color=LINE, arrow=False, sw=1)
    T(d, 746, 72, 150, "不確実性の範囲", 13, MUTED, align="right")
    # panel 2
    py = 364
    d.rect(0, py, 920, 172, fill=SURFACE, r=14)
    mb = py + 130
    mx = [44 + i * 56 for i in range(6)]
    mv = [60, 66, 72, 77, 84, 90]
    d.line([(mx[i], mb - mv[i]) for i in range(6)], color=ACCENT, arrow=False, sw=2.5)
    for i in range(5):
        d.dot(mx[i], mb - mv[i], d=8, fill=ACCENT, stroke=ACCENT)
    d.dot(mx[5], mb - mv[5], d=12, fill=WHITE, stroke=ACCENT)
    d.line([(32, mb + 6), (360, mb + 6)], color=BAR, arrow=False, sw=1.5)
    d.text(mx[0] - 24, mb + 12, 48, 18, "6月", 13, MUTED, align="center")
    d.text(mx[5] - 24, mb + 12, 48, 18, "11月", 13, MUTED, align="center")
    d.line([(mx[5] + 14, mb - mv[5]), (mx[5] + 70, mb - mv[5])], color=LINE, arrow=False, dashed=True, sw=1)
    d.text(mx[5] + 66, mb - mv[5] - 9, 20, 18, "×", 14, DANGER, bold=True, align="center")
    T(d, 420, py + 30, 460, "予測データがない場合", S_NAME, TEXT, bold=True)
    T(d, 420, py + 66, 460, "線は 11 月で終わり、予測を延長しない", S_SUB, TEXT)
    T(d, 420, py + 92, 460, "未来を補完しない", S_SUB, MUTED, bold=True)
    d.save("actual-forecast")


# ---------------------------------------------------------------- 10 Drill-down の階層と条件引き継ぎ
def drill_down_hierarchy():
    d = D()
    d.rect(0, 0, 440, 44, fill=WHITE, stroke=LINE, r=10, sw=1)
    M(d, 20, 0, 400, 44, "顧客維持分析 / スタンダード / 1年 / 企業一覧", S_SUB, TEXT, align="left")
    T(d, 470, 0, 450, "Breadcrumb は分析の階層を示す", 14, TEXT, bold=True)
    T(d, 470, 22, 450, "条件の表示は集計の条件を示す", 14, MUTED)
    bw, gap, cy0, bh = 156, 35, 120, 64
    names = ["事業全体", "契約プラン別", "契約期間別", "対象企業一覧", "個別企業の詳細"]
    xs = [i * (bw + gap) for i in range(5)]
    for i, nm in enumerate(names):
        d.rect(xs[i], cy0, bw, bh, fill=ACCENT_SURFACE if i == 4 else SURFACE, stroke=ACCENT if i == 4 else "none",
               r=14, sw=1.2)
        M(d, xs[i], cy0, bw, bh, nm, 16, TEXT, bold=True)
        if i < 4:
            d.line([(xs[i] + bw + 5, cy0 + bh / 2), (xs[i + 1] - 5, cy0 + bh / 2)])
    # bypass
    c1, c4 = xs[0] + bw / 2, xs[3] + bw / 2
    d.line([(c1, cy0 - 2), (c1, 92), (c4, 92), (c4, cy0 - 4)], color=ACCENT, dashed=True)
    T(d, (c1 + c4) / 2 - 150, 64, 300, "階層を省略して直接開ける", 14, ACCENT, bold=True, align="center")
    d.text(0, 210, 400, 18, "引き継がれる条件", S_LABEL, MUTED, bold=True)
    base = ["期間：2026/11", "地域：関東"]
    cols = [base, base + ["プラン：スタンダード"], base + ["プラン：スタンダード", "契約期間：1年"],
            base + ["プラン：スタンダード", "契約期間：1年"], base + ["プラン：スタンダード", "契約期間：1年"]]
    new = {1: 2, 2: 3}
    for i, cs in enumerate(cols):
        for k, c in enumerate(cs):
            isnew = new.get(i) == k
            chip(d, xs[i], 238 + k * 36, bw, c, fill=ACCENT_SURFACE if isnew else SURFACE,
                 stroke=ACCENT if isnew else "none", size=13, bold=isnew)
    note(d, 0, 238 + 4 * 36 + 20, 920, 56, ["比較期間側のデータ点から開いた場合は、その系列の期間を引き継ぐ"], fill="none")
    d.rect(0, 238 + 4 * 36 + 20, 920, 56, fill="none", stroke=LINE, r=14, dashed=True, sw=1.2)
    d.save("drill-down-hierarchy")


# ---------------------------------------------------------------- 11 Drill-down と Cross-filtering の違い
def drill_vs_cross_filter():
    d = D()
    pw = 450
    for p in range(2):
        x = p * (pw + 20)
        d.rect(x, 0, pw, 350, fill="none", stroke=LINE, r=16, sw=1.5)
        T(d, x + 24, 16, 400, ("Cross-filtering", "Drill-down")[p], S_NAME, TEXT, bold=True)
        T(d, x + 24, 44, 400, ("同じ画面の対象を変える", "より具体的な画面へ進む")[p], S_SUB, TEXT)
        d.rect(x + 24, 86, 220, 150, fill=WHITE, stroke=LINE, r=10, sw=1)
        T(d, x + 38, 94, 150, "契約企業数", 13, MUTED, bold=True)
        fills = [BAR, ACCENT, BAR] if p == 0 else [BAR, BAR, BAR]
        bars(d, x + 48, 206, [60, 84, 46], w=40, gap=28, fills=fills)
        for k, nm in enumerate(["ライト", "スタンダード", "エンター\nプライズ"]):
            for j, part in enumerate(nm.split("\n")):
                d.text(x + 48 + k * 68 - 22, 208 + j * 11, 84, 12, part, 10, MUTED, align="center")
    # cross
    for k, (ry, hs) in enumerate(((86, [14, 26, 18]), (176, None))):
        d.rect(300, ry, 126, 60, fill=WHITE, stroke=LINE, r=8, sw=1)
        T(d, 310, ry + 6, 100, ("グラフ B", "表")[k], 13, MUTED, bold=True)
        if hs:
            bars(d, 316, ry + 52, hs, w=18, gap=10)
        else:
            for j in range(2):
                d.bar(310, ry + 30 + j * 12, 100 - j * 20, 6)
    d.line([(248, 130), (296, 116)], color=ACCENT)
    d.line([(248, 196), (296, 206)], color=ACCENT)
    T(d, 296, 64, 130, "絞り込まれる", 13, ACCENT, bold=True)
    T(d, 296, 242, 130, "絞り込まれる", 13, ACCENT, bold=True)
    chip(d, 24, 258, 252, "プラン：スタンダード ×（解除）", fill=ACCENT_SURFACE, stroke=ACCENT, size=13)
    T(d, 24, 304, 400, "選択元のグラフは消えない", 14, TEXT, bold=True)
    # drill
    ox = pw + 20
    T(d, ox + 24, 262, 240, "スタンダードの企業を見る →", 14, ACCENT, bold=True)
    d.line([(ox + 262, 272), (ox + 288, 272)], color=ACCENT)
    d.rect(ox + 296, 86, 130, 150, fill=WHITE, stroke=LINE, r=8, sw=1)
    d.bar(ox + 308, 98, 26, 6, fill=BAR_STRONG)
    d.text(ox + 336, 93, 10, 16, "/", 12, MUTED)
    d.bar(ox + 348, 98, 34, 6, fill=BAR_STRONG)
    d.bar(ox + 308, 120, 80, 8, fill=BAR_STRONG)
    for j in range(5):
        d.bar(ox + 308, 148 + j * 16, 100 - (j % 2) * 24, 6)
    T(d, ox + 296, 262, 130, "企業一覧", 13, TEXT, bold=True)
    T(d, ox + 24, 304, 400, "移動先に Breadcrumb を表示する", 14, TEXT, bold=True)
    note(d, 0, 376, 920, 84, ["1 回のクリックで両方を実行しない。",
                               "操作を分ける（棒の選択＝Cross-filtering、リンク＝Drill-down）"],
         fill=ACCENT_SURFACE, stroke=ACCENT, bold_first=True)
    d.save("drill-vs-cross-filter")


# ---------------------------------------------------------------- 12 分析画面への復帰と状態復元
def analysis_return():
    d = D()
    sw_, sh = 340, 230
    # analysis screen
    d.rect(0, 0, sw_, sh, fill=WHITE, stroke=LINE, r=14, sw=1.5)
    T(d, 20, 14, 200, "分析画面", 16, TEXT, bold=True)
    chip(d, 20, 46, 130, "期間：2026/11", fill=SURFACE, size=13, h=26)
    chip(d, 158, 46, 100, "地域：関東", fill=SURFACE, size=13, h=26)
    bars(d, 24, 150, [36, 54, 44, 64, 50], w=30, gap=16)
    for j in range(3):
        y = 168 + j * 20
        if j == 1:
            d.rect(16, y - 6, sw_ - 32, 20, fill="none", stroke=ACCENT, r=6, dashed=True, sw=1.5)
        d.bar(26, y, 90 - j * 10, 6)
        d.bar(180, y, 60, 6)
    # detail screen
    dx = 580
    d.rect(dx, 0, sw_, sh, fill=WHITE, stroke=LINE, r=14, sw=1.5)
    T(d, dx + 20, 14, 200, "詳細画面", 16, TEXT, bold=True)
    d.bar(dx + 20, 56, 150, 12, fill=BAR_STRONG)
    for j in range(5):
        d.bar(dx + 20, 96 + j * 22, 200 - (j % 3) * 30, 6)
    # arrows
    d.line([(350, 96), (570, 96)], color=ACCENT)
    T(d, 340, 66, 240, "詳細を開く（状態を保存）", 14, ACCENT, bold=True, align="center")
    d.line([(570, 140), (350, 140)], color=ACCENT)
    T(d, 340, 148, 240, "戻る（状態を復元）", 14, ACCENT, bold=True, align="center")
    T(d, 340, 182, 240, "データは最新を取得し直してよい。\n操作元がない場合は、\n近い見出しへフォーカスする", 13, MUTED,
      align="center", step=20)
    # restored items
    d.line([(170, sh + 2), (170, sh + 30)], color=ACCENT, arrow=False, sw=1.2)
    d.dot(170, sh + 30, d=8, fill=ACCENT, stroke=ACCENT)
    T(d, 188, sh + 12, 300, "復元する項目", 14, ACCENT, bold=True)
    groups = [("条件", ["分析対象期間", "全体・個別フィルター", "比較条件", "集計単位"]),
              ("表示", ["グラフの表示設定", "表のソートとページ", "選択状態", "スクロール位置", "操作元へのフォーカス"])]
    gy = sh + 48
    for g, (ttl, items) in enumerate(groups):
        x = g * 470
        d.rect(x, gy, 450, 190, fill=SURFACE, r=14)
        T(d, x + 24, gy + 14, 300, ttl, S_NAME, TEXT, bold=True)
        for k, s in enumerate(items):
            d.dot(x + 30, gy + 56 + k * 24 + 10, d=6, fill=BAR_STRONG, stroke=BAR_STRONG)
            T(d, x + 46, gy + 56 + k * 24, 380, s, S_SUB, TEXT)
    note(d, 0, gy + 190 + 20, 920, 56, ["AppShellMain のスクロールとフォーカスの管理と連携する"], fill="none")
    d.rect(0, gy + 190 + 20, 920, 56, fill="none", stroke=LINE, r=14, dashed=True, sw=1.2)
    d.save("analysis-return")


for f in (data_analysis, metric_anatomy, change_evaluation, dashboard_flow, filter_scope, analysis_operations,
          period_alignment, comparison_availability, actual_forecast, drill_down_hierarchy, drill_vs_cross_filter,
          analysis_return):
    f()
print("ok data-analysis")
