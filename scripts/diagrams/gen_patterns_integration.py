"""Patterns Integration diagrams (pi-*.drawio): how the 27 Patterns and their shared state relate.

Usage: python3 -I scripts/diagrams/gen_patterns_integration.py [output_dir]
Saves pi-patterns, pi-pattern-usage, pi-shared-state, pi-scope-async, pi-unknown-result, pi-browse-forms
and pi-analysis-ops. Visual vocabulary and helpers come from gen.py and sa_common.py. The output is deterministic.
"""
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sa_common import (  # noqa: E402
    ACCENT, ACCENT_SURFACE, BAR, LINE, MUTED, S_LABEL, S_SUB, SURFACE, TEXT, D, T, alabel, est, hh, num, state,
)


def edge(d, pts, both=False, dashed=False, arrow=True, color=LINE, sw=1.5):
    """折れ線の矢印。both=True は両端に矢印を付ける（gen.D.line は終点の矢印だけ）。"""
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    mids = "".join(f'<mxPoint x="{x}" y="{y}"/>' for x, y in pts[1:-1])
    arr = f'<Array as="points">{mids}</Array>' if mids else ""
    start = "startArrow=blockThin;startFill=1;startSize=7;" if both else "startArrow=none;"
    st = (f"html=0;endArrow={'blockThin' if arrow else 'none'};endFill=1;endSize=7;{start}"
          f"strokeColor={color};strokeWidth={sw};dashed={1 if dashed else 0};rounded=1;")
    d.cells.append(
        f'<mxCell id="{d.id()}" value="" style="{st}" edge="1" parent="1">'
        f'<mxGeometry relative="1" as="geometry"><mxPoint x="{x1}" y="{y1}" as="sourcePoint"/>'
        f'<mxPoint x="{x2}" y="{y2}" as="targetPoint"/>{arr}</mxGeometry></mxCell>')


def pbox(d, x, y, w, h, label, size=15, fill=SURFACE, stroke="none"):
    """1 行のラベルのボックス"""
    if est(label, size) > w - 16:
        print(f"WARN width {est(label, size):.0f}>{w - 16}: {label}", file=sys.stderr)
    d.rect(x, y, w, h, fill=fill, stroke=stroke, r=10, sw=1.2)
    d.text(x, y, w, h, label, size, TEXT, align="center", valign="middle")


