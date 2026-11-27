"""System States diagrams (System & Account Patterns).

Run: python3 -I scripts/diagrams/sa_system.py docs/diagrams
Saves system-impact-scope, offline-recovery and failure-vs-unknown when imported. The output is deterministic.
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sa_common import (  # noqa: E402
    ACCENT, ACCENT_SURFACE, LINE, MUTED, S_LABEL, S_SUB, SURFACE, TEXT, D, T, alabel, hh, num, state,
    SUCCESS_C, WARNING_C, DANGER,
)


# ---------------------------------------------------------------- 11 障害の影響範囲と表示位置
def system_impact_scope():
    d = D()
    rows = [
        ("特定の操作", "書き出しのボタン", "操作の近く", "操作の下に理由を書く"),
        ("特定の領域", "検索、通知", "領域の中の Alert", "Error State を再利用"),
        ("特定のページ", "契約と請求", "ページの中の通知", "ほかのページは通常"),
        ("複数のページ", "オフライン、性能の低下", "System Banner", "App Shell の上部、集約"),
        ("製品全体", "停止、メンテナンス", "専用の状態の画面", "Minimal Shell"),
    ]
    d.text(0, 0, 300, 20, "影響の範囲", S_LABEL, MUTED, bold=True)
    d.text(470, 0, 300, 20, "表示の位置", S_LABEL, MUTED, bold=True)
    LW, RX, RW, H, G = 300, 470, 320, hh(1), 16
    for k, (scope, ex, place, note) in enumerate(rows):
        y = 34 + k * (H + G)
        state(d, 0, y, LW, H, scope, [ex])
        last = k == len(rows) - 1
        state(d, RX, y, RW, H, place, [note], fill=ACCENT_SURFACE if last else SURFACE, stroke=ACCENT if last else "none")
        d.line([(LW + 6, y + H / 2), (RX - 6, y + H / 2)])
    # 範囲が広がる方向
    top, bottom = 34 + H / 2, 34 + 4 * (H + G) + H / 2
    d.line([(830, top), (830, bottom)], color=LINE)
    T(d, 846, top - 10, 200, "影響が狭い", S_SUB, MUTED)
    T(d, 846, bottom - 10, 200, "影響が広い", S_SUB, MUTED)
    by = 34 + 5 * (H + G) + 14
    d.rect(0, by, 960, 56, fill=SURFACE)
    T(d, 24, by + 17, 900, "影響を受けていない機能は、使えるままにする。同じ問題を Banner、Toast、Alert で重ねない", S_SUB, TEXT, bold=True)
    d.save("system-impact-scope")


# ---------------------------------------------------------------- 12 オフライン・再接続・復旧確認
def offline_recovery():
    d = D()
    W, H = 220, hh(2)
    y0 = 60
    xs = [0, 320, 640, 960]
    state(d, xs[0], y0, W, H, "接続", ["疎通を確認できた", "通常の表示"])
    state(d, xs[1], y0, W, H, "オフライン", ["既存のデータと取得時刻", "登録・更新・削除を制限"], fill=SURFACE, stroke=WARNING_C)
    state(d, xs[2], y0, W, H, "再接続中", ["疎通を確認している", "保存を受け付けない"])
    state(d, xs[3], y0, W, H, "復旧を確認中", ["再取得と", "保存の結果の確認"])
    cy = y0 + H / 2
    for a, b, lab in ((0, 1, "ブラウザが\noffline"), (1, 2, "ブラウザが\nonline"), (2, 3, "疎通の確認が\n成功")):
        d.line([(xs[a] + W + 6, cy), (xs[b] - 6, cy)])
        alabel(d, (xs[a] + W + xs[b]) / 2, y0 - 50, 100, lab)
    # 確認が終わったら接続へ戻る
    top = y0 - 64
    d.line([(xs[3] + W / 2, y0 - 6), (xs[3] + W / 2, top), (xs[0] + W / 2, top), (xs[0] + W / 2, y0 - 6)])
    T(d, xs[0] + W / 2 + 16, top - 26, 520, "確認が終わったら接続に戻る（表示した問題だけ、復旧を知らせる）", S_SUB, MUTED)
    # 要求の失敗から再接続中へ
    fy = y0 + H + 70
    d.line([(xs[0] + W / 2, y0 + H + 6), (xs[0] + W / 2, fy + 30), (590, fy + 30), (590, y0 + H - 16), (xs[2] - 6, y0 + H - 16)])
    T(d, xs[0] + W / 2 + 16, fy + 4, 260, "要求が通信の失敗で終わった", S_SUB, MUTED)
    # 自動の確認と上限
    ry = fy + 110
    state(d, xs[2], ry, W, hh(2), "間隔を延ばして確認", ["1 秒、2 秒、4 秒…", "読み上げは繰り返さない"], fill="none", stroke=LINE, dashed=True)
    state(d, xs[3], ry, W, hh(2), "接続できない", ["自動の確認の上限", "「再接続を試す」を待つ"], fill=SURFACE, stroke=WARNING_C)
    d.line([(xs[2] + W / 2 - 30, y0 + H + 6), (xs[2] + W / 2 - 30, ry - 6)])
    alabel(d, xs[2] + W / 2 - 90, (y0 + H + ry) / 2 - 10, 80, "失敗")
    d.line([(xs[2] + W / 2 + 30, ry - 6), (xs[2] + W / 2 + 30, y0 + H + 6)])
    alabel(d, xs[2] + W / 2 + 90, (y0 + H + ry) / 2 - 10, 80, "再確認")
    d.line([(xs[2] + W + 6, ry + hh(2) / 2), (xs[3] - 6, ry + hh(2) / 2)])
    alabel(d, (xs[2] + W + xs[3]) / 2, ry + hh(2) / 2 - 44, 80, "上限")
    d.line([(xs[3] + W / 2, ry - 6), (xs[3] + W / 2, ry - 24), (xs[2] + W - 30, ry - 24), (xs[2] + W - 30, y0 + H + 6)])
    alabel(d, xs[3] + W / 2 + 80, ry - 56, 120, "再接続を試す")
    by = ry + hh(2) + 50
    d.rect(0, by, xs[3] + W, 84, fill=SURFACE)
    T(d, 24, by + 16, 1120, "操作の制限はすぐに行う。Banner の表示と読み上げは、1 秒続いてから（短時間の切断と繰り返しでは出さない）", S_SUB, TEXT, bold=True)
    T(d, 24, by + 46, 1120, "ブラウザの online だけで接続とせず、接続の回復とデータの取得の成功を区別する", S_SUB, MUTED)
    d.save("offline-recovery")


# ---------------------------------------------------------------- 13 処理失敗と結果不明の違い
def failure_vs_unknown():
    d = D()
    W = 250
    h1 = hh(1)
    state(d, 0, 150, 200, h1, "保存を送る", ["要求の ID を付ける"])
    cy = 150 + h1 / 2
    X1 = 300
    outs = [
        ("成功", ["応答を受け取った"], SUCCESS_C),
        ("失敗", ["処理されていないことが確か"], DANGER),
        ("結果不明", ["応答を受け取れなかった"], WARNING_C),
    ]
    ys = [0, 150, 300]
    for (t, subs, c), y in zip(outs, ys):
        state(d, X1, y, W, h1, t, subs, fill=SURFACE, stroke=c)
    bus = 250
    d.line([(206, cy), (bus, cy)], arrow=False)
    d.line([(bus, ys[0] + h1 / 2), (bus, ys[2] + h1 / 2)], arrow=False)
    for y in ys:
        d.line([(bus, y + h1 / 2), (X1 - 6, y + h1 / 2)])
    X2 = 650
    W2 = 320
    state(d, X2, ys[0], W2, h1, "「保存しました」", ["保存済みとして扱う"])
    state(d, X2, ys[1], W2, hh(2), "入力を残す", ["「もう一度保存」を置く", "自動で再実行しない"])
    state(d, X2, ys[2], W2, hh(2), "保存済みとして扱わない", ["サーバーで処理された可能性", "再試行を置かず、結果を確認"])
    for y, h in ((ys[0], h1), (ys[1], hh(2)), (ys[2], hh(2))):
        d.line([(X1 + W + 6, y + h1 / 2), (X2 - 6, y + h1 / 2)])
    # 結果の確認
    ky = ys[2] + hh(2) + 60
    state(d, X2, ky, W2, hh(2), "結果を確認する", ["利用者の操作、または", "接続の回復の後に自動で"])
    d.line([(X2 + W2 / 2, ys[2] + hh(2) + 6), (X2 + W2 / 2, ky - 6)])
    X3 = 1060
    W3 = 260
    state(d, X3, ky - 60, W3, h1, "ID が一致", ["保存されていた"])
    state(d, X3, ky + 60, W3, h1, "ID が一致しない", ["もう一度保存できる"])
    for yy in (ky - 60 + h1 / 2, ky + 60 + h1 / 2):
        d.line([(X2 + W2 + 6, ky + hh(2) / 2), (X2 + W2 + 40, ky + hh(2) / 2), (X2 + W2 + 40, yy), (X3 - 6, yy)])
    by = ky + 60 + h1 + 50
    d.rect(0, by, X3 + W3, 56, fill=SURFACE)
    T(d, 24, by + 17, 1250, "登録・編集・削除・決済・外部送信は、冪等性が保証される場合を除き、結果を確かめる前に再実行しない", S_SUB, TEXT, bold=True)
    d.save("failure-vs-unknown")


for f in (system_impact_scope, offline_recovery, failure_vs_unknown):
    f()
print("ok system-states")
