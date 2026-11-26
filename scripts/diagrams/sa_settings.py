"""Settings diagrams (System & Account): settings-scope, settings-save-units.

Run: python3 -I scripts/diagrams/sa_settings.py docs/diagrams
"""
import os
import sys

sys.dont_write_bytecode = True  # import で __pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sa_common import (  # noqa: E402,F401
    ACCENT, ACCENT_SURFACE, BAR, BAR_STRONG, LINE, MUTED, S_NAME, S_SUB, SURFACE, TEXT, WHITE, D,
    SUCCESS_C, WARNING_C, DANGER, T, alabel, button, checkbox, field, num, state, toggle,
)


# ---------------------------------------------------------------- 4 個人設定と組織設定の適用範囲
def settings_scope():
    d = D()
    W = 940
    T(d, 0, 0, W, "設定の適用範囲", S_NAME, TEXT, bold=True)
    bw, gap, y = 220, 20, 40
    scopes = [
        ("個人の設定", ["アカウントに保存する", "どの端末でも同じ", "プロフィール、表示と言語"], ACCENT_SURFACE, ACCENT),
        ("組織の設定", ["ワークスペースに保存する", "すべてのメンバーに適用", "組織の情報、ポリシー"], SURFACE, "none"),
        ("この端末だけの設定", ["端末のブラウザに保存する", "ほかの端末に影響しない", "表の行の高さなど"], SURFACE, "none"),
        ("機能の設定", ["機能に固有の設定", "その機能の近くに置く", "一覧の表示の項目など"], SURFACE, "none"),
    ]
    for i, (name, subs, fill, stroke) in enumerate(scopes):
        state(d, i * (bw + gap), y, bw, 132, name, subs, fill=fill, stroke=stroke)
    T(d, 0, y + 148, W, "設定の画面のカテゴリの一覧と見出しに、対象（佐藤 花子さん、本社営業部）を示す。すべての設定を 1 つの画面に集めない。", 14, MUTED)

    # 値の決まり方
    y2 = 250
    T(d, 0, y2, W, "値の決まり方（左ほど優先し、値がない場合だけ右の値を使う）", S_NAME, TEXT, bold=True)
    layers = [
        ("組織のポリシー", ["必須。個人の設定で", "無効にできない"]),
        ("個人の上書き", ["利用者が選んだ値", "ポリシーの間も保持"]),
        ("組織の標準", ["上書きしていない", "メンバーに使う"]),
        ("製品の標準", ["組織が決めていない", "場合の初期値"]),
    ]
    ly = y2 + 40
    for i, (name, subs) in enumerate(layers):
        x = i * (bw + gap)
        state(d, x, ly, bw, 98, name, subs, fill=SURFACE)
        if i < 3:
            d.line([(x + bw + 2, ly + 49), (x + bw + gap - 2, ly + 49)])
    ry = ly + 130
    for i in range(4):
        cx = i * (bw + gap) + bw / 2
        d.line([(cx, ly + 98), (cx, ry - 2)], color=BAR_STRONG, arrow=False, sw=1)
    d.line([(bw / 2, ry - 2), (3 * (bw + gap) + bw / 2, ry - 2)], color=BAR_STRONG, arrow=False, sw=1)
    d.line([(W / 2, ry - 2), (W / 2, ry + 18)], color=ACCENT)
    d.rect(80, ry + 20, W - 160, 104, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.2)
    T(d, 104, ry + 36, W - 208, "実際に有効な値と、その出所を示す", 16, TEXT, bold=True, align="center")
    T(d, 104, ry + 64, W - 208, "例：「組織の標準（日本語）を使っています」「組織のポリシーで必須のため、無効にできません」", 14, MUTED, align="center")
    T(d, 104, ry + 88, W - 208, "変更できない場合は理由を示す（ポリシー → 契約プラン → 権限の順）", 14, MUTED, align="center")
    d.save("settings-scope")