# ---------------------------------------------------------------- 1 27 種類の Patterns の関係（コードの依存）
def patterns():
    d = D()
    BW, BH, PITCH, TOP, CP = 180, 40, 78, 36, 250
    cols = [
        ("App Structure", ["App Shell", "Navigation", "Page Header", "Page Layout", "Section Layout"]),
        ("Data Analysis", ["Drill-down", "Analysis Filters", "Period Comparison", "Metric Overview", "Dashboard Layout"]),
        ("Data Browsing", ["List & Detail", "Search & Filter", "View Switching", "Data States", "Bulk Actions"]),
        ("System & Account", ["Authentication", "Onboarding", "Permission States", "Notifications", "Settings",
                              "System States"]),
        ("Forms & Workflows", ["Form Layout", "Create & Edit", "Confirmation", "Unsaved Changes",
                               "Multi-step Workflow", "Import & Export"]),
    ]
    pos = {}
    for c, (title, names) in enumerate(cols):
        d.text(c * CP, 0, BW, 20, title, S_LABEL, MUTED, bold=True)
        for r, n in enumerate(names):
            pos[n] = (c, r)
            pbox(d, c * CP, TOP + r * PITCH, BW, BH, n)

    def yc(r):
        return TOP + r * PITCH + BH / 2

    def top(r):
        return TOP + r * PITCH

    def bot(r):
        return TOP + r * PITCH + BH

    def L(n):
        return pos[n][0] * CP

    def Rr(n):
        return pos[n][0] * CP + BW

    r = {n: p[1] for n, p in pos.items()}
    # 他の列への依存
    edge(d, [(L("Dashboard Layout") - 6, yc(r["Dashboard Layout"])), (Rr("Section Layout") + 6, yc(r["Section Layout"]))])
    edge(d, [(Rr("Drill-down") + 6, yc(r["Drill-down"])), (L("List & Detail") - 6, yc(r["List & Detail"]))])
    edge(d, [(Rr("Metric Overview") + 6, yc(r["Metric Overview"])), (L("Data States") - 6, yc(r["Data States"]))])
    ds_y = yc(r["Data States"])
    mx = Rr("Dashboard Layout") + 35
    edge(d, [(Rr("Dashboard Layout") + 6, yc(r["Dashboard Layout"])), (mx, yc(r["Dashboard Layout"])),
             (mx, ds_y + 14), (L("Data States") - 6, ds_y + 14)])
    px = L("Permission States") - 30
    edge(d, [(L("Permission States") - 6, yc(r["Permission States"])), (px, yc(r["Permission States"])),
             (px, ds_y - 14), (Rr("Data States") + 6, ds_y - 14)])
    edge(d, [(L("Notifications") - 6, yc(r["Notifications"])), (Rr("Data States") + 6, yc(r["Notifications"]))])
    # Data Analysis の中
    cx = L("Analysis Filters") + BW / 2
    edge(d, [(cx, bot(r["Drill-down"]) + 6), (cx, top(r["Analysis Filters"]) - 6)])
    edge(d, [(cx, bot(r["Analysis Filters"]) + 6), (cx, top(r["Period Comparison"]) - 6)], both=True)
    edge(d, [(cx, bot(r["Period Comparison"]) + 6), (cx, top(r["Metric Overview"]) - 6)], both=True)
    d.text(cx + 12, bot(r["Analysis Filters"]) + 2, 40, 20, "※1", 14, MUTED)
    d.text(cx + 12, bot(r["Period Comparison"]) + 2, 40, 20, "※1", 14, MUTED)
    lx = L("Drill-down") - 28
    edge(d, [(L("Drill-down") - 6, yc(0)), (lx, yc(0)), (lx, yc(2)), (L("Period Comparison") - 6, yc(2))])
    # Forms & Workflows の中
    cx = L("Create & Edit") + BW / 2
    edge(d, [(cx, bot(r["Form Layout"]) + 6), (cx, top(r["Create & Edit"]) - 6)])
    edge(d, [(cx, top(r["Confirmation"]) - 6), (cx, bot(r["Create & Edit"]) + 6)])
    # useScopeGuard
    base = top(5) + BH
    gy = base + 60
    gx, gw, gh = 670, 550, 56
    d.rect(gx, gy, gw, gh, fill=ACCENT_SURFACE, stroke=ACCENT, r=12, sw=1.2)
    T(d, gx + 8, gy + 8, gw - 16, "useScopeGuard（共通。Pattern ではない）", 16, TEXT, bold=True, align="center", step=24)
    T(d, gx + 8, gy + 32, gw - 16, "非同期の結果の世代と、古い操作の開始を扱う", S_SUB, MUTED, align="center")
    users = {
        2: ["Bulk Actions"],
        3: ["Notifications", "Settings", "System States"],
        4: ["Create & Edit", "Confirmation"],
    }
    for c, names in users.items():
        lane = c * CP + BW + 14 if c != 2 else c * CP + BW + 14
        ys = sorted(yc(r[n]) for n in names)
        edge(d, [(c * CP + BW + 6, ys[0]), (lane, ys[0]), (lane, gy - 6)])
        for yy in ys[1:]:
            edge(d, [(c * CP + BW + 6, yy), (lane, yy)], arrow=False)
    # 凡例と注記
    ly = gy - 2
    edge(d, [(0, ly + 10), (44, ly + 10)])
    T(d, 60, ly, 600, "実線＝コードの依存（registry の import）。矢印は使う側から依存先へ", S_SUB, TEXT)
    edge(d, [(0, ly + 40), (44, ly + 40)], both=True)
    T(d, 60, ly + 30, 600, "※1 相互参照（例：analysis-period と analysis-query）。\nファイルの循環はない", S_SUB, TEXT)
    T(d, 0, ly + 90, 640, "循環するファイルの依存は 0 件。\nregistry から preview への依存は 0 件（2026-11-28 に確認）",
      S_SUB, MUTED)
    d.save("pi-patterns")


