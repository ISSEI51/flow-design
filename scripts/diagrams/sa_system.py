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
# useConnectivity（registry/patterns/system-status-hooks.ts）の状態（unknown、online、connecting、offline の reason）と、
# 製品が管理する「復旧を確認中」を区別する。Patterns Integration Review で unknown と probe のない場合の経路を加えた（DOC-1）。
def offline_recovery():
    d = D()
    W, H = 272, hh(2)
    xs = [0, 480, 960]
    y1, y2 = 80, 380
    # 上段：未確認、接続、復旧を確認中（製品の状態）
    state(d, xs[0], y1, W, H, "未確認（unknown）", ["最初の描画（SSR を含む）", "操作を許可しない"], fill=SURFACE, stroke=LINE)
    state(d, xs[1], y1, W, H, "接続（online）", ["疎通の確認か要求の応答", "通常の表示"])
    state(d, xs[2], y1, W, H, "復旧を確認中", ["再取得と保存の結果の確認", "製品が管理する状態"], fill="none", stroke=LINE, dashed=True)
    # 下段：オフライン（browser）、再接続中、接続できない（unreachable）
    state(d, xs[0], y2, W, H, "オフライン", ["offline（reason: browser）", "登録・更新・削除を制限"], fill=SURFACE, stroke=WARNING_C)
    state(d, xs[1], y2, W, H, "再接続中（connecting）", ["疎通を確認している", "間隔を延ばして再確認"])
    state(d, xs[2], y2, W, H, "接続できない", ["offline（reason: unreachable）", "「再接続を試す」を待つ"], fill=SURFACE, stroke=WARNING_C)
    cy1, cy2 = y1 + H / 2, y2 + H / 2
    # 未確認 ⇄ 接続
    d.line([(xs[0] + W + 6, cy1 - 14), (xs[1] - 6, cy1 - 14)])
    alabel(d, (xs[0] + W + xs[1]) / 2, cy1 - 58, 270, "疎通の確認が成功\nまたは要求の応答（reportReachable）")
    d.line([(xs[1] - 6, cy1 + 14), (xs[0] + W + 6, cy1 + 14)], dashed=True)
    alabel(d, (xs[0] + W + xs[1]) / 2, cy1 + 22, 220, "probe がない場合：要求が\n通信の失敗（reportFailure）")
    # 未確認 → オフライン
    d.line([(xs[0] + W / 2, y1 + H + 6), (xs[0] + W / 2, y2 - 6)])
    alabel(d, xs[0] + W / 2 + 70, (y1 + H + y2) / 2 - 10, 120, "ブラウザが\noffline", align="left")
    # 未確認 → 再接続中（最初の疎通の確認に失敗）
    d.line([(xs[0] + W - 40, y1 + H + 6), (xs[0] + W - 40, y2 - 40), (xs[1] + 40, y2 - 40), (xs[1] + 40, y2 - 6)])
    alabel(d, (xs[0] + W + xs[1]) / 2 + 20, y2 - 66, 200, "最初の疎通の確認に失敗")
    # オフライン → 再接続中
    d.line([(xs[0] + W + 6, cy2), (xs[1] - 6, cy2)])
    alabel(d, (xs[0] + W + xs[1]) / 2, cy2 + 8, 240, "ブラウザが online\n（online だけでは接続としない）")
    # 接続 ⇄ 再接続中
    d.line([(xs[1] + W / 2 - 30, y1 + H + 6), (xs[1] + W / 2 - 30, y2 - 6)])
    alabel(d, xs[1] + W / 2 - 110, (y1 + H + y2) / 2 - 40, 140, "要求が\n通信の失敗\n（reportFailure）", align="center")
    d.line([(xs[1] + W / 2 + 30, y2 - 6), (xs[1] + W / 2 + 30, y1 + H + 6)])
    alabel(d, xs[1] + W / 2 + 100, (y1 + H + y2) / 2 - 30, 130, "疎通の確認が成功\nまたは要求の応答", align="center")
    # 再接続中 → 接続できない、再接続を試す
    d.line([(xs[1] + W + 6, cy2 - 14), (xs[2] - 6, cy2 - 14)])
    alabel(d, (xs[1] + W + xs[2]) / 2, cy2 - 58, 200, "自動の確認の上限")
    d.line([(xs[2] - 6, cy2 + 14), (xs[1] + W + 6, cy2 + 14)])
    alabel(d, (xs[1] + W + xs[2]) / 2, cy2 + 22, 200, "「再接続を試す」（check）")
    # 接続 → 復旧を確認中（製品）→ 接続
    d.line([(xs[1] + W + 6, cy1 - 14), (xs[2] - 6, cy1 - 14)], dashed=True)
    alabel(d, (xs[1] + W + xs[2]) / 2, cy1 - 58, 220, "切断の後に接続した\n（lastOutage が変わる）")
    d.line([(xs[2] - 6, cy1 + 14), (xs[1] + W + 6, cy1 + 14)], dashed=True)
    alabel(d, (xs[1] + W + xs[2]) / 2, cy1 + 22, 220, "確認が終わる（表示した\n問題だけ、復旧を知らせる）")
    T(d, 0, 10, 1200, "実線の箱：useConnectivity の状態。点線の箱：製品が管理する状態（再取得、結果が不明な保存の確認）", S_SUB, MUTED)
    by = y2 + H + 50
    d.rect(0, by, xs[2] + W, 146, fill=SURFACE)
    T(d, 24, by + 16, 1150, "どの状態でも、ブラウザが offline になったら、すぐにオフライン（browser）にする。操作の制限もすぐに行う", S_SUB, TEXT, bold=True)
    T(d, 24, by + 46, 1150, "Banner の表示と読み上げは、1 秒続いてから（短時間の切断と繰り返しでは出さない）。接続の回復とデータの取得の成功を区別する", S_SUB, MUTED)
    T(d, 24, by + 76, 1150, "probe（疎通の確認）がない場合は、ブラウザが online になると未確認に戻り、次の要求の応答で接続になる", S_SUB, MUTED)
    T(d, 24, by + 106, 1150, "接続の回復の後も、結果が不明な更新は自動で再実行しない（取得の再開と更新の再実行を区別する）", S_SUB, MUTED)
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
