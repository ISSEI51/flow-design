"""Generate the Advanced Components diagrams (.drawio).

Usage: python3 scripts/diagrams/gen_advanced.py [output_dir]
Reuses the shared vocabulary from gen.py (importing it also regenerates the existing diagrams).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen import (D, TEXT, MUTED, LINE, ACCENT, SURFACE, ACCENT_SURFACE, BAR, BAR_STRONG,  # noqa: E402
                 DANGER, BTN_FG, S_NAME, S_SUB, S_LABEL, tw, chip, plus_icon)
import gen  # noqa: E402

gen.OUT = gen.OUT  # same output directory as gen.py (sys.argv[1])


def label(d, x, y, w, val):
    d.text(x, y, w, 18, val, S_LABEL, MUTED, bold=True)


def mid(d, x, y, w, h, val, size=15, color=TEXT, bold=False, align="left"):
    d.text(x, y, w, h, val, size, color, bold=bold, align=align, valign="middle")


def check(d, cx, cy, color=TEXT, sw=2):
    d.line([(cx - 5, cy), (cx - 1, cy + 4), (cx + 6, cy - 4)], color=color, arrow=False, sw=sw)


def chevron(d, cx, cy):
    d.line([(cx - 5, cy - 2), (cx, cy + 3), (cx + 5, cy - 2)], color=TEXT, arrow=False, sw=1.5)


def search_icon(d, cx, cy, color=MUTED):
    d.dot(cx - 2, cy - 2, d=11, fill="none", stroke=color)
    d.line([(cx + 3, cy + 3), (cx + 7, cy + 7)], color=color, arrow=False, sw=2)


def cal_icon(d, cx, cy, color=TEXT):
    d.rect(cx - 9, cy - 8, 18, 17, fill="none", stroke=color, r=3, sw=1.5)
    d.line([(cx - 9, cy - 3), (cx + 9, cy - 3)], color=color, arrow=False, sw=1.5)


def field(d, x, y, w, val, h=48, stroke=LINE, color=TEXT, icon="chevron"):
    d.rect(x, y, w, h, fill="none", stroke=stroke, r=12)
    mid(d, x + 16, y, w - 60, h, val, 16, color)
    if icon == "chevron":
        chevron(d, x + w - 24, y + h / 2)
    elif icon == "calendar":
        cal_icon(d, x + w - 26, y + h / 2)


def box(d, x, y, w, h, val, size=15, bold=True):
    d.rect(x, y, w, h, fill=SURFACE)
    mid(d, x, y, w, h, val, size, TEXT, bold=bold, align="center")


def checkbox(d, x, cy, on):
    if on:
        d.rect(x, cy - 10, 20, 20, fill=TEXT, r=4)
        check(d, x + 10, cy, BTN_FG)
    else:
        d.rect(x, cy - 10, 20, 20, fill="none", stroke=LINE, r=4)


def chip_tag(d, x, y, val, h=28):
    w = tw(val, 14) + 44
    d.rect(x, y, w, h, fill=BAR, r=8)
    mid(d, x + 10, y, w, h, val, 14, TEXT)
    mid(d, x + w - 24, y, 16, h, "×", 14, MUTED, align="center")
    return w


# ---------------------------------------------------------------- 1
def advanced_choice():
    d = D()
    label(d, 0, 0, 400, "目的")
    label(d, 520, 0, 300, "使うコンポーネント")
    rows = [("1 つを選ぶ", "選択肢が少なくても Select", "Select"),
            ("検索して 1 つを選ぶ", "選択肢が多く、探す必要がある", "Combobox"),
            ("少数から複数を選ぶ", "選択肢をすべて表示できる", "Checkbox"),
            ("多数から複数を選ぶ", "検索と選択済みの確認ができる", "Multi Select"),
            ("ON/OFF を押した時点で反映する", "保存ボタンがない設定", "Switch"),
            ("操作の候補から選ぶ", "メニューから 1 つ実行する", "Dropdown Menu"),
            ("機能や情報にすばやく移動する", "検索して実行する", "Command")]
    for i, (q, sub, comp) in enumerate(rows):
        y = 32 + i * 88
        d.text(0, y + 12, 440, 24, q, S_NAME, TEXT, bold=True)
        d.text(0, y + 42, 440, 20, sub, S_SUB, MUTED)
        d.line([(452, y + 36), (508, y + 36)])
        d.rect(520, y, 380, 72, fill=SURFACE)
        cx, cy = 548, y + 36
        if i == 0:
            d.rect(cx - 8, cy - 14, 64, 28, fill="none", stroke=LINE, r=8)
            chevron(d, cx + 44, cy)
        elif i == 1:
            d.rect(cx - 8, cy - 14, 64, 28, fill="none", stroke=LINE, r=8)
            search_icon(d, cx + 8, cy)
        elif i == 2:
            checkbox(d, cx, cy - 7, True)
            checkbox(d, cx + 26, cy - 7, False)
            checkbox(d, cx, cy + 15, False)
        elif i == 3:
            d.rect(cx - 8, cy - 14, 64, 28, fill="none", stroke=LINE, r=8)
            d.rect(cx - 2, cy - 7, 22, 14, fill=BAR, r=4)
            d.rect(cx + 24, cy - 7, 22, 14, fill=BAR, r=4)
        elif i == 4:
            d.rect(cx, cy - 14, 44, 28, fill=TEXT, r=14)
            d.dot(cx + 30, cy, d=20, fill=BTN_FG, stroke="none")
        elif i == 5:
            d.rect(cx - 8, cy - 18, 56, 36, fill="none", stroke=LINE, r=8)
            d.bar(cx, cy - 8, 40)
            d.bar(cx, cy + 4, 28)
        else:
            d.rect(cx - 8, cy - 14, 64, 28, fill="none", stroke=LINE, r=8)
            mid(d, cx - 8, cy - 14, 64, 28, "⌘K", 13, MUTED, bold=True, align="center")
        d.text(cx + 76, y, 260, 72, comp, S_NAME, TEXT, bold=True, valign="middle")
    d.save("advanced-choice")


# ---------------------------------------------------------------- 2
def combobox_structure():
    d = D()
    cw = 410
    xs = [0, 490]
    heads = ["Select", "Combobox"]
    items = ["北星物流株式会社", "みなと製作所", "青葉商事"]
    for k, x in enumerate(xs):
        label(d, x, 0, cw, heads[k])
        field(d, x, 28, cw, "北星物流株式会社")
        top = 128
        mh = 152 if k == 0 else 204
        d.rect(x, top, cw, mh, fill=SURFACE, stroke=BAR, r=20)
        y = top + 12
        if k == 1:
            d.rect(x + 12, y, cw - 24, 44, fill="none", stroke=LINE, r=10)
            search_icon(d, x + 34, y + 22)
            mid(d, x + 52, y, 200, 44, "検索", 15, MUTED)
            y += 52
        for j, it in enumerate(items):
            iy = y + j * 40
            if j == 0:
                d.rect(x + 8, iy, cw - 16, 40, fill=BAR, r=8)
            mid(d, x + 24, iy, 260, 40, it, 15, TEXT, bold=(j == 0))
            if j == 0:
                check(d, x + cw - 28, iy + 20)
    d.line([(cw + 8, 52), (xs[1] - 8, 52)], arrow=False, dashed=True)
    mid(d, 300, 86, 300, 24, "閉じた状態は同じ外観", 14, ACCENT, bold=True, align="center")
    cy = 360
    label(d, 0, cy, 400, "共通の寸法")
    for i, t in enumerate(["欄　48px・角丸 12px", "メニュー　角丸 20px・最大 384px", "選択肢　40px 以上"]):
        x = [0, 230, 590][i]
        w = [210, 340, 200][i]
        box(d, x, cy + 28, w, 48, t, 15, bold=False)
    d.save("combobox-structure")


# ---------------------------------------------------------------- 3
def combobox_state():
    d = D()
    c1, c2, c3, cw1, cw3 = 190, 440, 700, 210, 200
    label(d, c1, 4, cw1, "1　開く")
    label(d, c2, 4, cw1, "2　文字を入力")
    label(d, c3, 4, cw3, "3　確定または取り消し")
    lanes = [("検索文字列", "inputValue", 40), ("確定済みの値", "value", 128)]
    for name, en, y in lanes:
        d.text(0, y + 12, 180, 24, name, S_NAME, TEXT, bold=True)
        d.text(0, y + 42, 180, 20, en, S_SUB, MUTED)
    cells = {(0, 0): "空", (0, 1): "「みなと」", (1, 0): "北星物流", (1, 1): "北星物流 のまま"}
    for (lane, col), val in cells.items():
        y = lanes[lane][2]
        x = [c1, c2][col]
        hi = (lane == 1 and col == 1)
        d.rect(x, y, cw1, 72, fill=ACCENT_SURFACE if hi else SURFACE, stroke=ACCENT if hi else "none")
        mid(d, x, y, cw1, 72, val, 17, TEXT, bold=True, align="center")
    d.line([(c1 + cw1 + 4, 76), (c2 - 4, 76)])
    d.line([(c1 + cw1 + 4, 164), (c2 - 4, 164)])
    d.text(c2, 208, cw1, 20, "入力しても値は変わらない", S_SUB, ACCENT, bold=True, align="center")
    for y, title, lines in [(30, "項目を選ぶ", ["値：みなと製作所", "メニューを閉じる", "検索文字列を破棄"]),
                            (172, "Esc・外側のクリック", ["値：北星物流 のまま", "メニューを閉じる", "検索文字列を破棄"])]:
        d.rect(c3, y, cw3, 124, fill=SURFACE)
        d.text(c3 + 18, y + 14, cw3 - 36, 22, title, 16, TEXT, bold=True)
        for k, ln in enumerate(lines):
            d.text(c3 + 18, y + 44 + k * 24, cw3 - 36, 20, ln, S_SUB, MUTED if k else TEXT, bold=(k == 0))
    d.line([(c2 + cw1 + 4, 128), (676, 128), (676, 92), (c3 - 4, 92)])
    d.line([(676, 128), (676, 234), (c3 - 4, 234)])
    d.text(0, 330, 900, 20, "値が変わるのは項目を選んだときだけ。文字を入力しても値は変わらない", S_SUB, MUTED)
    d.save("combobox-state")


# ---------------------------------------------------------------- 4
def multi_select_display():
    d = D()
    label(d, 0, 0, 300, "欄の表示")
    fw = 470
    rows = [("0 件", []), ("1 件", ["北海道"]), ("3 件", ["東京都", "神奈川県", "千葉県"]),
            ("8 件", ["東京都", "神奈川県", "千葉県", "他 5 件"])]
    for i, (n, chips) in enumerate(rows):
        y = 28 + i * 72
        mid(d, 0, y, 60, 48, n, 16, TEXT, bold=True)
        d.rect(70, y, fw, 48, fill="none", stroke=LINE, r=12)
        if not chips:
            mid(d, 86, y, 300, 48, "選択してください", 16, MUTED)
        else:
            x = 84
            for c in chips:
                if c.startswith("他"):
                    # 件数は解除ボタンのない文字で示す
                    mid(d, x + 4, y, 80, 48, c, 14, MUTED)
                    continue
                x += chip_tag(d, x, y + 10, c) + 8
        chevron(d, 70 + fw - 24, y + 24)
    d.text(0, 330, 520, 20, "3 件まで個別に表示し、残りは件数で示す", S_SUB, TEXT)
    d.text(0, 354, 520, 20, "（表示数は変更できる）", S_SUB, MUTED)
    mx, mw = 560, 340
    label(d, mx, 0, 300, "開いたメニュー")
    d.rect(mx, 28, mw, 346, fill=SURFACE, stroke=BAR, r=20)
    d.rect(mx + 12, 40, mw - 24, 44, fill="none", stroke=LINE, r=10)
    search_icon(d, mx + 34, 62)
    mid(d, mx + 52, 40, 200, 44, "検索", 15, MUTED)
    mid(d, mx + 20, 90, 160, 30, "8 件を選択中", 14, MUTED)  # 選択済みの 8 件のうち 3 件と、未選択の一部を示す
    mid(d, mx + mw - 120, 90, 100, 30, "すべて解除", 14, ACCENT, bold=True, align="right")
    for j, (t, on) in enumerate([("東京都", True), ("神奈川県", True), ("千葉県", True),
                                 ("愛知県", False), ("大阪府", False), ("福岡県", False)]):
        iy = 126 + j * 40 + (8 if j >= 3 else 0)
        checkbox(d, mx + 22, iy + 20, on)
        mid(d, mx + 56, iy, 200, 40, t, 15, TEXT)
    d.line([(mx + 16, 246), (mx + mw - 16, 246)], color=BAR, arrow=False, sw=1)
    d.text(mx, 386, mw, 20, "選ぶたびに欄を更新し、メニューは閉じない", S_SUB, TEXT)
    d.text(mx, 410, mw, 20, "選択済みを先頭に並べる", S_SUB, MUTED)
    d.save("multi-select-display")


# ---------------------------------------------------------------- 5
def command_navigation():
    d = D()
    label(d, 0, 0, 400, "通常のナビゲーション（主な経路）")
    d.rect(0, 28, 900, 72, fill=ACCENT_SURFACE)
    mid(d, 24, 28, 140, 72, "Sidebar", 17, TEXT, bold=True)
    mid(d, 190, 28, 200, 72, "ページ内のリンク", 17, TEXT, bold=True)
    d.line([(400, 64), (470, 64)])
    mid(d, 490, 28, 380, 72, "すべての機能に到達できる", 17, TEXT, bold=True)
    label(d, 0, 140, 500, "Command（補助の近道）")
    y, h = 168, 150
    xs = [(0, 250), (290, 320), (650, 250)]
    d.rect(0, y, 250, h)
    d.text(22, y + 20, 206, 24, "起動", S_NAME, TEXT, bold=True)
    d.text(22, y + 56, 206, 20, "Cmd / Ctrl + K", S_SUB, MUTED)
    d.text(22, y + 84, 206, 20, "検索ボタン", S_SUB, MUTED)
    d.rect(290, y, 320, h)
    d.text(312, y + 20, 276, 24, "中央の Dialog", S_NAME, TEXT, bold=True)
    d.rect(312, y + 54, 276, 34, fill="none", stroke=LINE, r=8)
    search_icon(d, 330, y + 71)
    mid(d, 346, y + 54, 200, 34, "検索欄", 14, MUTED)
    for k, g in enumerate(["ページ", "操作", "設定"]):
        d.rect(312 + k * 94, y + 100, 88, 32, fill=BAR, r=8)
        mid(d, 312 + k * 94, y + 100, 88, 32, g, 14, TEXT, bold=True, align="center")
    d.rect(650, y, 250, h)
    d.text(672, y + 20, 206, 24, "実行", S_NAME, TEXT, bold=True)
    d.text(672, y + 56, 206, 20, "ページの移動", S_SUB, MUTED)
    d.text(672, y + 84, 206, 20, "操作の実行", S_SUB, MUTED)
    d.line([(254, y + 75), (286, y + 75)])
    d.line([(614, y + 75), (646, y + 75)])
    d.line([(775, y + h + 4), (775, 380)])
    d.text(787, 336, 110, 20, "危険な操作", S_SUB, DANGER, bold=True)
    d.rect(650, 384, 250, 64, fill="none", stroke=DANGER, r=14)
    mid(d, 650, 384, 250, 64, "Alert Dialog で確認", 17, TEXT, bold=True, align="center")
    d.text(0, 384, 600, 20, "Command はナビゲーションを置き換えない", S_NAME, TEXT, bold=True)
    d.text(0, 416, 600, 20, "権限のない操作は候補に出さない", S_SUB, MUTED)
    d.save("command-navigation")


# ---------------------------------------------------------------- 6
def calendar_states():
    d = D()
    label(d, 0, 0, 400, "日付の状態")
    labels = ["通常", "今日", "選択中", "今日を\n選択", "範囲の内部", "範囲の\n開始・終了", "選択不可", "表示月以外"]
    nums = ["12", "13", "14", "15", "16", "17", "18", "19"]
    sp = 115
    for i, (lb, n) in enumerate(zip(labels, nums)):
        cx = 45 + i * sp
        x, y = cx - 20, 32
        fg = TEXT
        if i == 1:
            d.rect(x, y, 40, 40, fill="none", stroke=BAR_STRONG, r=8, sw=1)
        elif i in (2, 3, 5):
            d.rect(x, y, 40, 40, fill=TEXT, r=8)
            fg = BTN_FG
            if i == 3:
                d.rect(x + 4, y + 4, 32, 32, fill="none", stroke=BTN_FG, r=5, sw=1)
        elif i == 4:
            d.rect(x, y, 40, 40, fill=BAR, r=2)
        elif i == 6:
            fg = LINE
        elif i == 7:
            fg = MUTED
        mid(d, x, y, 40, 40, n, 15, fg, bold=(i in (2, 3, 5)), align="center")
        d.text(cx - 56, 84, 112, 40, lb, 14, TEXT, align="center")
    label(d, 0, 170, 400, "範囲選択の例")
    sx, sy, cw = 0, 198, 56
    d.rect(sx + 28, sy, cw * 6, 40, fill=BAR, r=2)
    d.rect(sx, sy, cw, 40, fill=TEXT, r=8)
    d.rect(sx + cw * 6, sy, cw, 40, fill=TEXT, r=8)
    for i in range(7):
        fg = BTN_FG if i in (0, 6) else TEXT
        mid(d, sx + i * cw, sy, cw, 40, str(18 + i), 15, fg, bold=i in (0, 6), align="center")
    d.text(sx, 248, cw, 20, "開始", 14, MUTED, align="center")
    d.text(sx + 6 * cw, 248, cw, 20, "終了", 14, MUTED, align="center")
    d.text(sx + 2 * cw, 248, cw * 3, 20, "内部", 14, MUTED, align="center")
    d.text(470, 196, 430, 22, "今日は境界線、選択中は塗り", S_NAME, TEXT, bold=True)
    d.text(470, 230, 430, 20, "色だけに頼らず、aria-selected と", S_SUB, MUTED)
    d.text(470, 254, 430, 20, "読み上げの文で伝える", S_SUB, MUTED)
    d.save("calendar-states")


# ---------------------------------------------------------------- 7
def date_picker_input():
    d = D()
    label(d, 0, 0, 400, "単一の日付")
    mid(d, 0, 72, 240, 22, "入力中（下書き）", 14, MUTED)
    field(d, 0, 98, 230, "2026/11/25", icon="calendar")
    d.line([(240, 122), (284, 122)])
    d.rect(290, 92, 200, 60, fill=SURFACE)
    mid(d, 290, 92, 200, 60, "フォーカスが外れる\nEnter で確定", 14, TEXT, bold=True, align="center")
    outs = [("正しい日付", "値になる", None),
            ("形式の誤り", "「YYYY/MM/DD の形式で」", DANGER),
            ("存在しない日付（2026/02/30）", "別の日付に繰り越さない", DANGER)]
    for k, (a, b, col) in enumerate(outs):
        y = 28 + k * 68
        d.rect(560, y, 340, 58, fill=SURFACE)
        d.text(578, y + 8, 310, 20, a, 15, TEXT, bold=True)
        d.text(578, y + 31, 310, 20, b, 14, col or MUTED)
        d.line([(500, 122), (530, 122), (530, y + 29), (556, y + 29)])
    label(d, 0, 250, 400, "期間")
    mid(d, 0, 278, 190, 20, "開始日", 14, MUTED)
    field(d, 0, 302, 190, "2026/05/10", icon=None)
    mid(d, 198, 302, 30, 48, "〜", 17, MUTED, align="center")
    mid(d, 236, 278, 190, 20, "終了日", 14, MUTED)
    field(d, 236, 302, 190, "2026/05/01", stroke=DANGER, icon=None)
    d.rect(442, 302, 48, 48, fill="none", stroke=LINE, r=12)
    cal_icon(d, 466, 326)
    d.text(236, 358, 400, 20, "終了日は開始日と同じか、それより後", 14, DANGER)
    d.text(560, 302, 340, 22, "自動で入れ替えない", S_NAME, TEXT, bold=True)
    d.text(560, 330, 340, 20, "入力した値を保ち、エラーで知らせる", S_SUB, MUTED)
    label(d, 0, 408, 400, "プリセット")
    x = 0
    for p in ["今日", "今月", "先月", "過去 7 日間"]:
        x += chip(d, x, 434, p, h=40, size=15) + 10
    d.text(560, 444, 340, 20, "今日を基準に計算", S_SUB, MUTED)
    d.line([(0, 506), (900, 506)], color=BAR, arrow=False, sw=1)
    d.text(0, 520, 900, 20, "送信する値は YYYY-MM-DD。開始日と終了日を含む", S_SUB, TEXT, bold=True)
    d.save("date-picker-input")


# ---------------------------------------------------------------- 8
def file_upload_flow():
    d = D()
    names = ["選択", "確認", "アップロード\n開始", "送信中", "送信完了", "データ\n処理中", "完了"]
    subs = ["", "名前・大きさ\n・形式を表示", "ボタンで開始", "進捗率を表示", "", "", ""]
    w, gap, ny, nh = 108, 24, 50, 70
    for i, (n, s) in enumerate(zip(names, subs)):
        x = i * (w + gap)
        proc = (i == 5)
        d.rect(x, ny, w, nh, fill=ACCENT_SURFACE if proc else SURFACE, stroke=ACCENT if proc else "none")
        mid(d, x, ny, w, nh, n, 15, TEXT, bold=True, align="center")
        if s:
            d.text(x - 12, ny - 42, w + 24, 36, s, 13, MUTED, align="center", valign="bottom")
        if i < 6:
            d.line([(x + w + 3, ny + nh / 2), (x + w + gap - 3, ny + nh / 2)])
    n3, n4, n5 = 2 * (w + gap), 3 * (w + gap), 4 * (w + gap)
    # failure -> retry
    d.rect(n4 - 66, 190, 108, 50, fill="none", stroke=DANGER, r=14)
    mid(d, n4 - 66, 190, 108, 50, "失敗", 15, DANGER, bold=True, align="center")
    d.line([(n4 + 34, ny + nh + 3), (n4 + 34, 186)], color=DANGER)
    d.rect(n3 - 48, 190, 90, 50, fill=SURFACE)
    mid(d, n3 - 48, 190, 90, 50, "再試行", 15, TEXT, bold=True, align="center")
    d.line([(n4 - 70, 215), (n3 + 46, 215)], color=DANGER)
    d.line([(n3 + 21, 186), (n3 + 21, ny + nh + 3)])
    # abort
    d.rect(n5, 190, 108, 50, fill="none", stroke=LINE, r=14, dashed=True)
    mid(d, n5, 190, 108, 50, "中止", 15, TEXT, bold=True, align="center")
    d.line([(n4 + 80, ny + nh + 3), (n4 + 80, 215), (n5 - 4, 215)], dashed=True)
    d.text(n5 - 40, 248, 190, 20, "中止できる処理だけ", 14, MUTED)
    # boundary
    bx = 6 * (w + gap) - 12
    d.line([(bx, 6), (bx, 284)], color=ACCENT, arrow=False, dashed=True)
    d.text(bx - 330, 296, 342, 22, "送信が 100% でも、処理が終わるまで完了にしない", 15, ACCENT, bold=True, align="right")
    d.text(0, 296, 300, 20, "進捗率が不明なときは数値を出さない", S_SUB, MUTED)
    d.save("file-upload-flow")


# ---------------------------------------------------------------- 9
def empty_states():
    d = D()
    label(d, 0, 0, 200, "状態")
    label(d, 310, 0, 300, "伝えること")
    label(d, 690, 0, 200, "次の操作")
    rows = [("データ未登録", "最初の登録を促す", "追加ボタン", "plus", False),
            ("検索結果なし", "条件の変更・解除を促す", "条件をリセット", "search", False),
            ("対応すべき項目なし", "正常であることを伝える", "操作なし", "ok", False),
            ("取得失敗", "原因と再試行を示す", "再試行ボタン", "err", True)]
    for i, (st, msg, act, kind, bad) in enumerate(rows):
        y = 32 + i * 96
        col = DANGER if bad else TEXT
        d.rect(0, y + 4, 64, 64, fill=SURFACE, stroke=DANGER if bad else "none", r=16)
        cx, cy = 32, y + 36
        if kind == "plus":
            plus_icon(d, cx, cy, 11, TEXT, 2)
        elif kind == "search":
            search_icon(d, cx, cy, TEXT)
        elif kind == "ok":
            check(d, cx, cy, TEXT, 2.5)
        else:
            mid(d, 0, y + 4, 64, 64, "!", 26, DANGER, bold=True, align="center")
        d.text(80, y + 14, 200, 24, st, S_NAME, col, bold=True)
        d.bar(80, y + 50, 70)
        d.line([(262, y + 36), (302, y + 36)])
        d.rect(310, y, 330, 72, fill=SURFACE)
        mid(d, 332, y, 300, 72, msg, 17, TEXT, bold=True)
        d.line([(650, y + 36), (684, y + 36)])
        if act == "操作なし":
            d.rect(690, y + 12, 210, 48, fill="none", stroke=LINE, r=12, dashed=True)
            mid(d, 690, y + 12, 210, 48, act, 15, MUTED, bold=True, align="center")
        else:
            d.rect(690, y + 12, 210, 48, fill=TEXT, r=12)
            mid(d, 690, y + 12, 210, 48, act, 15, BTN_FG, bold=True, align="center")
    d.save("empty-states")


for f in (advanced_choice, combobox_structure, combobox_state, multi_select_display,
          command_navigation, calendar_states, date_picker_input, file_upload_flow, empty_states):
    f()
print("ok advanced")