# ---------------------------------------------------------------- 2 利用の接続（コードの依存ではない）
def pattern_usage():
    d = D()
    BW, BH, P = 170, 40, 58
    TX, GAPX = 0, 160  # 左の列の x、矢印の幅
    RX = BW + GAPX
    DASH = dict(dashed=True)
    y = 0
    # 移動の前の確認
    d.text(0, y, 600, 20, "移動の前の確認", S_LABEL, MUTED, bold=True)
    y += 30
    for k, (n, lab) in enumerate((("App Shell", "移動の前の確認"), ("Navigation", "移動の前の確認"),
                                  ("Notifications", "通知からの移動"))):
        pbox(d, 0, y + k * P, BW, BH, n)
        edge(d, [(BW + 6, y + k * P + BH / 2), (RX - 6, y + k * P + BH / 2)], **DASH)
        alabel(d, BW + GAPX / 2, y + k * P + BH / 2 - 24, GAPX, lab)
    pbox(d, RX, y, BW, 2 * P + BH, "Unsaved Changes")
    y += 2 * P + BH + 56
    # 一覧と編集
    d.text(0, y, 600, 20, "明細へ進み、編集して一覧へ戻る", S_LABEL, MUTED, bold=True)
    y += 30
    chain = ["Drill-down", "List & Detail", "Create & Edit"]
    labs = ["明細へ", "編集して一覧へ戻る"]
    for k, n in enumerate(chain):
        pbox(d, k * (BW + GAPX), y, BW, BH, n)
    for k, lab in enumerate(labs):
        x1 = k * (BW + GAPX) + BW
        edge(d, [(x1 + 6, y + BH / 2), (x1 + GAPX - 6, y + BH / 2)], **DASH)
        alabel(d, x1 + GAPX / 2, y + BH / 2 - 24, GAPX, lab)
    y += BH + 56
    # Permission States / System States
    for title, src, targets in (
        ("閲覧と操作の判断", "Permission States", ["Navigation", "Bulk Actions", "Create & Edit", "Drill-down"]),
        ("更新の制限", "System States", ["Create & Edit", "Bulk Actions", "Import & Export"]),
    ):
        d.text(0, y, 600, 20, title, S_LABEL, MUTED, bold=True)
        y += 30
        hgt = (len(targets) - 1) * P + BH
        pbox(d, 0, y, BW, hgt, src)
        for k, n in enumerate(targets):
            pbox(d, RX, y + k * P, BW, BH, n)
            edge(d, [(BW + 6, y + k * P + BH / 2), (RX - 6, y + k * P + BH / 2)], **DASH)
        y += hgt + 56
    edge(d, [(0, y - 30), (44, y - 30)], dashed=True)
    T(d, 60, y - 40, 700, "破線＝利用の接続（コードの依存ではない。コードの依存は pi-patterns）", S_SUB, TEXT)
    d.save("pi-pattern-usage")


