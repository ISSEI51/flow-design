"""Generate App Structure (Patterns) diagrams (.drawio) with the shared visual vocabulary of gen.py.

Usage: python3 scripts/diagrams/gen_app_structure.py [output_dir]
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

NAV = "light-dark(#EEF1F4,#1C2128)"  # Sidebar の薄い面（図の中の表現）
DANGER = "light-dark(#CF222E,#F85149)"


def lines_text(d, x, y, w, text, size=S_SUB, color=MUTED, step=22):
    for k, ln in enumerate(text.split("\n")):
        d.text(x, y + k * step, w, 20, ln, size, color)


def num(d, n, x, y):
    d.dot(x, y, d=24, fill=ACCENT_SURFACE, stroke=ACCENT)
    d.text(x - 12, y - 12, 24, 24, n, 14, ACCENT, bold=True, align="center", valign="middle")


def content_bars(d, x, y, w, rows=4, step=18):
    d.bar(x, y, w * 0.4, 8, fill=BAR_STRONG)
    for k in range(rows):
        d.bar(x, y + 22 + k * step, w * (0.9 if k % 2 == 0 else 0.7), 6)


# ---------------------------------------------------------------- 1 App Structure の 5 種類の関係
def app_structure():
    d = D()
    # 1 App Shell
    d.rect(0, 0, 560, 440, fill="none", stroke=LINE, r=18, sw=1.5)
    num(d, "1", 0, 0)
    # 2 Navigation（Sidebar）
    d.rect(1, 1, 150, 438, fill=NAV, r=17)
    num(d, "2", 150, 40)
    for k in range(7):
        d.bar(22, 40 + k * 30, 90 - (k % 3) * 16, 8, fill=TEXT if k == 1 else BAR_STRONG)
    d.rect(14, 64, 120, 24, fill="none", stroke=ACCENT, r=6, sw=1.2)
    # 4 Page Layout
    d.rect(176, 24, 360, 392, fill="none", stroke=ACCENT, r=12, dashed=True, sw=1.2)
    num(d, "4", 536, 24)
    # 3 Page Header
    d.bar(196, 48, 140, 14, fill=TEXT)
    d.bar(196, 72, 200, 6)
    d.rect(434, 44, 82, 26, fill=TEXT, r=8)
    num(d, "3", 176, 56)
    # 5 Section Layout
    for k, y in enumerate((112, 262)):
        d.bar(196, y, 110, 11, fill=TEXT)
        content_bars(d, 196, y + 26, 300, rows=3)
        if k == 1:
            d.line([(196, y - 18), (516, y - 18)], color=BAR, arrow=False, sw=1)
    num(d, "5", 176, 120)
    LX = 600
    rows = [("1", "App Shell", "画面全体の骨組み\nスクロールの領域、スキップリンク"),
            ("2", "Navigation", "主要な機能への移動\n業務の流れの順、2 階層まで"),
            ("3", "Page Header", "ページの目的と、ページ全体の操作\nタイトル 28px、主要な操作は 1 つ"),
            ("4", "Page Layout", "内容の最大幅、配置、余白\n5 種類の幅、列の構成"),
            ("5", "Section Layout", "情報のまとまりの見出しと区切り\n余白から検討する")]
    for i, (n, name, sub) in enumerate(rows):
        y = i * 88
        d.text(LX, y + 2, 24, 20, n, S_NUM, ACCENT, bold=True)
        d.text(LX + 30, y, 300, 24, name, S_NAME, TEXT, bold=True)
        lines_text(d, LX + 30, y + 30, 300, sub)
    d.save("app-structure")


# ---------------------------------------------------------------- 2 App Shell の 4 種類
def app_shell_types():
    d = D()
    W, H, G = 204, 150, 28
    items = [("Sidebar Shell", "標準", "業務 SaaS、管理画面"),
             ("Header Shell", "", "主要な機能が少ないサービス"),
             ("Hybrid Shell", "", "大規模な製品で\n機能群を切り替える"),
             ("Minimal Shell", "", "ログイン、\n集中して行う操作")]
    for i, (name, tag, use) in enumerate(items):
        x = i * (W + G)
        d.rect(x, 0, W, H, fill="none", stroke=LINE, r=12, sw=1.2)
        if i == 0:
            d.rect(x + 1, 1, 52, H - 2, fill=NAV, r=11)
            content_bars(d, x + 66, 18, W - 82)
        elif i == 1:
            d.rect(x + 1, 1, W - 2, 26, fill=NAV, r=11)
            for k in range(3):
                d.bar(x + 60 + k * 36, 11, 26, 6, fill=TEXT if k == 0 else BAR_STRONG)
            content_bars(d, x + 16, 42, W - 32)
        elif i == 2:
            d.rect(x + 1, 1, W - 2, 26, fill=NAV, r=11)
            for k in range(3):
                d.bar(x + 60 + k * 36, 11, 26, 6, fill=TEXT if k == 0 else BAR_STRONG)
            d.rect(x + 1, 30, 52, H - 31, fill=NAV, r=0)
            content_bars(d, x + 66, 44, W - 82, rows=3)
        else:
            content_bars(d, x + 62, 34, 80, rows=3)
            d.rect(x + 62, 112, 80, 16, fill=TEXT, r=6)
        d.text(x, H + 18, W, 24, name, S_NAME, TEXT, bold=True)
        if tag:
            d.text(x + 134, H + 20, 60, 20, tag, S_SUB, ACCENT, bold=True)
        lines_text(d, x, H + 50, W, use)
    y = H + 120
    d.rect(0, y, 4 * W + 3 * G, 64, fill=SURFACE)
    d.text(24, y + 12, 860, 20, "4 種類は 1 つの部品の Variant にしない", S_NAME, TEXT, bold=True)
    d.text(24, y + 38, 860, 20, "AppShell、Sidebar、AppShellHeader、MinimalShell の組み合わせで作る。モバイルの業務アプリは左から開く Sheet", S_SUB, MUTED)
    d.save("app-shell-types")


# ---------------------------------------------------------------- 3 Navigation の階層と並び順
def mini_nav(d, x, y, items, w=170):
    h = 16 + len(items) * 26
    d.rect(x, y, w, h, fill=NAV, r=10)
    for k, (kind, depth, active) in enumerate(items):
        iy = y + 10 + k * 26
        if kind == "label":
            d.bar(x + 14, iy + 9, 40, 5, fill=MUTED)
            continue
        if active:
            d.rect(x + 6, iy, w - 12, 22, fill=BAR, r=6)
        ix = x + 14 + depth * 26
        if depth == 0:
            d.rect(ix, iy + 5, 12, 12, fill="none", stroke=BAR_STRONG, r=3, sw=1)
            ix += 20
        d.bar(ix, iy + 8, 64 - depth * 10, 6, fill=TEXT if active else BAR_STRONG)
    return h


def navigation():
    d = D()
    d.text(0, 0, 900, 18, "階層：フラット → グループ → 2 階層の順に検討する", S_LABEL, MUTED, bold=True)
    cols = [("フラット", "原則", [("i", 0, True), ("i", 0, False), ("i", 0, False), ("i", 0, False)]),
            ("グループ", "意味のある分類がある場合", [("i", 0, False), ("label", 0, False), ("i", 0, True), ("i", 0, False), ("label", 0, False), ("i", 0, False)]),
            ("2 階層", "最大", [("i", 0, False), ("i", 0, False), ("i", 1, True), ("i", 1, False), ("i", 0, False)])]
    for i, (name, sub, items) in enumerate(cols):
        x = i * 220
        mini_nav(d, x, 32, items)
        d.text(x, 214, 200, 24, name, S_NAME, TEXT, bold=True)
        d.text(x, 242, 200, 20, sub, S_SUB, MUTED)
    x = 660
    d.rect(x, 32, 220, 170, fill="none", stroke=DANGER, r=10, dashed=True, sw=1.2)
    for k in range(3):
        d.bar(x + 20 + k * 26, 60 + k * 30, 80, 6, fill=BAR_STRONG)
    d.line([(x + 20, 170), (x + 200, 60)], color=DANGER, arrow=False, sw=1.5)
    d.text(x, 214, 240, 24, "3 階層以上", S_NAME, TEXT, bold=True)
    d.text(x, 242, 240, 20, "Tabs、Hybrid Shell で見直す", S_SUB, MUTED)

    y = 310
    d.text(0, y, 900, 18, "並び順：業務の流れとユーザーが考える順", S_LABEL, MUTED, bold=True)
    steps = ["見込み客", "顧客", "商談", "見積もり", "契約", "請求書", "入金"]
    pw, pg = 104, 22
    x0 = 0
    py = y + 66
    d.rect(x0, py - 34, 100, 30, fill=ACCENT_SURFACE, r=8)
    d.text(x0, py - 34, 100, 30, "ホーム", S_SUB, ACCENT, bold=True, align="center", valign="middle")
    d.text(x0 + 112, py - 30, 360, 20, "使用頻度が極端に高いため先頭（合理的な例外）", S_SUB, MUTED)
    for k, s in enumerate(steps):
        sx = x0 + k * (pw + pg)
        d.rect(sx, py + 10, pw, 36, fill=SURFACE, r=10)
        d.text(sx, py + 10, pw, 36, s, S_SUB, TEXT, bold=True, align="center", valign="middle")
        if k < len(steps) - 1:
            d.line([(sx + pw + 3, py + 28), (sx + pw + pg - 3, py + 28)])
    gy = py + 60
    for label, a, b in (("営業", 0, 4), ("請求", 5, 6)):
        xa = x0 + a * (pw + pg)
        xb = x0 + b * (pw + pg) + pw
        d.line([(xa, gy), (xa, gy + 8), (xb, gy + 8), (xb, gy)], color=LINE, arrow=False, sw=1.2)
        d.text(xa, gy + 14, xb - xa, 20, label, S_SUB, MUTED, align="center")
    d.text(0, gy + 52, 900, 20, "システムの内部の構造（マスタ、伝票）で分類しない。設定とアカウントは Sidebar の下部", S_SUB, MUTED)
    d.save("navigation-order")


# ---------------------------------------------------------------- 4 Page Header の構造
def dim_v(d, x, y1, y2, label):
    d.line([(x, y1), (x, y2)], color=ACCENT, arrow=False, sw=1.2)
    d.line([(x - 5, y1), (x + 5, y1)], color=ACCENT, arrow=False, sw=1.2)
    d.line([(x - 5, y2), (x + 5, y2)], color=ACCENT, arrow=False, sw=1.2)
    d.text(x + 10, (y1 + y2) / 2 - 9, 80, 18, label, 13, ACCENT, bold=True)


def page_header():
    d = D()
    X, W = 40, 620
    d.rect(0, 0, W + 80, 330, fill="none", stroke=LINE, r=16, sw=1)
    # 1 breadcrumb
    d.bar(X, 30, 40, 6, fill=BAR_STRONG)
    d.bar(X + 52, 30, 80, 6, fill=BAR_STRONG)
    num(d, "1", X - 20, 33)
    # 2 title + status
    d.bar(X, 58, 250, 22, fill=TEXT)
    d.rect(X + 262, 60, 54, 18, fill="none", stroke=LINE, r=9, sw=1)
    num(d, "2", X - 20, 69)
    # 3 description
    d.bar(X, 96, 220, 8, fill=BAR_STRONG)
    num(d, "3", X - 20, 100)
    dim_v(d, X + 330, 80, 96, "8px")
    # 4 actions
    d.rect(X + 430, 56, 90, 32, fill=SURFACE, r=9)
    d.rect(X + 528, 56, 92, 32, fill=TEXT, r=9)
    num(d, "4", X + 620, 56)
    d.text(X + 512, 92, 30, 16, "8px", 12, ACCENT, bold=True, align="center")
    # 5 content
    d.bar(X, 158, 140, 12, fill=TEXT)
    for k in range(4):
        d.bar(X, 186 + k * 22, W * (0.95 if k % 2 == 0 else 0.7), 6)
    num(d, "5", X - 20, 164)
    dim_v(d, X + 330, 104, 158, "32px")
    LX = 760
    rows = [("1", "Breadcrumb", "階層や現在地がわかりにくい場合だけ"),
            ("2", "タイトル", "28px / 600 の h1。ステータスは右に"),
            ("3", "補足の説明", "14px。必要な場合だけ"),
            ("4", "操作", "右に置き、間は 8px。Primary は 1 つ\n収まらない場合はタイトルの下へ"),
            ("5", "メインの内容", "間は 32px。境界線と Card は使わない")]
    for i, (n, name, sub) in enumerate(rows):
        y = i * 72 + (12 if i == 4 else 0)
        d.text(LX, y + 2, 24, 20, n, S_NUM, ACCENT, bold=True)
        d.text(LX + 30, y, 300, 24, name, S_NAME, TEXT, bold=True)
        lines_text(d, LX + 30, y + 28, 320, sub)
    # narrow
    y = 370
    d.text(0, y, 400, 18, "狭い領域（タイトルに 20rem を残せない）", S_LABEL, MUTED, bold=True)
    d.rect(0, y + 30, 300, 170, fill="none", stroke=LINE, r=16, sw=1)
    d.bar(24, y + 56, 200, 18, fill=TEXT)
    d.bar(24, y + 82, 120, 18, fill=TEXT)
    d.rect(24, y + 120, 100, 32, fill=SURFACE, r=9)
    d.rect(132, y + 120, 110, 32, fill=TEXT, r=9)
    lines_text(d, 330, y + 56, 520, "タイトルが折り返し、操作はタイトルの下へ移る\n操作は隠さない（機能を失わせない）\n判断は画面の幅ではなく Page Header の領域の幅")
    d.save("page-header-anatomy")


# ---------------------------------------------------------------- 5 Page Layout の 5 種類の幅
def page_layout_widths():
    d = D()
    scale = 560 / 1920
    rows = [("Full Width", None, "一覧、Table"), ("Wide", 1440, "分析、ダッシュボード"),
            ("Standard", 960, "詳細、設定"), ("Focused", 640, "登録、編集、フォーム"),
            ("Compact", 400, "ログイン、認証")]
    d.text(0, 0, 900, 18, "最大幅（1920px の画面に対する割合）", S_LABEL, MUTED, bold=True)
    for i, (name, px, use) in enumerate(rows):
        y = 36 + i * 56
        d.text(0, y + 6, 120, 24, name, S_NAME, TEXT, bold=True)
        bx = 140
        d.rect(bx, y, 560, 36, fill=SURFACE, r=6)
        w = 560 if px is None else px * scale
        d.rect(bx, y, w, 36, fill=ACCENT_SURFACE, stroke=ACCENT, r=6, sw=1)
        d.text(bx + 12, y, 200, 36, "上限なし" if px is None else f"{px:,}px", S_SUB, ACCENT, bold=True, valign="middle")
        d.text(724, y + 8, 200, 20, use, S_SUB, MUTED)
    y = 340
    d.text(0, y, 900, 18, "適用範囲（Sidebar Shell・左寄せ）", S_LABEL, MUTED, bold=True)
    d.rect(0, y + 30, 900, 150, fill="none", stroke=LINE, r=14, sw=1)
    d.rect(1, y + 31, 150, 148, fill=NAV, r=13)
    d.rect(152, y + 31, 747, 148, fill=SURFACE, r=0)
    d.rect(176, y + 55, 560, 100, fill="light-dark(#FFFFFF,#0D1117)", stroke=ACCENT, r=4, dashed=True, sw=1.2)
    content_bars(d, 196, y + 72, 500, rows=2)
    d.line([(152, y + 168), (176, y + 168)], color=ACCENT, arrow=False, sw=1.2)
    d.text(144, y + 186, 60, 18, "24px", 13, ACCENT, bold=True, align="center")
    d.line([(176, y + 46), (736, y + 46)], color=ACCENT, arrow=False, sw=1.2)
    d.text(380, y + 30, 160, 16, "最大幅（内容の幅）", 13, ACCENT, bold=True, align="center")
    lines_text(d, 0, y + 214, 900, "ページの余白はデスクトップ 24px、モバイル 16px（PageLayout）。最大幅は余白の内側（page-layout-content）\n独立した画面（ログイン）は中央寄せ。製品は --page-width-* で上書きできる")
    d.save("page-layout-widths")


# ---------------------------------------------------------------- 6 スクロールの領域とレスポンシブ
def scroll_arrow(d, x, y1, y2):
    d.line([(x, y1), (x, y2)], color=ACCENT, arrow=True, sw=1.5)
    d.line([(x, y2), (x, y1)], color=ACCENT, arrow=True, sw=1.5)


def scroll_regions():
    d = D()
    d.text(0, 0, 420, 18, "デスクトップ", S_LABEL, MUTED, bold=True)
    d.rect(0, 28, 420, 270, fill="none", stroke=LINE, r=14, sw=1)
    d.rect(1, 29, 110, 268, fill=NAV, r=13)
    for k in range(6):
        d.bar(16, 52 + k * 26, 64, 6, fill=BAR_STRONG)
    scroll_arrow(d, 96, 60, 220)
    content_bars(d, 132, 52, 230, rows=8, step=22)
    scroll_arrow(d, 396, 60, 270)
    d.text(0, 312, 420, 20, "main と Sidebar のメニューが独立してスクロール", S_SUB, TEXT, bold=True)
    d.text(0, 336, 420, 20, "ページ全体（document）はスクロールしない", S_SUB, MUTED)

    X = 470
    d.text(X, 0, 200, 18, "モバイル（業務）", S_LABEL, MUTED, bold=True)
    d.rect(X, 28, 170, 300, fill="none", stroke=LINE, r=18, sw=1)
    d.rect(X + 1, 29, 168, 34, fill="light-dark(#FFFFFF,#0D1117)", r=17)
    d.rect(X + 12, 40, 14, 12, fill="none", stroke=BAR_STRONG, r=3, sw=1)
    content_bars(d, X + 14, 80, 130, rows=8, step=22)
    scroll_arrow(d, X + 156, 80, 310)
    lines_text(d, X, 342, 200, "メニューは左から開く Sheet\n移動したら閉じる")

    X2 = 690
    d.text(X2, 0, 220, 18, "モバイル（一般消費者向け）", S_LABEL, MUTED, bold=True)
    d.rect(X2, 28, 170, 300, fill="none", stroke=LINE, r=18, sw=1)
    content_bars(d, X2 + 14, 52, 130, rows=8, step=22)
    scroll_arrow(d, X2 + 156, 52, 264)
    d.rect(X2 + 1, 272, 168, 55, fill=NAV, r=17)
    for k in range(4):
        d.dot(X2 + 30 + k * 37, 290, d=12, fill=TEXT if k == 0 else "none", stroke=TEXT if k == 0 else BAR_STRONG)
    d.bar(X2 + 1, 316, 168, 4, fill=ACCENT)
    lines_text(d, X2, 342, 220, "Bottom Navigation はレイアウトの中\n下端に Safe Area（青）\n入力中は隠す")

    y = 430
    d.text(0, y, 900, 18, "レスポンシブ：列の数は内容の領域の幅で決める（Container Query）", S_LABEL, MUTED, bold=True)
    d.rect(0, y + 30, 420, 130, fill="none", stroke=LINE, r=12, sw=1)
    d.rect(20, y + 50, 260, 90, fill=SURFACE, r=8)
    d.text(20, y + 50, 260, 90, "1 メイン", S_NAME, TEXT, bold=True, align="center", valign="middle")
    d.rect(296, y + 50, 104, 90, fill=SURFACE, r=8)
    d.text(296, y + 50, 104, 90, "2 補足", S_NAME, TEXT, bold=True, align="center", valign="middle")
    d.line([(440, y + 95), (500, y + 95)])
    d.rect(520, y + 30, 200, 190, fill="none", stroke=LINE, r=12, sw=1)
    d.rect(540, y + 50, 160, 70, fill=SURFACE, r=8)
    d.text(540, y + 50, 160, 70, "1 メイン", S_NAME, TEXT, bold=True, align="center", valign="middle")
    d.rect(540, y + 130, 160, 70, fill=SURFACE, r=8)
    d.text(540, y + 130, 160, 70, "2 補足", S_NAME, TEXT, bold=True, align="center", valign="middle")
    lines_text(d, 740, y + 40, 170, "DOM の順のまま\n1 列に並べる\n視覚の順序だけを\n入れ替えない")
    lines_text(d, 0, y + 176, 500, "表など、領域の中の横スクロールは許容する\nページ全体の横スクロールは禁止")
    d.save("scroll-regions")


# ---------------------------------------------------------------- 7 Section Layout の情報の階層
def section_hierarchy():
    d = D()
    X = 40
    d.text(X, 0, 400, 34, "ページのタイトル", 26, TEXT, bold=True)
    d.text(X + 420, 8, 200, 20, "h1・28px / 600", S_SUB, MUTED)
    d.text(X, 70, 400, 30, "セクション", 22, TEXT, bold=True)
    d.text(X + 420, 76, 200, 20, "h2・24px / 600", S_SUB, MUTED)
    dim_v(d, X + 380, 34, 70, "32px")
    content_bars(d, X, 124, 340, rows=2)
    dim_v(d, X + 380, 100, 124, "24px")
    d.text(X + 24, 200, 400, 26, "サブセクション", 18, TEXT, bold=True)
    d.text(X + 420, 204, 200, 20, "h3・20px / 600", S_SUB, MUTED)
    content_bars(d, X + 24, 242, 316, rows=2)
    dim_v(d, X + 380, 226, 242, "16px")
    d.rect(X - 16, 190, 380, 110, fill="none", stroke=BAR, r=10, sw=1)
    d.text(X, 320, 600, 20, "Section を入れ子にすると、見出しの要素が 1 つずつ下がる。文字の大きさだけで見出しを表さない", S_SUB, MUTED)

    y = 380
    d.text(0, y, 900, 18, "間隔：情報の関係が遠いほど広く", S_LABEL, MUTED, bold=True)
    rows = [("関連性の強い要素", "4〜8px", 8), ("一般的な要素の間", "12〜16px", 16), ("見出しと内容", "16〜24px", 24),
            ("情報のグループの間", "24〜32px", 32), ("セクションの間", "32〜48px", 48), ("大きな章の間", "64〜96px", 96)]
    for i, (name, label, px) in enumerate(rows):
        ry = y + 32 + i * 36
        d.text(0, ry, 200, 24, name, S_SUB, TEXT)
        d.text(210, ry, 100, 24, label, S_SUB, MUTED)
        d.rect(320, ry + 4, px * 3, 14, fill=ACCENT_SURFACE, stroke=ACCENT, r=3, sw=1)
    d.save("section-hierarchy")


# ---------------------------------------------------------------- 8 Section Layout の区切り方
def section_separation():
    d = D()
    W, G = 160, 20
    steps = [("1", "余白"), ("2", "文字の強弱"), ("3", "細い境界線"), ("4", "背景色"), ("5", "Card")]
    for i, (n, name) in enumerate(steps):
        x = i * (W + G)
        d.text(x, 0, 30, 20, n, S_NUM, ACCENT, bold=True)
        d.text(x + 24, 0, W, 24, name, S_NAME, TEXT, bold=True)
        y = 40
        if i == 0:
            content_bars(d, x, y, W, rows=2)
            content_bars(d, x, y + 84, W, rows=2)
        elif i == 1:
            d.bar(x, y, 90, 12, fill=TEXT)
            content_bars(d, x, y + 20, W, rows=1)
            d.bar(x, y + 84, 90, 12, fill=TEXT)
            content_bars(d, x, y + 104, W, rows=1)
        elif i == 2:
            content_bars(d, x, y, W, rows=2)
            d.line([(x, y + 70), (x + W, y + 70)], color=LINE, arrow=False, sw=1)
            content_bars(d, x, y + 84, W, rows=2)
        elif i == 3:
            content_bars(d, x, y, W, rows=2)
            d.rect(x, y + 76, W, 70, fill=SURFACE, r=8)
            content_bars(d, x + 12, y + 88, W - 24, rows=1)
        else:
            for k in range(2):
                d.rect(x + k * 84, y, 76, 146, fill="none", stroke=LINE, r=10, sw=1)
                d.bar(x + k * 84 + 12, y + 16, 40, 8, fill=TEXT)
                d.bar(x + k * 84 + 12, y + 34, 50, 6)
    notes = ["最初に検討する", "まとまりの始まり", "内容が変わる境目", "性質の違う領域", "独立した単位・比較"]
    for i, t in enumerate(notes):
        d.text(i * (W + G), 206, W, 20, t, S_SUB, MUTED)
    d.rect(0, 250, 5 * W + 4 * G, 64, fill=SURFACE)
    d.text(24, 262, 860, 20, "前の方法でまとまりが伝わる場合は、後の方法を足さない", S_NAME, TEXT, bold=True)
    d.text(24, 288, 860, 20, "同じ文脈の連続した情報を Card で囲まない。Card を入れ子にしない", S_SUB, MUTED)
    d.save("section-separation")


for f in (app_structure, app_shell_types, navigation, page_header, page_layout_widths, scroll_regions,
          section_hierarchy, section_separation):
    f()
print("ok app-structure")
