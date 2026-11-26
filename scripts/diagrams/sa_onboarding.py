"""Onboarding diagrams (Patterns / System & Account).

Run directly to regenerate only these diagrams:
    python3 -I scripts/diagrams/sa_onboarding.py docs/diagrams
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sa_common import (  # noqa: E402
    ACCENT, ACCENT_SURFACE, LINE, MUTED, S_SUB, SURFACE, TEXT, D, T, alabel, hh, state,
)


def onboarding_first_value():
    """認証から最初の価値体験まで。歓迎するだけの画面を挟まない。初期設定の 3 種類の位置"""
    d = D()
    top = 110
    C2X, C2W = 230, 290
    boxes = [("招待の承諾", ["参加する組織と招待した人"]),
             ("組織の作成", ["必須：組織名", "任意：招待、データの始め方"]),
             ("利用開始の前に必要な設定", ["組織のポリシーの多要素認証など"])]
    y = top
    ys = []
    for title, subs in boxes:
        h = hh(len(subs))
        state(d, C2X, y, C2W, h, title, subs)
        ys.append((y, h))
        y += h + 20
    bottom = y - 20
    cy = (top + bottom) / 2
    h1 = hh(1)
    state(d, 0, cy - h1 / 2, 170, h1, "認証", ["ログイン、新規登録"])
    bus = 200
    d.line([(176, cy), (bus, cy)], arrow=False)
    d.line([(bus, ys[0][0] + ys[0][1] / 2), (bus, ys[-1][0] + ys[-1][1] / 2)], arrow=False)
    for yy, h in ys:
        d.line([(bus, yy + h / 2), (C2X - 6, yy + h / 2)])
    # 製品の利用画面
    C3X, C3W = 620, 280
    ph = hh(3)
    py = cy - ph / 2
    state(d, C3X, py, C3W, ph, "製品の利用画面", ["初回利用の Empty State", "Getting Started Checklist", "Contextual Help"],
          fill=SURFACE, stroke=LINE)
    bus2 = 580
    for yy, h in ys:
        d.line([(C2X + C2W + 6, yy + h / 2), (bus2, yy + h / 2)], arrow=False)
    d.line([(bus2, ys[0][0] + ys[0][1] / 2), (bus2, ys[-1][0] + ys[-1][1] / 2)], arrow=False)
    d.line([(bus2, cy), (C3X - 6, cy)])
    # 所属する組織がある：直接移る
    d.line([(85, cy - h1 / 2 - 6), (85, 50), (C3X + C3W / 2, 50), (C3X + C3W / 2, py - 6)])
    alabel(d, (85 + C3X + C3W / 2) / 2, 18, 420, "所属する組織がある：利用画面へ直接移る", color=TEXT)
    # 最初の価値体験
    C4X, C4W = 980, 260
    vh = hh(3)
    state(d, C4X, cy - vh / 2, C4W, vh, "最初の価値体験", ["製品が定義する", "例：最初の顧客を登録し、", "一覧で確かめる"],
          fill=ACCENT_SURFACE, stroke=ACCENT)
    d.line([(C3X + C3W + 6, cy), (C4X - 6, cy)])
    alabel(d, (C3X + C3W + C4X) / 2, cy - 28, 70, "作業")
    # 初期設定の 3 種類
    ry = bottom + 60
    T(d, 0, ry + 18, 200, "初期設定の 3 種類", S_SUB, TEXT, bold=True)
    kinds = [(C2X, C2W, "利用開始の前に必要", ["これがないと", "始められないものだけ"]),
             (C3X, C3W, "利用開始の後でも可能", ["初期値で始め、", "設定の画面で変える"]),
             (C4X, C4W, "特定の機能を使うとき", ["その機能の画面で求める", "（支払い方法など）"])]
    kh = hh(2)
    for x, w, title, subs in kinds:
        state(d, x, ry, w, kh, title, subs, fill="none", stroke=LINE, dashed=True)
    by = ry + kh + 36
    d.rect(0, by, C4X + C4W, 56, fill=SURFACE)
    T(d, 24, by + 17, C4X + C4W - 48, "歓迎するだけの画面と、作成の後の成功の画面を挟まない。必要な知識は、使うときに示す",
      S_SUB, TEXT, bold=True)
    d.save("onboarding-first-value")


def checklist_states():
    """Checklist の進捗（作業結果から導く）と表示（利用者が選ぶ）。組織の作成の状態"""
    d = D()
    W, GAP = 200, 270
    h1 = hh(1)
    # 進捗
    T(d, 0, 0, 600, "進捗：実際の作業結果から導く", S_SUB, TEXT, bold=True)
    py = 40
    for k, (t, s) in enumerate([("未開始", "0 件完了"), ("進行中", "一部が完了"), ("完了", "すべて完了")]):
        state(d, k * GAP, py, W, h1, t, [s])
    for k in range(2):
        x1, x2 = k * GAP + W + 6, (k + 1) * GAP - 6
        d.line([(x1, py + h1 / 2), (x2, py + h1 / 2)])
    alabel(d, W + (GAP - W) / 2, py + h1 / 2 + 8, 64, "作業の\n結果")
    alabel(d, GAP + W + (GAP - W) / 2, py + h1 / 2 + 8, 64, "作業の\n結果")
    # 表示
    vy0 = py + h1 + 70
    T(d, 0, vy0, 600, "表示：利用者が選ぶ（保存は製品）", S_SUB, TEXT, bold=True)
    vy = vy0 + 64
    # 展開からも非表示にできる
    d.line([(W / 2, vy - 6), (W / 2, vy - 22), (2 * GAP + W / 2, vy - 22), (2 * GAP + W / 2, vy - 6)])
    state(d, 0, vy, W, h1, "展開", ["作業の一覧を表示"])
    state(d, GAP, vy, W, h1, "折りたたみ", ["件数と進捗だけ"])
    state(d, 2 * GAP, vy, W, h1, "非表示", ["再表示の入口を残す"], fill="none", stroke=LINE, dashed=True)
    d.line([(W + 6, vy + 22), (GAP - 6, vy + 22)])
    d.line([(GAP - 6, vy + h1 - 22), (W + 6, vy + h1 - 22)])
    d.line([(GAP + W + 6, vy + h1 / 2), (2 * GAP - 6, vy + h1 / 2)])
    alabel(d, GAP + W + (GAP - W) / 2, vy + h1 / 2 + 8, 64, "非表示\nにする")
    ly = vy + h1 + 28
    d.line([(2 * GAP + W / 2, vy + h1 + 6), (2 * GAP + W / 2, ly), (W / 2, ly), (W / 2, vy + h1 + 6)])
    alabel(d, GAP + W / 2, ly + 6, 240, "再表示（画面の上部の入口）")
    # 表示する形
    RX, RW = 3 * GAP - 20, 420
    T(d, RX, 0, RW, "表示する形", S_SUB, TEXT, bold=True)
    rows = [("作業が 1 件以下", "Checklist を使わない"),
            ("非表示", "表示しない"),
            ("完了（非表示以外）", "完了を短く示し、閉じられる"),
            ("それ以外", "展開か折りたたみ")]
    for k, (a, b) in enumerate(rows):
        yy = 44 + k * 58
        d.rect(RX, yy, RW, 46, fill=SURFACE, r=10)
        T(d, RX + 16, yy + 12, 170, a, S_SUB, TEXT, bold=True)
        T(d, RX + 190, yy + 12, RW - 206, b, S_SUB, MUTED)
    T(d, RX, 44 + 4 * 58 + 6, RW, "上から順に判定する", 14, MUTED)
    # 帯
    by = ly + 60
    full = RX + RW
    d.rect(0, by, full, 56, fill=SURFACE)
    T(d, 24, by + 17, full - 48, "非表示は完了ではない。進捗と必須の作業は変わらず、残った必須の作業は関係する画面で示す",
      S_SUB, TEXT, bold=True)
    # 組織の作成
    sy0 = by + 100
    T(d, 0, sy0, 600, "組織の作成（複数の手順の操作）", S_SUB, TEXT, bold=True)
    sy = sy0 + 76
    setup = [("未開始", "保存した入力がない"), ("進行中", "入力を保存して操作中"),
             ("中断", "閉じた、再読み込みした"), ("完了", "作成した")]
    for k, (t, s) in enumerate(setup):
        state(d, k * GAP, sy, W, h1, t, [s], fill=ACCENT_SURFACE if t == "完了" else SURFACE,
              stroke=ACCENT if t == "完了" else "none")
    d.line([(W + 6, sy + h1 / 2), (GAP - 6, sy + h1 / 2)])
    alabel(d, W + (GAP - W) / 2, sy + h1 / 2 + 8, 64, "手順を\n進める")
    d.line([(GAP + W + 6, sy + 22), (2 * GAP - 6, sy + 22)])
    d.line([(2 * GAP - 6, sy + h1 - 22), (GAP + W + 6, sy + h1 - 22)])
    alabel(d, GAP + W + (GAP - W) / 2, sy - 22, 70, "閉じる")
    alabel(d, GAP + W + (GAP - W) / 2, sy + h1 - 12, 70, "開き直す")
    d.line([(GAP + W / 2, sy - 6), (GAP + W / 2, sy - 40), (3 * GAP + W / 2, sy - 40), (3 * GAP + W / 2, sy - 6)])
    alabel(d, 2 * GAP + W / 2 + 60, sy - 64, 200, "作成する（成功の画面なし）")
    # スキップ
    sk = sy + h1 + 56
    skh = hh(2)
    d.line([(GAP + W / 2, sy + h1 + 6), (GAP + W / 2, sk - 6)])
    state(d, GAP - 30, sk, W + 60, skh, "スキップ", ["任意の手順。完了ではない", "Checklist に作業として残る"],
          fill="none", stroke=LINE, dashed=True)
    T(d, 2 * GAP + 10, sk + 22, 420, "途中の入力は手順の境界で保存する。", S_SUB, MUTED)
    T(d, 2 * GAP + 10, sk + 46, 420, "再読み込みや別の端末では、続きの手順から再開する", S_SUB, MUTED)
    d.save("checklist-states")


for f in (onboarding_first_value, checklist_states):
    f()
print("ok onboarding")