# ---------------------------------------------------------------- 3 共通状態管理と責務
def shared_state():
    d = D()
    rows = [
        ("取得", "useBrowseData", "", "Data States", False),
        ("一括操作", "useBulkSelection・useBulkAction", "", "Bulk Actions", True),
        ("明示的な保存", "useFormState", "", "Create & Edit", True),
        ("即時保存", "useInstantSave", "1 つの値、成功・失敗・不明だけ", "Create & Edit", True),
        ("設定の保存", "useInstantSettings・useSettingsForm", "権限不足、競合、版、部分成功", "Settings", True),
        ("自動保存", "useAutosave", "", "Create & Edit", False),
        ("取り消し", "useUndoableAction", "", "Confirmation", True),
        ("移動の前の確認", "useUnsavedChanges", "", "Unsaved Changes", False),
        ("分析の条件", "useAnalysisQuery", "非同期の処理を持たない", "Analysis Filters", False),
        ("認可", "useAccess", "", "Permission States", False),
        ("接続", "useConnectivity", "", "System States", True),
        ("通知", "useNotificationFeed", "", "Notifications", True),
    ]
    TW, RH, P, Y0 = 700, 50, 58, 32
    d.text(18, 0, 130, 20, "責務", S_LABEL, MUTED, bold=True)
    d.text(168, 0, 300, 20, "hook", S_LABEL, MUTED, bold=True)
    d.text(528, 0, 170, 20, "置く Pattern", S_LABEL, MUTED, bold=True)
    gtop = None
    gbot = None
    for k, (duty, hook, note, pat, guard) in enumerate(rows):
        y = Y0 + k * P
        d.rect(0, y, TW, RH, fill=SURFACE, r=10, sw=1.2)
        T(d, 18, y + 13, 140, duty, 15, TEXT, bold=True)
        if note:
            T(d, 168, y + 6, 350, hook, 15, TEXT, bold=True)
            T(d, 168, y + 26, 350, note, 14, MUTED, step=18)
        else:
            T(d, 168, y + 13, 350, hook, 15, TEXT, bold=True)
        T(d, 528, y + 13, 160, pat, 14, MUTED)
        if guard:
            if gtop is None:
                gtop = y
            gbot = y + RH
    GX, GW = 800, 300
    d.rect(GX, gtop, GW, gbot - gtop, fill=ACCENT_SURFACE, stroke=ACCENT, r=12, sw=1.2)
    cy = (gtop + gbot) / 2
    T(d, GX + 12, cy - 70, GW - 24, "useScopeGuard", 18, TEXT, bold=True, align="center", step=24)
    T(d, GX + 12, cy - 30, GW - 24,
      "commit の時点で世代を進める\n古い描画の関数からの開始を拒否\n古い応答を捨てる", S_SUB, TEXT, align="center", step=28)
    for k, (_, _, _, _, guard) in enumerate(rows):
        if guard:
            yy = Y0 + k * P + RH / 2
            edge(d, [(TW + 6, yy), (GX - 6, yy)])
    ny = Y0 + len(rows) * P + 14
    d.rect(0, ny, GX + GW, 84, fill=SURFACE, r=12)
    T(d, 24, ny + 14, GX + GW - 48,
      "製品の責務：サーバーでの順序（直列化、版）、冪等性、競合の検出、要求ごとの認可、結果の照会", 16, TEXT, bold=True)
    T(d, 24, ny + 46, GX + GW - 48,
      "クライアントでの応答の順序の制御は、サーバーでの保存の順序を保証しない", S_SUB, MUTED)
    d.save("pi-shared-state")


