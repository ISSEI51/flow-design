"""Notifications diagrams (System & Account). Saved when imported.

    python3 -I scripts/diagrams/sa_notifications.py docs/diagrams
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sa_common import (  # noqa: E402
    ACCENT, ACCENT_SURFACE, LINE, MUTED, S_SUB, SURFACE, TEXT, WARNING_C, D, T, alabel, hh, state,
)


# ---------------------------------------------------------------- 14 通知の重要度・緊急性と通知方法
def notification_channels():
    d = D()
    X0, Y0 = 130, 20
    CW, CH, G = 360, 176, 20
    cells = [
        # (列, 行, タイトル, 補足)  行 0 が重要度 高、列 1 が緊急性 高
        (0, 0, "通知センター＋メール", ["後から確かめれば足りる", "対象の画面の Alert に残す", "例：契約の更新のリマインダー"]),
        (1, 0, "Dialog・Banner・Push", ["すぐの判断や対応が不可欠な場合だけ", "広い範囲：Banner（System States）", "例：新しい端末からのログイン"]),
        (0, 1, "通知センター・Digest", ["まとめて確かめれば足りる", "知らせる必要がなければ履歴だけ", "例：新しい機能のお知らせ"]),
        (1, 1, "Inline Feedback・Toast", ["操作に直接関係する一時的な結果", "結果が画面に表れない操作だけ Toast", "例：メモを保存しました"]),
    ]
    for c, r, title, subs in cells:
        x, y = X0 + c * (CW + G), Y0 + r * (CH + G)
        strong = c == 1 and r == 0
        state(d, x, y, CW, CH, title, subs, fill=ACCENT_SURFACE if strong else SURFACE, stroke=ACCENT if strong else "none")
    gh = 2 * CH + G
    gw = 2 * CW + G
    # 縦の軸：重要度
    ax = X0 - 30
    d.line([(ax, Y0 + gh), (ax, Y0)], color=MUTED)
    T(d, 0, Y0 + 4, ax - 12, "重要度 高", S_SUB, TEXT, bold=True, align="right")
    T(d, 0, Y0 + gh - 24, ax - 12, "重要度 低", S_SUB, MUTED, align="right")
    # 横の軸：緊急性
    ay = Y0 + gh + 30
    d.line([(X0, ay), (X0 + gw, ay)], color=MUTED)
    T(d, X0, ay + 12, 200, "緊急性 低", S_SUB, MUTED)
    T(d, X0 + gw - 200, ay + 12, 200, "緊急性 高", S_SUB, TEXT, bold=True, align="right")
    # 下の帯
    by = ay + 60
    d.rect(0, by, X0 + gw, 112, fill=SURFACE)
    T(d, 24, by + 18, X0 + gw - 48, "重要度と緊急性は別々に持ち、具体的な値は製品が定義する", S_SUB, TEXT, bold=True)
    T(d, 24, by + 46, X0 + gw - 48,
      "重要だというだけで Dialog にしない。部分的な失敗、重大なエラー、結果の不明を Toast だけにしない\n"
      "同じ情報を、すべての方法で重複して知らせない", S_SUB, MUTED, step=24)
    d.save("notification-channels")


# ---------------------------------------------------------------- 15 通知の既読状態と業務対応状態
def notification_read_task():
    d = D()
    W = 960
    # 上の帯：閲覧の状態（通知）
    T(d, 0, 0, 600, "閲覧の状態（通知の read）", 16, TEXT, bold=True)
    T(d, 0, 26, 700, "通知センターと一覧で変わる。開いただけ（通知センターを開く）では変えない", S_SUB, MUTED)
    y1, bh = 70, hh(1)
    state(d, 60, y1, 200, bh, "未読", ["Dot、太字、「未読、」"])
    state(d, 560, y1, 200, bh, "既読", ["表示を通常に戻す"])
    d.line([(266, y1 + 24), (554, y1 + 24)])
    alabel(d, 410, y1 - 18, 280, "個別の通知を開く、既読にする、", size=14)
    alabel(d, 410, y1 + 1, 280, "すべて既読にする（明示的な操作）", size=14)
    d.line([(554, y1 + bh - 20), (266, y1 + bh - 20)])
    alabel(d, 410, y1 + bh - 14, 200, "未読に戻す", size=14)
    # 削除・非表示
    state(d, 800, y1, 160, bh, "削除・非表示", ["通知だけを消す"], fill="none", stroke=LINE, dashed=True)

    # 区切り：独立
    sy = y1 + bh + 56
    d.line([(0, sy), (W, sy)], color=LINE, arrow=False, dashed=True, sw=1.2)
    d.rect(170, sy - 17, 620, 34, fill="light-dark(#FFFFFF,#0D1117)", stroke="none")
    T(d, 170, sy - 10, 620, "独立して管理する（一方を変えても、もう一方は変えない）", S_SUB, ACCENT, bold=True, align="center")

    # 下の帯：業務の対応の状態
    y2 = sy + 50
    T(d, 0, y2, 600, "業務の対応の状態（業務のデータの task）", 16, TEXT, bold=True)
    T(d, 0, y2 + 26, 700, "対象の画面（顧客、処理の結果）で変わる。通知の既読、削除では変えない", S_SUB, MUTED)
    y3 = y2 + 70
    state(d, 60, y3, 200, bh, "対応待ち", ["例：担当の割り当て"])
    state(d, 560, y3, 200, bh, "対応完了", ["例：顧客に連絡した"])
    state(d, 800, y3, 160, bh, "対応なし", ["お知らせだけ"])
    d.line([(266, y3 + bh / 2), (554, y3 + bh / 2)])
    alabel(d, 410, y3 + bh / 2 - 26, 280, "対象の画面で業務を完了する", size=14)
    # 下の注記
    ny = y3 + bh + 40
    d.rect(0, ny, W, 84, fill=SURFACE)
    T(d, 24, ny + 16, W - 48, "既読にしても業務は完了しない。業務を完了しても、通知を既読にすることは製品が決める", S_SUB, TEXT, bold=True)
    T(d, 24, ny + 44, W - 48, "通知を削除・非表示にしても、元の業務のデータ（対応待ちの件数など）を変えない", S_SUB, MUTED)
    d.save("notification-read-task")


# ---------------------------------------------------------------- 16 通知の生成・配信・閲覧・対応の関係
def notification_lifecycle():
    d = D()
    BW, GAP, Y = 160, 24, 40
    steps = [
        ("イベント", ["業務で起きたこと", ""]),
        ("生成", ["通知にするか判断", "重複を除く（ID）"]),
        ("送信", ["チャネルごとに送る", "Quiet Hours"]),
        ("配信", ["届いたことを", "確認できる場合"]),
        ("既読", ["アプリ内で開く、", "既読にする"]),
        ("対応完了", ["対象の画面で", "業務を完了する"]),
    ]
    bh = hh(2)
    xs = [k * (BW + GAP) for k in range(len(steps))]
    for x, (title, subs) in zip(xs, steps):
        accent = title in ("既読", "対応完了")
        state(d, x, Y, BW, bh, title, subs, fill=ACCENT_SURFACE if accent else SURFACE)
    for k in range(len(steps) - 1):
        d.line([(xs[k] + BW + 4, Y + bh / 2), (xs[k + 1] - 4, Y + bh / 2)])
    # 担い手
    oy = Y + bh + 16
    owners = [(0, 3, "製品のサーバー（通知の配信の基盤）"), (3, 1, "事業者・OS"), (4, 1, "画面（閲覧）"), (5, 1, "業務の画面")]
    for start, span, label in owners:
        x0 = xs[start]
        x1 = xs[start + span - 1] + BW
        d.line([(x0 + 4, oy), (x1 - 4, oy)], color=LINE, arrow=False, sw=1.2)
        alabel(d, (x0 + x1) / 2, oy + 8, x1 - x0, label, size=14)
    T(d, 0, 0, 900, "通知の状態（生成済み、送信済み、配信済み、既読、業務の対応完了）を区別する", 16, TEXT, bold=True)
    # 緊急の通知
    uy = oy + 48
    d.line([(xs[1] + BW / 2, uy), (xs[1] + BW / 2, uy + 26), (xs[3] + BW / 2, uy + 26), (xs[3] + BW / 2, uy)], color=WARNING_C)
    alabel(d, xs[2] + BW / 2, uy + 34, 420, "緊急の通知は、Quiet Hours と Digest で遅らせない", color=WARNING_C, size=14)
    # チャネルの表
    ty = uy + 80
    rows = [
        ("アプリ内", "一覧で取得できた時点で配信済み。開くか既読の操作で既読"),
        ("メール", "送信済みまでしか確かめられないことが多い。開封を既読として扱わない"),
        ("プッシュ通知", "OS・ブラウザの許可が必要（製品の配信の設定とは別）。配信の確認を待つ"),
    ]
    TW = xs[-1] + BW
    for k, (ch, text) in enumerate(rows):
        yy = ty + k * 44
        d.line([(0, yy), (TW, yy)], color=LINE, arrow=False, sw=1)
        T(d, 0, yy + 12, 150, ch, S_SUB, TEXT, bold=True)
        T(d, 160, yy + 12, TW - 160, text, S_SUB, MUTED)
    ny = ty + len(rows) * 44 + 24
    d.rect(0, ny, TW, 56, fill=SURFACE)
    T(d, 24, ny + 17, TW - 48, "確認できない状態を推測しない。送信済みを配信済みや既読として示さない", S_SUB, TEXT, bold=True)
    d.save("notification-lifecycle")


for f in (notification_channels, notification_read_task, notification_lifecycle):
    f()
print("ok notifications")
