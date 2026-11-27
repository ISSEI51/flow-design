"""System & Account overview diagram: system-and-account (the relationship of the six patterns).

Run: python3 -I scripts/diagrams/sa_overview.py docs/diagrams
"""
import os
import sys

sys.dont_write_bytecode = True  # import で __pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sa_common import (  # noqa: E402,F401
    ACCENT, ACCENT_SURFACE, LINE, MUTED, S_NAME, S_NUM, S_SUB, SURFACE, TEXT, D, T,
)


# ---------------------------------------------------------------- 1 System & Account の 6 種類の関係
def system_and_account():
    d = D()
    W = 940
    bw, gap, h = 280, 50, 132
    y0 = 0
    # 利用の流れ：入る → 始める → 使い続ける
    steps = [
        ("Authentication", "製品に入る", "ログイン、多要素認証、\n再認証、ログアウト"),
        ("Onboarding", "最初の価値を体験する", "初期設定、Checklist、\n初回の Empty State"),
        ("Settings", "自分と組織に合わせる", "個人・組織の設定、\n保存の単位と結果"),
    ]
    for i, (name, purpose, sub) in enumerate(steps):
        x = i * (bw + gap)
        d.rect(x, y0, bw, h, fill=SURFACE, r=14)
        d.text(x + 22, y0 + 16, 40, 18, str(i + 1), S_NUM, ACCENT, bold=True)
        T(d, x + 22, y0 + 38, bw - 44, name, S_NAME, TEXT, bold=True)
        T(d, x + 22, y0 + 66, bw - 44, purpose, S_SUB, TEXT)
        T(d, x + 22, y0 + 88, bw - 44, sub, S_SUB, MUTED)
        if i < 2:
            d.line([(x + bw + 6, y0 + h / 2), (x + bw + gap - 6, y0 + h / 2)])
    # Notifications：利用の間に知らせる（Settings の通知の設定と、どの段階にも関わる）
    ny = y0 + h + 40
    nx, nw = (bw + gap), bw * 2 + gap
    d.rect(nx, ny, nw, 92, fill="none", stroke=LINE, r=12, dashed=True, sw=1.2)
    T(d, nx + 22, ny + 16, nw - 44, "Notifications", S_NAME, TEXT, bold=True)
    T(d, nx + 22, ny + 46, nw - 44, "知る価値のあることを、作業を妨げずに知らせる", S_SUB, TEXT)
    T(d, nx + 22, ny + 68, nw - 44, "通知センター、既読と業務の対応、通知の設定", S_SUB, MUTED)
    for i in (1, 2):
        cx = i * (bw + gap) + bw / 2
        d.line([(cx, y0 + h + 4), (cx, ny - 4)], color=LINE, arrow=False, dashed=True, sw=1.2)
    # 横断する 2 つ：Permission States と System States
    by = ny + 92 + 48
    bands = [
        ("Permission States", "できることを正しく示す", "非表示・無効化・閲覧専用、理由、権限申請。UI の制御は認可の代わりではない"),
        ("System States", "状態を正しく伝える", "接続、障害、メンテナンス、結果不明、長時間の処理。影響のない機能を止めない"),
    ]
    bh = 92
    for k, (name, purpose, sub) in enumerate(bands):
        yy = by + k * (bh + 16)
        d.rect(0, yy, W, bh, fill=ACCENT_SURFACE, stroke=ACCENT, r=14, sw=1.2)
        T(d, 24, yy + 16, 260, name, S_NAME, TEXT, bold=True)
        T(d, 24, yy + 48, 260, purpose, S_SUB, TEXT)
        T(d, 300, yy + 30, W - 324, sub, S_SUB, MUTED)
    # 横断する帯は、3 つの段階と Notifications のすべてに適用する。線は Notifications の枠と交わらない左端の 1 本にする
    sx = 36
    d.line([(sx, y0 + h), (sx, by - 4)], color=ACCENT, arrow=False, sw=1.2)
    d.dot(sx, by - 4, d=8, fill=ACCENT, stroke=ACCENT)
    T(d, 50, by - 54, 260, "3 つの段階と Notifications の\nすべてに適用する", 14, MUTED)
    # 共通の状態
    sy = by + 2 * (bh + 16) + 12
    d.rect(0, sy, W, 112, fill=SURFACE, r=14)
    T(d, 24, sy + 16, W - 48, "共通の状態（1 つの Boolean や 1 つの error にまとめない）", S_SUB, TEXT, bold=True)
    T(d, 24, sy + 46, W - 48, "Authentication、Authorization、Entitlement、Scope、Connectivity、Service Health、", S_SUB, MUTED)
    T(d, 24, sy + 70, W - 48, "Data State、Mutation State、Job State、Notification State", S_SUB, MUTED)
    d.save("system-and-account")


system_and_account()