# ---------------------------------------------------------------- 4 スコープ変更と非同期処理
def scope_async():
    d = D()
    W, G = 210, 45
    H = hh(1)
    steps = [
        ("描画（A）", "現在のスコープ", False),
        ("描画（B）", "commit されない場合がある", False),
        ("commit（B）", "画面に反映される", False),
        ("layout effect", "世代 +1、前の待機を中止", True),
        ("passive effect", "購読、取得の開始", False),
    ]
    y0 = 20
    d.text(0, 0, 200, 20, "時間", S_LABEL, MUTED, bold=True)
    for k, (t, s, hi) in enumerate(steps):
        x = k * (W + G)
        state(d, x, y0, W, H, t, [s], fill=ACCENT_SURFACE if hi else SURFACE, stroke=ACCENT if hi else "none")
        if k:
            edge(d, [(x - G + 6, y0 + H / 2), (x - 6, y0 + H / 2)])
    # 描画の中の規則
    nx = W + G
    ny = y0 + H + 40
    edge(d, [(nx + W / 2, y0 + H + 6), (nx + W / 2, ny - 6)], arrow=False, dashed=True)
    d.rect(nx - 20, ny, 3 * W + 2 * G - 20 + 20 - W // 2 - 20, 56, fill=SURFACE, r=12)
    T(d, nx - 4, ny + 17, 3 * W + G, "新しいスコープの最初の描画から、前のスコープの値と状態を返さない", S_SUB, TEXT, bold=True)
    # 2 本のレーン
    lanes = [
        ("古い応答", [("A で始めた処理の応答", ["B の commit の後に届く"]),
                  ("世代で照合", ["commit された世代と比べる"]),
                  ("捨てる", ["状態に反映しない"])],
         ["届く", "一致しない"]),
        ("古い操作の開始", [("A の画面・Toast・Dialog の関数", ["Snapshot を持つ"]),
                    ("Snapshot／描画の世代で照合", ["現在の世代と比べる"]),
                    ("拒否する", ["現在の処理を無効にしない"])],
         ["開始を要求", "一致しない"]),
    ]
    LW, LG = 280, 130
    ly = ny + 56 + 50
    for k, (name, boxes, labs) in enumerate(lanes):
        y = ly + k * (H + 70)
        d.text(0, y - 30, 300, 20, name, S_LABEL, MUTED, bold=True)
        for j, (t, s) in enumerate(boxes):
            x = j * (LW + LG)
            last = j == 2
            state(d, x, y, LW, H, t, s, fill=SURFACE, stroke="none")
            if j:
                edge(d, [(x - LG + 6, y + H / 2), (x - 6, y + H / 2)])
                alabel(d, x - LG / 2, y + H / 2 - 26, LG, labs[j - 1])
    by = ly + 2 * (H + 70) - 20
    d.rect(0, by, 5 * W + 4 * G, 82, fill=SURFACE, r=12)
    T(d, 24, by + 14, 5 * W + 4 * G - 48,
      "A → B → A：scopeKey は同じ A でも、世代は別。最初の A の結果と関数は、最後の A では受け付けない", 16, TEXT, bold=True)
    T(d, 24, by + 46, 5 * W + 4 * G - 48,
      "世代は、スコープの変更が commit されるたびに進む。描画の途中では進めない（破棄された描画が、表示中の処理を中止しないため）",
      S_SUB, MUTED)
    d.save("pi-scope-async")


# ---------------------------------------------------------------- 5 保存結果不明の処理
def unknown_result():
    d = D()
    names = ["成功", "確定した失敗", "入力の拒否（invalid）", "権限不足（forbidden）", "競合（conflict）", "部分成功"]
    CX, CW = 190, 280
    y0 = 36
    d.text(CX, 0, CW, 20, "結果の分類", S_LABEL, MUTED, bold=True)
    ph = 46
    pitch = 56
    ys = []
    for k, n in enumerate(names):
        y = y0 + k * pitch
        state(d, CX, y, CW, ph, n)
        ys.append(y + ph / 2)
    uy = y0 + len(names) * pitch
    uh = hh(2)
    state(d, CX, uy, CW, uh, "結果不明", ["通信の例外、AbortError", "分類できない応答"],
          fill=ACCENT_SURFACE, stroke=ACCENT)
    ys.append(uy + uh / 2)
    # 要求
    rw = 130
    midy = (ys[0] + ys[-1]) / 2
    state(d, 0, midy - 26, rw, 52, "要求を送る")
    tx = rw + 28
    edge(d, [(rw + 4, midy), (tx, midy)], arrow=False)
    edge(d, [(tx, ys[0]), (tx, ys[-1])], arrow=False)
    for yy in ys:
        edge(d, [(tx, yy), (CX - 6, yy)])
    # 結果不明の先
    ucy = ys[-1]
    X2, W2 = CX + CW + 50, 190
    state(d, X2, ucy - 26, W2, 52, "自動で再実行しない")
    edge(d, [(CX + CW + 6, ucy), (X2 - 6, ucy)])
    X3, W3 = X2 + W2 + 50, 240
    state(d, X3, ucy - hh(1) / 2, W3, hh(1), "状態を確認", ["現在の認可で照会"])
    edge(d, [(X2 + W2 + 6, ucy), (X3 - 6, ucy)])
    X4, W4 = X3 + W3 + 50, 300
    outs = [("保存されていた", []), ("保存されていなかった", ["もう一度保存できる"]), ("確認できない", ["不明のまま"])]
    hs = [hh(len(s)) if s else 52 for _, s in outs]
    gapo = 14
    tot = sum(hs) + gapo * 2
    oy = ucy - tot / 2
    ty = oy
    for (t, s), h in zip(outs, hs):
        state(d, X4, ty, W4, h, t, s)
        edge(d, [(X3 + W3 + 28, ucy), (X3 + W3 + 28, ty + h / 2), (X4 - 6, ty + h / 2)] if False else
             [(X3 + W3 + 25, ty + h / 2), (X4 - 6, ty + h / 2)])
        ty += h + gapo
    edge(d, [(X3 + W3 + 6, ucy), (X3 + W3 + 25, ucy)], arrow=False)
    edge(d, [(X3 + W3 + 25, oy + hs[0] / 2), (X3 + W3 + 25, oy + tot - hs[2] / 2)], arrow=False)
    # 注意の 3 つ
    nx = CX + CW + 50
    nw = X4 + W4 - nx
    notes = [
        "AbortError はサーバーで処理されなかったことを意味しない",
        "接続の回復で、更新の処理を送り直さない（安全な取得だけを再開する）",
        "再処理は確定した失敗だけ",
    ]
    d.text(nx, 0, 300, 20, "注意", S_LABEL, MUTED, bold=True)
    for k, t in enumerate(notes):
        yy = y0 + k * 60
        d.rect(nx, yy, nw, 46, fill=SURFACE, r=10, sw=1.2)
        T(d, nx + 20, yy + 13, nw - 40, t, S_SUB, TEXT, bold=True)
    d.save("pi-unknown-result")


# ---------------------------------------------------------------- 6 Data Browsing と Forms & Workflows の接続
def browse_forms():
    d = D()
    BW, G = 200, 50
    stages = [
        ("検索・フィルター", ["Search & Filter"]),
        ("一覧", ["List & Detail"]),
        ("詳細", ["Sheet／専用の画面", "List & Detail"]),
        ("編集", ["Create & Edit"]),
        ("保存", ["Create & Edit"]),
    ]
    gy = 0
    gx = 3 * (BW + G) - 40
    gw = 2 * BW + G + 40
    gh = 124
    d.rect(gx, gy, gw, gh, fill=SURFACE, r=12, sw=1.2)
    T(d, gx + 16, gy + 12, gw - 32, "Unsaved Changes：離れる前の確認", 16, TEXT, bold=True)
    T(d, gx + 16, gy + 44, gw - 32, "確認する：Sidebar、Breadcrumb、戻る、通知、Command からの移動", 14, MUTED, step=20)
    T(d, gx + 16, gy + 68, gw - 32, "確認しない：認可の失効、別のアカウント（releaseAll）", 14, MUTED, step=20)
    row_cy = gh + 90
    H2 = hh(2)
    for k, (t, s) in enumerate(stages):
        x = k * (BW + G)
        h = hh(len(s))
        hi = k == 3
        state(d, x, row_cy - h / 2, BW, h, t, s, fill=ACCENT_SURFACE if hi else SURFACE, stroke=ACCENT if hi else "none")
        if k:
            edge(d, [(x - G + 6, row_cy), (x - 6, row_cy)])
    ex = 3 * (BW + G) + BW / 2
    edge(d, [(ex, row_cy - H2 / 2 - 6), (ex, gy + gh + 6)], dashed=True)
    alabel(d, ex + 54, gy + gh + 14, 100, "離れるとき", align="left")
    # 戻る
    ly = row_cy + H2 / 2 + 54
    c2 = 1 * (BW + G) + BW / 2
    c5 = 4 * (BW + G) + BW / 2
    edge(d, [(c5, row_cy + hh(1) / 2 + 6), (c5, ly), (c2, ly), (c2, row_cy + hh(1) / 2 + 6)])
    T(d, c2 + 20, ly + 12, c5 - c2 - 40, "一覧へ戻る", 16, TEXT, bold=True, align="center", step=24)
    T(d, c2 + 20, ly + 38, c5 - c2 - 40, "復元：条件、ページ、並び順、表示形式、ID の選択、スクロール、フォーカス",
      S_SUB, MUTED, align="center")
    cy0 = ly + 86
    cw = c5 + BW / 2
    conds = [
        "戻る操作のときだけ復元。Sidebar から開くと新しい一覧",
        "記録のスコープ（ワークスペース）が一致する場合だけ",
        "保存で条件から外れた行は復元しない（同じ位置の行へ）",
        "利用者が操作したら復元を取りやめる",
    ]
    d.text(0, cy0, 300, 20, "復元の条件", S_LABEL, MUTED, bold=True)
    for k, t in enumerate(conds):
        yy = cy0 + 32 + k * 52
        d.rect(0, yy, cw, 42, fill=SURFACE, r=10, sw=1.2)
        num(d, str(k + 1), 30, yy + 21)
        T(d, 58, yy + 11, cw - 80, t, S_SUB, TEXT)
    d.save("pi-browse-forms")


# ---------------------------------------------------------------- 7 Data Analysis から業務操作への接続
def analysis_ops():
    d = D()
    BW, G = 205, 45
    stages = [
        ("Dashboard", ["指標（Metric Overview）"]),
        ("Drill-down", ["Data Analysis"]),
        ("明細の一覧", ["List & Detail"]),
        ("対象のレコード", ["List & Detail"]),
        ("編集", ["Unsaved Changes"]),
    ]
    descs = {
        1: "実際に集計した期間と条件を渡す\n表示の文字から作り直さない",
        2: "グローバル条件 ∩ 個別条件\n∩ スコープ",
    }
    y0 = 0
    H = hh(1)
    for k, (t, s) in enumerate(stages):
        x = k * (BW + G)
        state(d, x, y0, BW, H, t, s, fill=ACCENT_SURFACE if k == 4 else SURFACE, stroke=ACCENT if k == 4 else "none")
        if k:
            edge(d, [(x - G + 6, y0 + H / 2), (x - 6, y0 + H / 2)])
        if k in descs:
            T(d, x - 25, y0 + H + 14, BW + 50, descs[k], S_SUB, MUTED, align="center", step=22)
    c1 = BW / 2
    c5 = 4 * (BW + G) + BW / 2
    ly = y0 + H + 100
    edge(d, [(c5, y0 + H + 6), (c5, ly), (c1, ly), (c1, y0 + H + 6)])
    T(d, c1 + 20, ly + 12, c5 - c1 - 40, "元の分析へ戻る", 16, TEXT, bold=True, align="center", step=24)
    T(d, c1 + 20, ly + 38, c5 - c1 - 40, "復元：条件、選んだ系列、スクロール、フォーカス", S_SUB, MUTED, align="center")
    by = ly + 92
    tw = c5 + BW / 2
    d.rect(0, by, tw, 84, fill=SURFACE, r=12)
    T(d, 24, by + 14, tw - 48, "集計値の閲覧・明細の閲覧・全件の件数・Drill-down は別の権限", 16, TEXT, bold=True)
    T(d, 24, by + 46, tw - 48, "UI で隠すだけでは保護にならない（製品の責務）", S_SUB, MUTED)
    d.save("pi-analysis-ops")


for f in (patterns, pattern_usage, shared_state, scope_async, unknown_result, browse_forms, analysis_ops):
    f()
print("ok patterns-integration")