# ---------------------------------------------------------------- 5 設定の保存方式と保存単位
def settings_save_units():
    d = D()
    W, cw = 940, 450
    rx = W - cw
    # 見出し
    T(d, 0, 0, cw, "即時保存", S_NAME, TEXT, bold=True)
    T(d, 0, 28, cw, "独立した低リスクの設定（表示言語、個人の通知）", S_SUB, MUTED)
    T(d, rx, 0, cw, "明示的な保存", S_NAME, TEXT, bold=True)
    T(d, rx, 28, cw, "依存し合う項目、影響の大きい設定（プロフィール）", S_SUB, MUTED)

    # 即時保存：項目ごとの保存の単位
    y = 70
    for i, (label, value) in enumerate([("通知を止める時間帯", None), ("表示言語", "日本語"), ("タイムゾーン", "日本（東京）")]):
        ry = y + i * 52
        d.rect(0, ry, cw, 44, fill=WHITE, stroke=LINE, r=10, sw=1, dashed=True)
        T(d, 16, ry + 12, 170, label, 14, TEXT)
        T(d, 190, ry + 12, 90, "保存の単位", 13, ACCENT)
        if value is None:
            toggle(d, cw - 52, ry + 12, on=True)
        else:
            field(d, cw - 156, ry + 8, 140, 28, value, chevron=True, size=13)
    # 明示的な保存：フォーム全体が 1 つの単位
    d.rect(rx, y, cw, 148, fill=WHITE, stroke=ACCENT, r=10, sw=1.2, dashed=True)
    T(d, rx + 16, y + 10, 200, "保存の単位（フォーム）", 13, ACCENT)
    field(d, rx + 16, y + 34, cw - 32, 32, "表示名")
    field(d, rx + 16, y + 74, cw - 32, 32, "役職")
    button(d, rx + 16, y + 114, 150, 26, "プロフィールを保存", size=13)
    T(d, rx + 180, y + 117, 250, "保存していない変更があります", 13, MUTED)

    # 結果
    sy = 250
    T(d, 0, sy, cw, "変更した時点で保存し、項目の下に状態を示す", 14, MUTED)
    T(d, rx, sy, cw, "保存の操作で、フォームの項目をまとめて保存する", 14, MUTED)
    oy, oh, step = sy + 34, 52, 62
    left = [
        ("保存しました", "", SURFACE, "none", TEXT),
        ("失敗", "サーバーの値へ戻す", SURFACE, "none", DANGER),
        ("結果が不明", "戻さない。「確認する」", SURFACE, "none", WARNING_C),
        ("権限不足", "戻して、権限を取り直す", SURFACE, "none", WARNING_C),
    ]
    right = [
        ("保存しました", "", SURFACE, "none", TEXT),
        ("失敗", "入力した内容を残す", SURFACE, "none", DANGER),
        ("結果が不明", "入力を残し「確認する」", SURFACE, "none", WARNING_C),
        ("権限不足", "閲覧だけに変え、理由を示す", SURFACE, "none", WARNING_C),
    ]
    for col, rows in ((0, left), (rx, right)):
        for k, (t, sub, fill, stroke, tc) in enumerate(rows):
            ry = oy + k * step
            d.rect(col, ry, cw, oh, fill=fill, stroke=stroke, r=10)
            T(d, col + 16, ry + 15, 140, t, 15, tc, bold=True)
            if sub:
                T(d, col + 150, ry + 16, cw - 166, sub, 14, MUTED)

    # 共通の規則
    by = oy + 4 * step + 20
    d.rect(0, by, W, 132, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.2)
    T(d, 24, by + 16, W - 48, "保存の単位ごとに状態を持つ", 16, TEXT, bold=True)
    T(d, 24, by + 46, W - 48, "ある単位の保存は、ほかの単位の未保存の変更を解除しない。未保存の変更があるまま移動する前に確かめる。", 14, MUTED)
    T(d, 24, by + 70, W - 48, "同じ項目の連続した変更では、最後の要求の応答だけを反映する。古い応答で新しい値を上書きしない。", 14, MUTED)
    T(d, 24, by + 94, W - 48, "アカウント、ワークスペース、権限が変わった後と、画面を離れた後に届いた応答は反映しない（A → B → A も同じ）。", 14, MUTED)
    d.save("settings-save-units")


settings_scope()
settings_save_units()
