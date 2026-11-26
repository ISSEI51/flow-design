"""Generate Forms & Workflows (Patterns) diagrams (.drawio) with the shared visual vocabulary of gen.py.

Usage: python3 scripts/diagrams/gen_forms_workflows.py [output_dir]
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


def lbox(d, x, y, w, h, title, subs=(), fill=SURFACE, stroke="none", dashed=False, tsize=16):
    """左揃えのボックス"""
    d.rect(x, y, w, h, fill=fill, stroke=stroke, r=12, dashed=dashed, sw=1.2)
    total = 24 + 22 * len(subs)
    y0 = y + (h - total) / 2
    T(d, x + 22, y0, w - 44, title, tsize, TEXT, bold=True, step=24)
    for k, s in enumerate(subs):
        T(d, x + 22, y0 + 26 + k * 22, w - 44, s, S_SUB, MUTED)


def alabel(d, cx, y, w, text, color=MUTED, size=14, align="center"):
    T(d, cx - w / 2, y, w, text, size, color, align=align, step=19)


def section(d, x, y, text):
    T(d, x, y, int(est(text, S_LABEL, True)) + 8, text, S_LABEL, MUTED, bold=True)


def note(d, x, y, w, text, h=52, bold=False):
    d.rect(x, y, w, h, fill=SURFACE)
    T(d, x + 24, y + (h - 20) / 2 - 1, w - 48, text, S_SUB, TEXT, bold=bold)


def pbox(d, x, y, w, h, n, name, subs, fill=SURFACE, stroke="none"):
    d.rect(x, y, w, h, fill=fill, stroke=stroke, r=14, sw=1.2)
    d.text(x + 22, y + 18, 24, 20, n, S_NUM, ACCENT, bold=True)
    T(d, x + 50, y + 16, w - 72, name, S_NAME, TEXT, bold=True)
    for k, s in enumerate(subs):
        T(d, x + 22, y + 48 + k * 24, w - 44, s, S_SUB, TEXT if k == 0 else MUTED)


def checkbox(d, x, y, checked=False, s=14):
    if checked:
        d.rect(x, y, s, s, fill=ACCENT, r=3)
        d.line([(x + 3, y + 7), (x + 6, y + 10), (x + 11, y + 4)], color=WHITE, arrow=False, sw=1.5)
    else:
        d.rect(x, y, s, s, fill="none", stroke=BAR_STRONG, r=3, sw=1)


def field(d, x, y, w, h, label=None, color=MUTED, size=14):
    d.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=8, sw=1)
    if label:
        d.text(x + 12, y, w - 24, h, label, size, color, valign="middle")


def labeled_field(d, x, y, w, label):
    """ラベル（高さ 18）+ 8px + 入力欄（高さ 36）。全体の高さは 62。"""
    T(d, x, y, w, label, 14, MUTED, step=19)
    field(d, x, y + 26, w, 36)


def button(d, x, y, w, h, label, enabled):
    d.rect(x, y, w, h, fill=ACCENT if enabled else BAR, r=8)
    d.text(x, y, w, h, label, 14, WHITE if enabled else MUTED, bold=True, align="center", valign="middle")


def measure(d, x, ya, yb, text):
    """間隔の寸法線（縦）と注記"""
    d.line([(x, ya), (x, yb)], color=ACCENT, arrow=False, sw=1.5)
    for yy in (ya, yb):
        d.line([(x - 4, yy), (x + 4, yy)], color=ACCENT, arrow=False, sw=1.5)
    alabel(d, x + 12 + 65, (ya + yb) / 2 - 19, 130, text, color=TEXT, align="left")


# ---------------------------------------------------------------- 1 Forms & Workflows の 6 種類の関係
def forms_workflows():
    d = D()
    bw, xl, xr = 400, 20, 480
    ah = 96
    pbox(d, xl, 0, bw, ah, "4", "Confirmation", ["確認と取り消し"])
    pbox(d, xr, 0, bw, ah, "6", "Import & Export", ["取り込み、書き出し"])
    # Unsaved Changes（Create & Edit と Multi-step Workflow を囲む）
    cy, ch = 170, 230
    d.rect(0, cy, 900, ch, fill="none", stroke=ACCENT, r=16, dashed=True, sw=1.5)
    num(d, "3", 28, cy)
    by, bh = 196, 104
    pbox(d, xl, by, bw, bh, "2", "Create & Edit", ["登録・編集・保存", "保存ボタンの有効化"])
    pbox(d, xr, by, bw, bh, "5", "Multi-step Workflow", ["ステップの移動、条件分岐", "最終確認"])
    T(d, 300, cy + 152, 300, "Unsaved Changes", S_NAME, TEXT, bold=True, align="center")
    T(d, 300, cy + 182, 300, "未保存の変更、移動の確認", S_SUB, TEXT, align="center")
    # 関係の矢印
    d.line([(474, by + 52), (426, by + 52)])
    alabel(d, 450, by + 24, 60, "基にする")
    d.line([(220, ah + 4), (220, cy + 20)])
    alabel(d, 332, 118, 200, "危険な操作を実行する前に\n適用する", align="left")
    d.line([(680, ah + 4), (680, cy + 20)])
    alabel(d, 787, 126, 190, "取り込みの流れに使う", align="left")
    # 土台
    fy = 458
    for cx in (220, 680):
        d.line([(cx, by + bh + 4), (cx, fy - 6)])
    alabel(d, 327, 412, 190, "同じ配置の規則を使う", align="left")
    d.rect(0, fy, 900, 104, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.2)
    d.text(22, fy + 18, 24, 20, "1", S_NUM, ACCENT, bold=True)
    T(d, 50, fy + 16, 400, "Form Layout", S_NAME, TEXT, bold=True)
    T(d, 22, fy + 52, 500, "列、ラベル、間隔、操作ボタン", S_SUB, TEXT)
    T(d, 576, fy + 18, 300, "すべてのパターンに共通する土台", 14, ACCENT, bold=True, align="right")
    d.save("forms-workflows")


# ---------------------------------------------------------------- 2 フォームの列と間隔
def form_columns():
    d = D()
    Y0, PW, PH = 68, 400, 490
    d.text(0, 0, 200, 20, "使う", 16, ACCENT, bold=True)
    T(d, 0, 24, PW, "1 列。強く関係する項目だけ同じ行に置く", S_NAME, TEXT, bold=True)
    RX, RW = 580, 320
    d.text(RX, 0, 200, 20, "避ける", 16, MUTED, bold=True)
    T(d, RX, 24, RW, "空いた幅を埋めるために 2 列にする", S_NAME, TEXT, bold=True)
    d.rect(0, Y0, PW, PH, fill="none", stroke=LINE, r=18, sw=1)
    d.rect(RX, Y0, RW, PH, fill="none", stroke=LINE, r=18, sw=1)
    x = 24
    T(d, x, 92, 200, "基本情報", S_SUB, TEXT, bold=True)
    labeled_field(d, x, 128, 168, "姓")
    labeled_field(d, x + 184, 128, 168, "名")
    labeled_field(d, x, 206, 352, "メールアドレス")
    T(d, x, 308, 200, "契約", S_SUB, TEXT, bold=True)
    labeled_field(d, x, 344, 168, "開始日")
    labeled_field(d, x + 184, 344, 168, "終了日")
    labeled_field(d, x, 434, 236, "金額")
    labeled_field(d, x + 252, 434, 100, "単位")
    mx = PW + 16
    measure(d, mx, 146, 154, "ラベルと入力欄\n8px")
    measure(d, mx, 190, 206, "項目の間\n16px")
    measure(d, mx, 268, 308, "セクションの間\n32〜48px")
    measure(d, mx, 406, 434, "グループの間\n24〜32px")
    # 避ける: 関係のない項目を 2 列に並べる
    pairs = [("会社名", "電話番号"), ("住所", "メールアドレス"), ("担当者", "契約開始日"),
             ("金額", "備考"), ("単位", "部署")]
    for k, (a, b) in enumerate(pairs):
        yy = 92 + k * 80
        labeled_field(d, RX + 24, yy, 128, a)
        labeled_field(d, RX + 168, yy, 128, b)
    T(d, RX + 24, 494, RW - 48, "関係のない項目が同じ行に並び、\n読む順序がわかりにくくなる", 14, MUTED, step=19)
    note(d, 0, Y0 + PH + 28, 900, "狭い領域では 1 列になる（DOM の順序のまま）")
    d.save("form-columns")


# ---------------------------------------------------------------- 3 検証の状態と保存ボタン
def form_validation_states():
    d = D()
    bw, gap = 240, 90
    xs = [0, bw + gap, 2 * (bw + gap)]
    section(d, 0, 0, "入力欄の状態")
    y1, h = 36, 76
    y2 = y1 + h + 48
    rows1 = [("1", "未操作", "エラーを出さない"), ("2", "入力中", "不完全な値をエラーにしない"),
             ("3", "入力を終えた（Blur）で検証", "問題なしなら正しい値へ")]
    for i, (n, t, s) in enumerate(rows1):
        state(d, xs[i], y1, bw, h, t, [s])
        num(d, n, xs[i] + 24, y1)
    for i, lab in enumerate(["入力を始める", "フォーカスを\n外す"]):
        d.line([(xs[i] + bw + 6, y1 + h / 2), (xs[i + 1] - 6, y1 + h / 2)])
        alabel(d, xs[i] + bw + gap / 2, y1 + h / 2 - 28 - (19 if "\n" in lab else 0), gap, lab, size=13)
    rows2 = [("6", "正しい値", "エラーを消す"), ("5", "修正のたびに再検証", "入力するたびに確認する"),
             ("4", "エラーを表示", "項目の近くに理由を示す")]
    for i, (n, t, s) in enumerate(rows2):
        state(d, xs[i], y2, bw, h, t, [s], fill=SURFACE)
        num(d, n, xs[i] + 24, y2)
    d.line([(xs[2] + bw / 2, y1 + h + 6), (xs[2] + bw / 2, y2 - 6)])
    alabel(d, xs[2] + bw / 2 + 62, y1 + h + 14, 100, "問題あり", align="left")
    for i, lab in ((2, "値を修正する"), (1, "問題なし")):
        d.line([(xs[i] - 6, y2 + h / 2), (xs[i - 1] + bw + 6, y2 + h / 2)])
        alabel(d, xs[i] - gap / 2, y2 + h / 2 - 28 - (19 if len(lab) > 5 else 0), gap,
               "値を\n修正する" if i == 2 else lab, size=13)
    # 補足
    ny = y2 + h + 40
    section(d, 0, ny, "検証を待つ・行わない場合")
    lbox(d, 0, ny + 28, 440, hh(1), "IME の変換中は検証しない", ["確定した文字だけを検証の対象にする"], dashed=True, stroke=LINE)
    lbox(d, 460, ny + 28, 440, hh(1), "非同期の確認中（重複の確認など）", ["結果が出るまで確認中であることを示す"],
         dashed=True, stroke=LINE)
    # 保存ボタン
    sy = ny + 28 + hh(1) + 44
    section(d, 0, sy, "保存ボタン")
    ry = sy + 28
    rh, step = 76, 92
    for k, (cond, title, sub, en) in enumerate([
            ("必須の未入力・エラー・確認中・変換中がある", "保存ボタンは無効", "理由をボタンの近くに示す", False),
            ("すべての検証が成功", "保存ボタンは有効", "最後の項目からフォーカスを外さなくてよい", True)]):
        y = ry + k * step
        state(d, 0, y, 420, rh, cond)
        d.line([(426, y + rh / 2), (454, y + rh / 2)])
        d.rect(460, y, 440, rh, fill=ACCENT_SURFACE if en else SURFACE, stroke=ACCENT if en else "none", r=12, sw=1.2)
        T(d, 482, y + 15, 300, title, 16, TEXT, bold=True, step=24)
        T(d, 482, y + 41, 304, sub, S_SUB, MUTED)
        button(d, 460 + 440 - 22 - 84, y + (rh - 32) / 2, 84, 32, "保存", en)
    y = ry + 2 * step
    ws = [(0, 220), (270, 320), (640, 260)]
    for (x, w), t in zip(ws, ["保存時", "送信の処理でも条件を確かめる", "サーバー側の検証"]):
        state(d, x, y, w, rh, t, fill=SURFACE)
    for (x, w), (x2, _) in zip(ws, ws[1:]):
        d.line([(x + w + 6, y + rh / 2), (x2 - 6, y + rh / 2)])
    d.save("form-validation-states")


# ---------------------------------------------------------------- 4 登録・編集の流れ
def create_edit_flow():
    d = D()
    h = hh(3)
    state(d, 0, 0, 180, h, "入力", ["項目ごとに検証する"])
    state(d, 240, 0, 220, h, "保存ボタンが有効", ["すべての検証が成功"])
    state(d, 520, 0, 380, h, "保存中", ["ボタンは同じ大きさで処理中を示す", "送信した時点の値を確定する", "二重の実行を防ぐ"],
          fill=ACCENT_SURFACE, stroke=ACCENT)
    d.line([(186, h / 2), (234, h / 2)])
    d.line([(466, h / 2), (514, h / 2)])
    alabel(d, 490, h / 2 - 28, 50, "押す")
    # 3 つの結果
    oy, oh = 190, 232
    bus = h + 36
    cols = [(0, 330), (360, 270), (660, 240)]
    for cx, _ in [(c[0] + c[1] / 2, 0) for c in cols]:
        pass
    sx = 710
    d.line([(sx, h + 6), (sx, bus)], arrow=False)
    xs = [c[0] + c[1] / 2 for c in cols]
    d.line([(xs[0], bus), (xs[2], bus)], arrow=False)
    for cx in xs:
        d.line([(cx, bus), (cx, oy - 6)])
    d.rect(cols[0][0], oy, cols[0][1], oh, fill=SURFACE, r=14)
    d.rect(cols[1][0], oy, cols[1][1], oh, fill=SURFACE, r=14)
    d.rect(cols[2][0], oy, cols[2][1], oh, fill=SURFACE, r=14, dashed=True, stroke=LINE, sw=1.2)
    # 成功
    x, w = cols[0]
    d.text(x + 22, oy + 18, 24, 20, "1", S_NUM, ACCENT, bold=True)
    T(d, x + 50, oy + 16, w - 72, "成功", S_NAME, TEXT, bold=True)
    T(d, x + 22, oy + 48, w - 44, "基準値を更新する", S_SUB, TEXT)
    d.line([(x + 22, oy + 88), (x + w - 22, oy + 88)], color=BAR, arrow=False, sw=1)
    T(d, x + 22, oy + 100, w - 44, "移動先", 14, MUTED, bold=True)
    for k, (a, b) in enumerate([("新規登録", "作成した詳細"), ("一覧からの編集", "元の一覧"),
                                ("設定の変更", "同じ画面"), ("連続の登録", "「登録して次へ」")]):
        yy = oy + 130 + k * 24
        T(d, x + 22, yy, 120, a, S_SUB, MUTED)
        T(d, x + 148, yy, w - 170, b, S_SUB, TEXT)
    # 失敗
    x, w = cols[1]
    d.text(x + 22, oy + 18, 24, 20, "2", S_NUM, ACCENT, bold=True)
    T(d, x + 50, oy + 16, w - 72, "失敗", S_NAME, TEXT, bold=True)
    for k, s in enumerate(["入力を残す", "項目のエラーは項目に示す", "全体のエラーは\nフォームの上に示す"]):
        T(d, x + 22, oy + 48 + k * 30, w - 44, s, S_SUB, TEXT if k == 0 else MUTED, step=21)
    # 結果が不明
    x, w = cols[2]
    d.text(x + 22, oy + 18, 24, 20, "3", S_NUM, ACCENT, bold=True)
    T(d, x + 50, oy + 16, w - 72, "結果が不明", S_NAME, TEXT, bold=True)
    for k, s in enumerate(["無条件に再実行しない", "状態を確かめる"]):
        T(d, x + 22, oy + 48 + k * 26, w - 44, s, S_SUB, TEXT if k == 0 else MUTED)
    # 表示の方法
    ly = oy + oh + 44
    section(d, 0, ly, "表示の方法")
    items = [("Dialog", "短い操作"), ("Sheet", "一覧や詳細からの\n簡単な登録・編集"),
             ("別のページ", "項目が多い・複雑な判断"), ("Inline", "頻繁に変える単一の項目")]
    for k, (a, b) in enumerate(items):
        x = k * 230
        d.line([(x, ly + 30), (x + 210, ly + 30)], color=BAR, arrow=False, sw=1)
        T(d, x, ly + 42, 210, a, S_SUB, TEXT, bold=True)
        T(d, x, ly + 66, 210, b, 14, MUTED, step=19)
    d.save("create-edit-flow")


# ---------------------------------------------------------------- 5 未保存の変更と移動
def unsaved_navigation():
    d = D()
    h = 88
    state(d, 0, 0, 260, h, "移動の要求", ["Sidebar、リンク、戻る・進む"])
    state(d, 310, 0, 260, h, "未保存の変更があるか？", fill=ACCENT_SURFACE, stroke=ACCENT)
    state(d, 620, 0, 280, h, "移動")
    d.line([(266, h / 2), (304, h / 2)])
    d.line([(576, h / 2), (614, h / 2)])
    alabel(d, 595, h / 2 - 28, 50, "いいえ")
    dy = 170
    d.line([(440, h + 6), (440, dy - 6)])
    alabel(d, 472, 116, 40, "はい", align="left")
    d.rect(0, dy, 540, 370, fill=WHITE, stroke=LINE, r=16, sw=1.5)
    T(d, 24, dy + 18, 400, "Alert Dialog", S_NAME, TEXT, bold=True)
    T(d, 24, dy + 48, 400, "「変更を破棄しますか？」", S_SUB, TEXT)
    opts = [("編集を続ける", "初期フォーカス、Escape", ACCENT_SURFACE, ACCENT),
            ("変更を破棄", "現在の変更を捨てる", SURFACE, "none"),
            ("保存して移動", "すべて保存できる場合だけ表示する", SURFACE, "none")]
    outs = [("留まる", []), ("移動", ["再び確認しない"]), ("成功：移動する", ["失敗：留まり、入力を残す"])]
    for k, ((t, s, f, st), (ot, os_)) in enumerate(zip(opts, outs)):
        y = dy + 92 + k * 92
        lbox(d, 24, y, 492, 76, t, [s], fill=f, stroke=st)
        d.line([(522, y + 38), (614, y + 38)])
        state(d, 620, y, 280, 76, ot, os_)
    # ほかの移動
    ly = dy + 370 + 36
    section(d, 0, ly, "ほかの移動")
    for k, (a, b, bs) in enumerate([("保存中", "保存が終わるまで待つ", "「移動をやめる」で取り消せる"),
                                    ("再読み込み・タブを閉じる", "beforeunload", "ブラウザの標準の確認。文言は指定できない")]):
        y = ly + 28 + k * 102
        state(d, 0, y, 260, 76, a)
        d.line([(266, y + 38), (304, y + 38)])
        state(d, 310, y, 590, 76, b, [bs])
    ny = ly + 28 + 102 + 76 + 36
    note(d, 0, ny, 900, "未保存 ＝ 最後に保存した値と現在の値の比較。触れただけでは未保存にしない")
    d.save("unsaved-navigation")


# ---------------------------------------------------------------- 6 確認と取り消し
def confirm_undo():
    d = D()
    section(d, 0, 0, "操作の影響・危険度・取り消しやすさ")
    section(d, 440, 0, "対応")
    rows = [("影響が小さい", [], "確認しない", [], SURFACE, "none"),
            ("安全に取り消せる", [], "すぐに実行し、Toast の「元に戻す」", ["期限まで元に戻せる"], SURFACE, "none"),
            ("影響が大きい", [], "確認の Dialog", ["対象、件数、内容、影響の範囲"], SURFACE, "none"),
            ("取り消せない", [], "Alert Dialog", ["Destructive のボタン、初期フォーカスはキャンセル"],
             ACCENT_SURFACE, "none"),
            ("極めて重大", ["ワークスペースの削除など"], "対象の名前の入力", ["本人確認の代わりにはしない"],
             ACCENT_SURFACE, ACCENT)]
    y0, step, h = 30, 100, 76
    for k, (c, cs, r, rs, f, st) in enumerate(rows):
        y = y0 + k * step
        state(d, 0, y, 380, h, c, cs)
        d.line([(386, y + h / 2), (434, y + h / 2)])
        state(d, 440, y, 460, h, r, rs, fill=f, stroke=st)
    # 重さの方向
    for k in range(4):
        y = y0 + k * step + h
        d.line([(190, y + 4), (190, y + step - h - 4)], color=BAR_STRONG, arrow=True, sw=1.2)
    ny = y0 + 5 * step + 8
    note(d, 0, ny, 900, "操作の名前（削除、更新など）だけで分けず、影響・危険度・取り消せるかどうかで決める")
    d.save("confirm-undo")


# ---------------------------------------------------------------- 7 ステップの移動
def step_navigation():
    d = D()
    bw, h, y = 190, 108, 64
    xs = [0, 237, 474, 710]
    names = ["顧客", "契約の内容", "支払い", "確認"]
    sts = ["完了", "現在", "要確認", "未完了"]
    for i, (x, nm, st) in enumerate(zip(xs, names, sts)):
        if st == "現在":
            d.rect(x, y, bw, h, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.5)
        elif st == "未完了":
            d.rect(x, y, bw, h, fill="none", stroke=LINE, r=14, dashed=True, sw=1.5)
        elif st == "要確認":
            d.rect(x, y, bw, h, fill=SURFACE, stroke=BAR_STRONG, r=14, sw=1.5)
        else:
            d.rect(x, y, bw, h, fill=SURFACE, r=14)
        d.text(x + 22, y + 20, 24, 20, str(i + 1), S_NUM, ACCENT, bold=True)
        T(d, x + 50, y + 18, bw - 66, nm, S_NAME, TEXT, bold=True)
        ix, iy = x + 30, y + 78
        if st == "完了":
            d.line([(ix - 7, iy), (ix - 2, iy + 5), (ix + 7, iy - 5)], color=ACCENT, arrow=False, sw=2)
        elif st == "現在":
            d.dot(ix, iy, d=12, fill=ACCENT, stroke=ACCENT)
        elif st == "要確認":
            d.line([(ix - 8, iy + 7), (ix + 8, iy + 7), (ix, iy - 8), (ix - 8, iy + 7)], color=TEXT, arrow=False, sw=1.5)
            d.bar(ix - 1, iy - 3, 2, 6, fill=TEXT)
            d.dot(ix, iy + 4, d=2, fill=TEXT, stroke=TEXT)
        else:
            d.dot(ix, iy, d=12, fill="none", stroke=LINE)
        T(d, x + 50, y + 68, bw - 66, st, S_SUB, TEXT if st in ("現在", "要確認") else MUTED, bold=(st == "現在"))
    for i in range(3):
        d.line([(xs[i] + bw + 6, y + h / 2), (xs[i + 1] - 6, y + h / 2)])
    c = [x + bw / 2 for x in xs]
    # 完了したステップへ直接移動
    d.line([(c[1], y - 6), (c[1], y - 26), (c[0], y - 26), (c[0], y - 6)], color=ACCENT)
    alabel(d, (c[0] + c[1]) / 2, 0, 236, "完了したステップへ直接移動できる", color=ACCENT, size=14)
    # 未到達のステップへは移れない
    by = y + h
    d.line([(c[1], by + 6), (c[1], by + 30), (c[3], by + 30), (c[3], by + 6)], color=LINE, dashed=True)
    mx = (c[1] + c[3]) / 2
    d.line([(mx - 6, by + 24), (mx + 6, by + 36)], color=TEXT, arrow=False, sw=2)
    d.line([(mx - 6, by + 36), (mx + 6, by + 24)], color=TEXT, arrow=False, sw=2)
    alabel(d, mx, by + 44, 260, "未到達のステップへは移れない", size=14)
    # 操作の凡例
    ly = by + 90
    for k, (nm, ds, back) in enumerate([("次へ", "現在のステップが完了したときだけ", False),
                                       ("戻る", "いつでも。入力は残る", True)]):
        yy = ly + k * 32
        if back:
            d.line([(46, yy + 10), (6, yy + 10)], color=ACCENT)
        else:
            d.line([(6, yy + 10), (46, yy + 10)], color=ACCENT)
        T(d, 64, yy, 60, nm, S_SUB, TEXT, bold=True)
        T(d, 124, yy, 500, ds, S_SUB, MUTED)
    # 依存
    dy = ly + 100
    section(d, 0, dy, "ステップの依存")
    ay = dy + 28
    state(d, 0, ay, 270, 76, "プランを変える", ["ステップ 2「契約の内容」"])
    state(d, 330, ay, 270, 76, "「支払い」を要確認にする", ["入力した値は残す"], fill=SURFACE, stroke=BAR_STRONG)
    state(d, 660, ay, 240, 76, "関係しない入力", ["そのまま残す"], dashed=True, stroke=LINE, fill="none")
    d.line([(276, ay + 38), (324, ay + 38)])
    alabel(d, 300, ay + 10, 50, "依存", size=13)
    note(d, 0, ay + 76 + 36, 900, "最終の送信の前に、すべてのステップを確かめ直す", bold=True)
    d.save("step-navigation")


# ---------------------------------------------------------------- 8 条件による分岐
def workflow_branching():
    d = D()
    cw, ch = 140, 128
    cy = 118
    d.rect(0, cy, cw, ch, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.2)
    T(d, 16, cy + 16, cw - 32, "ステップ 1", S_SUB, ACCENT, bold=True)
    T(d, 16, cy + 42, cw - 32, "契約の種類", S_NAME, TEXT, bold=True)
    for k, lab in enumerate(["新規", "更新"]):
        x = 16 + k * 58
        d.rect(x, cy + 84, 50, 28, fill=WHITE, stroke=ACCENT, r=8, sw=1)
        d.text(x, cy + 84, 50, 28, lab, 14, TEXT, align="center", valign="middle")
    bw, g, sx = 155, 28, 196
    xs = [sx + i * (bw + g) for i in range(4)]
    ly1, ly2, h = 64, 204, 76
    bus = 168
    mid = cy + ch / 2
    d.line([(cw + 6, mid), (bus, mid)], arrow=False)
    d.line([(bus, ly1 + h / 2), (bus, ly2 + h / 2)], arrow=False)
    for yy in (ly1, ly2):
        d.line([(bus, yy + h / 2), (xs[0] - 6, yy + h / 2)])
    # 新規
    T(d, xs[0], ly1 - 40, 120, "新規", S_LABEL, ACCENT, bold=True)
    T(d, xs[0] + 50, ly1 - 40, 200, "全 5 ステップ", S_LABEL, MUTED)
    for i, t in enumerate(["顧客の情報", "契約の内容", "支払い", "確認"]):
        state(d, xs[i], ly1, bw, h, t, tsize=15)
        num(d, str(i + 2), xs[i] + 24, ly1)
        if i < 3:
            d.line([(xs[i] + bw + 3, ly1 + h / 2), (xs[i + 1] - 3, ly1 + h / 2)])
    # 更新
    T(d, xs[0], ly2 - 40, 120, "更新", S_LABEL, ACCENT, bold=True)
    T(d, xs[0] + 50, ly2 - 40, 200, "全 4 ステップ", S_LABEL, MUTED)
    for i, t in ((0, "更新する契約の選択"), (1, "契約の内容"), (3, "確認")):
        state(d, xs[i], ly2, bw, h, t, tsize=15)
        num(d, str({0: 2, 1: 3, 3: 4}[i]), xs[i] + 24, ly2)
    d.line([(xs[0] + bw + 3, ly2 + h / 2), (xs[1] - 3, ly2 + h / 2)])
    d.line([(xs[1] + bw + 6, ly2 + h / 2), (xs[3] - 6, ly2 + h / 2)], color=LINE, dashed=True)
    alabel(d, xs[2] + bw / 2, ly2 + h / 2 - 28, bw + 10, "支払いのステップはない", size=14)
    ny = ly2 + h + 44
    d.rect(0, ny, 440, hh(2), fill=SURFACE)
    T(d, 24, ny + 18, 400, "選ぶ前の表示", S_SUB, TEXT, bold=True)
    T(d, 24, ny + 44, 400, "総数は未確定。「ステップ 1」とだけ示す", S_SUB, MUTED)
    T(d, 24, ny + 66, 400, "架空の総数を出さない", S_SUB, MUTED)
    d.rect(460, ny, 440, hh(2), fill=SURFACE)
    T(d, 484, ny + 18, 400, "不要になったステップの値", S_SUB, TEXT, bold=True)
    T(d, 484, ny + 44, 400, "送信しない", S_SUB, MUTED)
    T(d, 484, ny + 66, 400, "値は保持する", S_SUB, MUTED)
    d.save("workflow-branching")


# ---------------------------------------------------------------- 9 インポートの流れ
def import_flow():
    d = D()
    bw, g, h = 135, 18, 76
    xs = [i * (bw + g) for i in range(6)]
    names = ["ファイルの選択", "項目の対応付け", "データの検証", "内容の確認", "インポート", "処理の結果"]
    for i, (x, nm) in enumerate(zip(xs, names)):
        d.rect(x, 0, bw, h, fill=ACCENT_SURFACE if i == 5 else SURFACE, stroke=ACCENT if i == 5 else "none", r=14, sw=1.2)
        T(d, x + 8, 14, bw - 16, str(i + 1), S_NUM, ACCENT, bold=True, align="center")
        T(d, x + 8, 40, bw - 16, nm, 15, TEXT, bold=True, align="center")
        if i < 5:
            d.line([(x + bw + 3, h / 2), (xs[i + 1] - 3, h / 2)])
    section(d, 84, 108, "処理の状態")
    cy, ch, cs = 142, 36, 56
    chips = {0: ["アップロード中", "完了"], 1: ["解析中", "完了"], 2: ["検証中", "完了"], 4: ["インポート中"],
             5: ["成功", "一部失敗", "失敗", "結果が不明"]}
    for i, items in chips.items():
        x = xs[i]
        d.line([(x + bw / 2, h + 4), (x + bw / 2, cy - 4)], color=BAR_STRONG, arrow=False, sw=1.2)
        for k, t in enumerate(items):
            y = cy + k * cs
            outcome = i == 5
            d.rect(x, y, bw, ch, fill="none" if not outcome else SURFACE, stroke=LINE if not outcome else "none",
                   r=10, sw=1, dashed=(t == "結果が不明"))
            T(d, x + 8, y + 8, bw - 16, t, 14, TEXT, align="center")
            if k < len(items) - 1 and not outcome:
                d.line([(x + bw / 2, y + ch + 2), (x + bw / 2, y + cs - 2)], color=BAR_STRONG, sw=1.2)
    T(d, xs[3], cy + 8, bw, "利用者が\n確かめる", 14, MUTED, align="center", step=19)
    ny = cy + 3 * cs + ch + 44
    note(d, 0, ny, 900, "ファイルを変えたら、対応付け・検証・確認を無効にする")
    note(d, 0, ny + 64, 900, "画面の手順を省いても、安全のための検証は省かない")
    d.save("import-flow")


# ---------------------------------------------------------------- 10 列の対応付け
def column_mapping():
    d = D()
    LW, RX, RW = 240, 660, 240
    h, step, y0 = 64, 78, 36
    section(d, 0, 0, "ファイルの列")
    section(d, RX, 0, "登録先の項目")
    cols = [("A", "会社名", "株式会社サンプル、山田商事"), ("B", "電話番号", "03-1234-5678"),
            ("C", "電話番号", "090-1234-5678"), ("D", "メモ", "初回の連絡は電話"), ("E", "担当", "佐藤、鈴木")]
    for k, (idx, nm, sm) in enumerate(cols):
        y = y0 + k * step
        d.rect(0, y, LW, h, fill=SURFACE, r=12)
        d.text(16, y + 10, 18, 20, idx, 14, ACCENT, bold=True)
        T(d, 40, y + 10, LW - 56, nm, S_SUB, TEXT, bold=True)
        T(d, 40, y + 34, LW - 56, sm, 13, MUTED)
    dest = [(y0, "会社名（必須）", False), (y0 + 1.5 * step, "電話番号", False),
            (y0 + 3 * step, "取り込まない", True), (y0 + 4 * step, "担当者", False)]
    for y, nm, dashed in dest:
        d.rect(RX, y, RW, h, fill="none" if dashed else SURFACE, stroke=LINE if dashed else "none", r=12, dashed=dashed, sw=1.2)
        T(d, RX + 22, y + 20, RW - 44, nm, S_SUB, MUTED if dashed else TEXT, bold=True)
    x1, x2 = LW + 6, RX - 6
    mid = lambda k: y0 + k * step + h / 2
    # 会社名 -> 会社名
    d.line([(x1, mid(0)), (x2, mid(0))])
    alabel(d, (x1 + x2) / 2, mid(0) - 28, 120, "自動", color=ACCENT, size=14)
    # 電話番号 x2 -> 電話番号（曖昧）
    ty = y0 + 1.5 * step + h / 2
    d.line([(x1, mid(1)), (x2, ty - 8)], color=ACCENT, dashed=True)
    d.line([(x1, mid(2)), (x2, ty + 8)], color=ACCENT, dashed=True)
    d.rect(330, ty - 28, 250, 56, fill=ACCENT_SURFACE, stroke=ACCENT, r=10, sw=1)
    T(d, 338, ty - 20, 234, "曖昧（候補が複数）", S_SUB, TEXT, bold=True, align="center")
    T(d, 338, ty + 2, 234, "利用者が選ぶ", 14, MUTED, align="center")
    # メモ -> 取り込まない
    d.line([(x1, mid(3)), (x2, mid(3))], color=LINE, dashed=True)
    alabel(d, (x1 + x2) / 2, mid(3) - 28, 120, "取り込まない", size=14)
    # 担当 -> 担当者
    d.line([(x1, mid(4)), (x2, mid(4))])
    alabel(d, (x1 + x2) / 2, mid(4) - 28, 140, "別名で自動", color=ACCENT, size=14)
    # 規則
    ny = y0 + 4 * step + h + 40
    section(d, 0, ny, "対応付けの規則")
    for k, s in enumerate(["列は位置の識別子で区別する（同じ見出しでも誤らない）",
                           "必須の項目の不足を検出する",
                           "1 つの項目に複数の列を対応付けた場合は、重複として検出する"]):
        d.dot(6, ny + 38 + k * 28 + 10, d=6, fill=BAR_STRONG, stroke="none")
        T(d, 24, ny + 38 + k * 28, 860, s, S_SUB, TEXT)
    # 検証の結果
    vy = ny + 38 + 3 * 28 + 36
    section(d, 0, vy, "検証の結果")
    cats = [("正常", "登録できる", SURFACE, "none", False), ("要確認", "重複の候補など", SURFACE, LINE, True),
            ("エラー", "登録できない", ACCENT_SURFACE, ACCENT, False)]
    for k, (t, s, f, st, dsh) in enumerate(cats):
        state(d, k * 310, vy + 28, 280, hh(1), t, [s], fill=f, stroke=st, dashed=dsh)
    ty0 = vy + 28 + hh(1) + 28
    d.rect(0, ty0, 900, 128, fill="none", stroke=LINE, r=12, sw=1)
    tx = [24, 124, 264, 544]
    for x, t in zip(tx, ["行番号", "項目", "原因", "直し方"]):
        T(d, x, ty0 + 12, 200, t, 14, MUTED, bold=True)
    d.line([(1, ty0 + 40), (899, ty0 + 40)], color=BAR, arrow=False, sw=1)
    for k, row in enumerate([("12", "電話番号", "形式が正しくない", "数字とハイフンで入力する"),
                             ("27", "会社名", "必須の項目が空", "会社名を入力する")]):
        for x, t, w in zip(tx, row, [80, 130, 270, 340]):
            T(d, x, ty0 + 52 + k * 36, w, t, S_SUB, TEXT)
    d.save("column-mapping")


# ---------------------------------------------------------------- 11 書き出す範囲
def export_scope():
    d = D()
    OW, OH = 560, 380
    d.rect(0, 0, OW, OH, fill="none", stroke=LINE, r=16, sw=1.5)
    T(d, 20, 14, 300, "すべてのデータ", S_SUB, TEXT, bold=True)
    d.rect(20, 48, 520, 312, fill=SURFACE, r=14)
    T(d, 40, 62, 300, "検索結果のすべて", S_SUB, TEXT, bold=True)
    pw, pg, py, ph = 146, 21, 100, 240
    selected = {0: (0, 2), 1: (1,), 2: (3,)}
    for p in range(3):
        x = 40 + p * (pw + pg)
        cur = p == 0
        d.rect(x, py, pw, ph, fill=ACCENT_SURFACE if cur else WHITE, stroke=ACCENT if cur else LINE, r=10,
               dashed=not cur, sw=1.5 if cur else 1.2)
        T(d, x + 14, py + 12, pw - 28, "表示中のページ" if cur else "ほかのページ", 14, ACCENT if cur else MUTED, bold=cur)
        for k in range(5):
            ry = py + 52 + k * 36
            checkbox(d, x + 14, ry, k in selected[p])
            d.bar(x + 38, ry + 4, 70 if k % 2 == 0 else 54, 6, fill=BAR_STRONG if k in selected[p] else BAR)
    d.rect(40, OH + 20, 14, 14, fill=ACCENT, r=3)
    d.line([(43, OH + 27), (46, OH + 30), (51, OH + 24)], color=WHITE, arrow=False, sw=1.5)
    T(d, 64, OH + 18, 480, "選んだ行（ページをまたいで選べる）", S_SUB, TEXT)
    # 初期値
    RX, RW = 610, 290
    section(d, RX, 0, "操作の入口ごとの初期の範囲")
    cards = [("一括操作のバー", "選んだ行"), ("表の右上", "検索結果のすべて"), ("設定の画面", "すべてのデータ")]
    for k, (a, b) in enumerate(cards):
        y = 36 + k * 88
        d.rect(RX, y, RW, 72, fill=SURFACE, r=12)
        T(d, RX + 22, y + 12, RW - 44, a, 14, MUTED)
        T(d, RX + 22, y + 36, RW - 44, "→ " + b, S_SUB, TEXT, bold=True)
    ny = 36 + 3 * 88 + 16
    for k, s in enumerate(["件数がわからない場合は件数を示さない", "出力する列の初期値は表示中の列"]):
        d.dot(RX + 6, ny + k * 34 + 10, d=6, fill=BAR_STRONG, stroke="none")
        T(d, RX + 20, ny + k * 34, RW - 20, s, S_SUB, TEXT)
    d.save("export-scope")


for f in (forms_workflows, form_columns, form_validation_states, create_edit_flow, unsaved_navigation,
          confirm_undo, step_navigation, workflow_branching, import_flow, column_mapping, export_scope):
    f()
print("ok forms-workflows")
