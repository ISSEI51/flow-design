"""Authentication diagrams (System & Account): auth-flow, session-reauth.

Run directly to regenerate only these diagrams:
    python3 -I scripts/diagrams/sa_authentication.py docs/diagrams
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sa_common import ACCENT, ACCENT_SURFACE, LINE, MUTED, S_SUB, SURFACE, TEXT, WARNING_C, D, T, alabel, hh, state  # noqa: E402


def auth_flow():
    """認証フローと認証後の遷移"""
    d = D()
    oy, w, h = 60, 190, hh(5)
    xs = [0, 260, 520, 780]
    cy = oy + h / 2
    state(d, xs[0], oy, w, h, "ログインの画面", ["メール＋パスワード", "外部アカウント", "Passkey", "Magic Link", "組織の SSO"])
    state(d, xs[1], oy, w, h, "1 つ目の確認", ["Loading で", "二重の実行を防ぐ", "形式の誤りは", "入力欄の近く"])
    state(d, xs[2], oy, w, h, "多要素認証", ["組織が必須の場合", "まだ認証済みではない", "ログインの情報を", "もう一度求めない"])
    state(d, xs[3], oy, w, h, "認証済み", ["追加の確認を", "含めて完了"], fill=ACCENT_SURFACE, stroke=ACCENT)
    for k, label in enumerate(["送信", "成功", "一致"]):
        x1, x2 = xs[k] + w + 6, xs[k + 1] - 6
        d.line([(x1, cy), (x2, cy)])
        alabel(d, (x1 + x2) / 2, cy - 30, 60, label)
    # 追加の確認が不要な方式
    bx1, bx2 = xs[1] + w / 2, xs[3] + w / 2
    d.line([(bx1, oy - 6), (bx1, 30), (bx2, 30), (bx2, oy - 6)])
    alabel(d, (bx1 + bx2) / 2, 4, 440, "追加の確認が不要な場合（Passkey、組織の SSO など）")
    # 失敗
    ey = oy + h + 66
    eh = hh(4)
    state(d, xs[1], ey, w, eh, "認証のエラー", ["不一致と不存在を", "同じ文で示す", "通信・制限・障害は", "区別する"], fill="none", stroke=LINE)
    ex = xs[1] + w / 2
    d.line([(ex, oy + h + 6), (ex, ey - 6)])
    alabel(d, ex + 30, oy + h + 20, 40, "失敗", align="left")
    # 復帰先の検証
    rh = hh(2)
    rx = xs[3] + w / 2
    state(d, xs[3], ey, w, rh, "復帰先の検証", ["同じオリジンの", "相対パスか"])
    d.line([(rx, oy + h + 6), (rx, ey - 6)])
    oy3 = ey + rh + 70
    oh = hh(2)
    state(d, xs[3], oy3, w, oh, "元の目的の画面", ["利用者が開ける", "画面の場合"], fill=ACCENT_SURFACE, stroke=ACCENT)
    state(d, xs[2], oy3, w, oh, "既定の画面", ["外部の URL、//、", "javascript:、権限なし"])
    d.line([(rx, ey + rh + 6), (rx, oy3 - 6)])
    alabel(d, rx + 12, ey + rh + 22, 80, "検証できた", align="left")
    lx = xs[2] + w / 2
    my = ey + rh / 2
    d.line([(xs[3] - 6, my), (lx, my), (lx, oy3 - 6)])
    alabel(d, (lx + xs[3]) / 2 + 20, my - 26, 100, "検証できない")
    # 帯
    by = max(oy3 + oh, ey + eh) + 40
    d.rect(0, by, xs[3] + w, 56, fill=SURFACE)
    T(d, 24, by + 17, 900, "認証の後は成功の Dialog を出さず、検証した画面に移動する", S_SUB, TEXT, bold=True)
    d.save("auth-flow")


def session_reauth():
    """セッション切れと再認証"""
    d = D()
    oy, h = 60, hh(4)
    cy = oy + h / 2
    boxes = [(0, 190), (260, 190), (520, 220), (810, 190)]
    state(d, 0, oy, 190, h, "利用中", ["顧客のデータ", "未保存の入力"])
    state(d, 260, oy, 190, h, "セッションの期限", ["自動で更新", "できるか"])
    state(d, 520, oy, 220, h, "再認証の画面", ["機密のデータを表示しない", "入力はメモリに保持", "保存中の処理は", "結果が不明として扱う"],
          fill="none", stroke=WARNING_C)
    state(d, 810, oy, 190, h, "権限の取得し直し", ["古い権限で", "操作させない"])
    for k, label in enumerate(["期限切れ", "できない", "ログイン"]):
        x1 = boxes[k][0] + boxes[k][1] + 6
        x2 = boxes[k + 1][0] - 6
        d.line([(x1, cy), (x2, cy)])
        alabel(d, (x1 + x2) / 2, cy - 30, 70, label)
    # 自動で更新できる場合
    d.line([(355, oy - 6), (355, 30), (95, 30), (95, oy - 6)])
    alabel(d, 225, 4, 300, "できる：利用者に知らせずに更新")
    # 再認証の後
    y2 = oy + h + 80
    h2 = hh(4)
    state(d, 810, y2, 190, h2, "同じ利用者", ["権限で許される", "作業だけ復元", "結果が不明な保存は", "再送信せず確かめる"],
          fill=ACCENT_SURFACE, stroke=ACCENT)
    state(d, 520, y2, 220, h2, "別の利用者", ["前の利用者のデータ、", "入力、選択、通知、", "Toast、非同期の結果を", "破棄する"])
    d.line([(905, oy + h + 6), (905, y2 - 6)])
    mid = oy + h + 40
    d.line([(860, oy + h + 6), (860, mid), (630, mid), (630, y2 - 6)])
    # 帯
    by = y2 + h2 + 40
    d.rect(0, by, 1000, 56, fill=SURFACE)
    T(d, 24, by + 17, 940, "保存の途中で切れた場合は、結果を確かめる前に再送信しない", S_SUB, TEXT, bold=True)
    T(d, 0, y2 + 20, 480, "再認証の後の扱い", S_SUB, TEXT, bold=True)
    T(d, 0, y2 + 46, 480, "planReauthentication で、同じ利用者か", S_SUB, MUTED)
    T(d, 0, y2 + 68, 480, "別の利用者かを判定する", S_SUB, MUTED)
    d.save("session-reauth")


auth_flow()
session_reauth()
print("ok authentication")
