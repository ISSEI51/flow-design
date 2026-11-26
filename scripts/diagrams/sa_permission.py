"""Permission States diagrams (System & Account): visibility decision, authz responsibility, scope change.

Run directly to regenerate only these diagrams:
    python3 -I scripts/diagrams/sa_permission.py docs/diagrams
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sa_common import (  # noqa: E402
    ACCENT, ACCENT_SURFACE, LINE, MUTED, S_LABEL, S_NAME, S_NUM, S_SUB, SURFACE, TEXT, WARNING_C, D, T, alabel, hh, state,
)


# ---------------------------------------------------------------- 8 非表示・無効化・閲覧専用の判断
def permission_visibility():
    d = D()
    QX, QW = 0, 290
    OX, OW = 400, 500
    RH, GAP = 98, 34
    rows = [
        ("権限は確定しているか", "いいえ", ("確定するまで操作を許可しない", ["業務の操作：無効にして「確認しています」", "管理の機能：確定するまで表示しない"]), "plain"),
        ("契約プランと権限で\n許可されるか", "はい", ("表示して、操作できる", ["一時的な理由（障害、接続、処理中、", "前提の設定）は、無効にして理由を示す"]), "accent"),
        ("存在を知らせてよいか", "いいえ", ("表示しない", ["件数、検索の候補、書き出し、", "通知にも含めない"]), "hidden"),
        ("利用者の業務に関係するか", "いいえ", ("表示しない", ["業務に関係のない管理の機能", "（申請できる場合は、無効にして申請を示す）"]), "hidden"),
        ("対象は閲覧できる内容か", "はい", ("閲覧専用", ["通常の文字で表示する", "コピーが必要な値は Read Only の Input"]), "plain"),
    ]
    y0 = 0
    for k, (q, branch, (title, subs), kind) in enumerate(rows):
        y = y0 + k * (RH + GAP)
        lines = q.split("\n")
        d.rect(QX, y, QW, RH, fill=SURFACE, r=12)
        ty = y + (RH - 24 * len(lines)) / 2
        T(d, QX + 16, ty, QW - 32, q, S_NAME, TEXT, bold=True, align="center", step=24)
        fill, stroke, dashed = {"plain": ("none", LINE, False), "accent": (ACCENT_SURFACE, ACCENT, False), "hidden": ("none", LINE, True)}[kind]
        state(d, OX, y, OW, RH, title, subs, fill=fill, stroke=stroke, dashed=dashed)
        d.line([(QX + QW + 6, y + RH / 2), (OX - 6, y + RH / 2)])
        alabel(d, (QX + QW + OX) / 2, y + RH / 2 - 26, 90, branch)
        if k < len(rows) - 1:
            other = "いいえ" if branch == "はい" else "はい"
            d.line([(QX + QW / 2, y + RH + 4), (QX + QW / 2, y + RH + GAP - 4)])
            alabel(d, QX + QW / 2 + 44, y + RH + 6, 70, other, align="left")
    # 最後の「いいえ」：操作は無効にして理由を示す
    y = y0 + (len(rows) - 1) * (RH + GAP) + RH + GAP + 10
    d.line([(QX + QW / 2, y - GAP - 6), (QX + QW / 2, y - 4)])
    alabel(d, QX + QW / 2 + 44, y - GAP - 4, 70, "いいえ", align="left")
    oh = hh(2)
    state(d, QX, y, OX + OW, oh, "無効にして、操作の近くに理由を示す", ["理由は文で示し、aria-describedby で関連付ける（Tooltip だけにしない）",
                                                       "実際に使える解決の方法（申請、問い合わせ、設定への移動）だけを置く"], fill="none", stroke=LINE)
    by = y + oh + 36
    d.rect(0, by, OX + OW, 56, fill=SURFACE)
    T(d, 24, by + 17, OX + OW - 48, "UI の非表示と無効化は、バックエンドでの認可の代わりにならない", S_SUB, TEXT, bold=True)
    d.save("permission-visibility")


# ---------------------------------------------------------------- 9 認証・認可・UI 制御の責務分離
def authz_responsibility():
    d = D()
    W, G, H = 280, 50, 250
    cols = [
        ("1", "認証", "Authentication", "本人を確かめる", ["ログイン、多要素認証", "セッションの管理", "操作している人を特定する"]),
        ("2", "認可と契約プラン", "Authorization・Entitlement", "許可を決める（バックエンド）", ["アカウントとワークスペースの", "スコープを照合する", "受け付けた時点の権限で判断する", "閲覧できないデータを送らない"]),
        ("3", "UI の制御", "Permission States", "結果を伝える（クライアント）", ["取得中と取得の失敗は許可しない", "表示しない・無効と理由・閲覧専用", "古いスコープの権限を反映しない"]),
    ]
    for i, (n, name, en, purpose, items) in enumerate(cols):
        x = i * (W + G)
        accent = i == 1
        d.rect(x, 0, W, H, fill=ACCENT_SURFACE if accent else SURFACE, stroke=ACCENT if accent else "none", r=14, sw=1.2)
        d.text(x + 22, 18, 40, 18, n, S_NUM, ACCENT, bold=True)
        T(d, x + 22, 40, W - 44, name, S_NAME, TEXT, bold=True)
        T(d, x + 22, 68, W - 44, en, 13, MUTED)
        T(d, x + 22, 96, W - 44, purpose, S_SUB, TEXT)
        for k, s in enumerate(items):
            T(d, x + 22, 132 + k * 24, W - 44, s, 14, MUTED, step=20)
        if i < 2:
            d.line([(x + W + 6, H / 2), (x + W + G - 6, H / 2)])
    alabel(d, W + G / 2, H / 2 - 44, 60, "要求")
    alabel(d, 2 * W + G + G / 2, H / 2 - 44, 60, "応答")
    # UI を経由しない要求
    ry = H + 70
    d.rect(0, ry, W, 76, fill="none", stroke=LINE, r=12, dashed=True, sw=1.2)
    T(d, 18, ry + 14, W - 36, "UI を経由しない要求", S_SUB, TEXT, bold=True)
    T(d, 18, ry + 40, W - 36, "URL、リクエスト、ID の改変", 14, MUTED)
    cx = W + G + W / 2
    d.line([(W + 6, ry + 38), (cx, ry + 38), (cx, H + 6)], color=WARNING_C)
    T(d, cx + 14, ry + 14, W + G - 40, "バックエンドが拒否する", S_SUB, TEXT, bold=True)
    T(d, cx + 14, ry + 40, W + G - 40, "UI の制限に依存しない", 14, MUTED)
    by = ry + 76 + 40
    full = 3 * W + 2 * G
    d.rect(0, by, full, 92, fill=SURFACE)
    T(d, 24, by + 16, full - 48, "UI の非表示と無効化は、認可の代わりにならない", S_NAME, TEXT, bold=True)
    T(d, 24, by + 50, full - 48, "ロールと権限の定義（RBAC、ABAC）、権限の変更の検知、セッションの管理は製品の責務", S_SUB, MUTED)
    d.save("authz-responsibility")


# ---------------------------------------------------------------- 10 権限変更とスコープ境界
def permission_scope_change():
    d = D()
    # スコープの切り替え（A → B → A）
    d.text(0, 0, 600, 18, "スコープの切り替え（A → B → A）", S_LABEL, MUTED, bold=True)
    segs = [("A", "世代 1"), ("B", "世代 2"), ("A", "世代 3")]
    SX, SW, TY = 0, 300, 40
    for i, (s, g) in enumerate(segs):
        x = SX + i * SW
        d.rect(x + 2, TY, SW - 4, 44, fill=ACCENT_SURFACE if i == 2 else SURFACE, stroke=ACCENT if i == 2 else "none", r=10, sw=1.2)
        T(d, x + 18, TY + 12, SW - 36, f"スコープ {s}（{g}）", S_SUB, TEXT, bold=True)
    # 要求と応答
    RY = TY + 44
    reqs = [(40, 690, "A の要求（世代 1）", False), (340, 760, "B の要求（世代 2）", False), (640, 800, "A の要求（世代 3）", True)]
    for k, (sx, ex, label, ok) in enumerate(reqs):
        y = RY + 34 + k * 46
        d.dot(sx, y, d=8, fill=LINE, stroke=LINE)
        d.line([(sx + 6, y), (ex - 8, y)], color=ACCENT if ok else LINE, dashed=not ok)
        T(d, sx + 14, y - 24, 200, label, 14, MUTED)
        T(d, ex + (4 if ok else 14), y - 10, 90, "反映する" if ok else "反映しない", 14, ACCENT if ok else MUTED, bold=ok)
        if not ok:
            d.line([(ex - 8, y - 7), (ex + 6, y + 7)], color=WARNING_C, arrow=False, sw=2)
            d.line([(ex - 8, y + 7), (ex + 6, y - 7)], color=WARNING_C, arrow=False, sw=2)
    ny = RY + 34 + 3 * 46
    T(d, 0, ny, 900, "世代が違う応答は、AbortSignal に従わない処理の応答や、アンマウントの後の応答でも反映しない", S_SUB, TEXT)
    T(d, 0, ny + 26, 900, "切り替えた直後の描画から、前のスコープの権限とデータを表示しない", S_SUB, MUTED)

    # 同じスコープの中の権限の変更
    py = ny + 90
    d.text(0, py, 600, 18, "同じスコープの中の権限の変更", S_LABEL, MUTED, bold=True)
    sy = py + 36
    bw, gap = 260, 60
    h2 = hh(2)
    state(d, 0, sy, bw, h2, "変更の知らせ", ["サーバーからの通知、", "定期的な確認（製品）"])
    state(d, bw + gap, sy, bw, h2, "再確認中", ["表示は前の権限のまま", "操作は許可しない"], fill="none", stroke=LINE)
    state(d, 2 * (bw + gap), sy, bw, h2, "確定", ["表示と操作を更新する", "再ログインを求めない"], fill=ACCENT_SURFACE, stroke=ACCENT)
    for i in range(2):
        x = i * (bw + gap) + bw
        d.line([(x + 6, sy + h2 / 2), (x + gap - 6, sy + h2 / 2)])
    # 編集中の結果
    ey = sy + h2 + 50
    cx = 2 * (bw + gap) + bw / 2
    d.line([(cx, sy + h2 + 6), (cx, ey - 20)], arrow=False)
    d.line([(bw / 2, ey - 20), (2 * (bw + gap) + bw / 2, ey - 20)], arrow=False)
    outs = [("編集の権限を失った", ["保存を停止し、閲覧専用にする", "入力はポリシーが許す場合だけ保持"]),
            ("閲覧の権限も失った", ["内容と入力を表示しない", "理由は内容を含まない文で伝える"]),
            ("権限が戻った", ["最新の内容と権限を", "確かめてから再開する"])]
    h3 = hh(2)
    for i, (t, subs) in enumerate(outs):
        x = i * (bw + gap)
        d.line([(x + bw / 2, ey - 20), (x + bw / 2, ey - 4)])
        state(d, x, ey, bw, h3, t, subs)
    fy = ey + h3 + 36
    full = 3 * bw + 2 * gap
    d.rect(0, fy, full, 56, fill=SURFACE)
    T(d, 24, fy + 17, full - 48, "保存中に権限が変わった場合は、サーバーの実際の結果を示す（成功と推測しない）", S_SUB, TEXT, bold=True)
    d.save("permission-scope-change")


permission_visibility()
authz_responsibility()
permission_scope_change()
