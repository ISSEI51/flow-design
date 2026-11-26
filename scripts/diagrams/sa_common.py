"""Shared drawing helpers for the System & Account diagrams (sa_*.py).

The visual vocabulary (colors, sizes, D) comes from gen.py, as in gen_data_browsing.py.
Each sa_*.py module imports these helpers, defines its diagrams and saves them when imported.
Run one module directly to regenerate only its diagrams:
    python3 -I scripts/diagrams/sa_authentication.py docs/diagrams
"""
import os
import sys

sys.dont_write_bytecode = True  # import gen で __pycache__ を作らない
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import gen  # noqa: E402,F401  (gen を読み込むと gen.py の図も書き出す。出力は決定的)
from gen import (  # noqa: E402,F401
    ACCENT, ACCENT_SURFACE, BAR, BAR_STRONG, LINE, MUTED, S_LABEL, S_NAME, S_NUM, S_SUB, SURFACE, TEXT, D,
    SUCCESS_C, WARNING_C, INFO_C, DANGER,
)

WHITE = "light-dark(#FFFFFF,#0D1117)"  # 図の中の画面の面


def est(s, size, bold=False):
    """文字列の概算幅（全角は 1em、半角は 0.56em）。はみ出しの検査にだけ使う。"""
    k = 0.6 if bold else 0.56
    return sum(size if ord(c) > 0x2E7F else size * k for c in s)


def T(d, x, y, w, text, size=S_SUB, color=MUTED, bold=False, align="left", step=22):
    """複数行のテキスト。行の幅が w を超える場合は警告する。"""
    for k, ln in enumerate(text.split("\n")):
        if est(ln, size, bold) > w:
            print(f"WARN width {est(ln, size, bold):.0f}>{w}: {ln}", file=sys.stderr)
        d.text(x, y + k * step, w, 20, ln, size, color, bold=bold, align=align)


def num(d, n, x, y):
    """丸数字（中心が x, y）"""
    d.dot(x, y, d=24, fill=ACCENT_SURFACE, stroke=ACCENT)
    d.text(x - 12, y - 12, 24, 24, n, 14, ACCENT, bold=True, align="center", valign="middle")


def hh(n):
    """タイトル 1 行 + 補足 n 行の状態ボックスの高さ"""
    return 52 if n == 0 else 22 * n + 54


def state(d, x, y, w, h, title, subs=(), fill=SURFACE, stroke="none", dashed=False, tsize=16, tcolor=TEXT):
    """タイトルと補足の行を中央にそろえた、状態や段階のボックス"""
    d.rect(x, y, w, h, fill=fill, stroke=stroke, r=12, dashed=dashed, sw=1.2)
    total = 24 + 22 * len(subs)
    y0 = y + (h - total) / 2
    T(d, x + 8, y0, w - 16, title, tsize, tcolor, bold=True, align="center", step=24)
    for k, s in enumerate(subs):
        T(d, x + 8, y0 + 26 + k * 22, w - 16, s, S_SUB, MUTED, align="center")


def alabel(d, cx, y, w, text, color=MUTED, size=14, align="center"):
    """矢印のラベル（中心が cx）"""
    T(d, cx - w / 2, y, w, text, size, color, align=align, step=19)


def checkbox(d, x, y, checked=False, s=14):
    if checked:
        d.rect(x, y, s, s, fill=ACCENT, r=3)
        d.line([(x + 3, y + 7), (x + 6, y + 10), (x + 11, y + 4)], color=WHITE, arrow=False, sw=1.5)
    else:
        d.rect(x, y, s, s, fill="none", stroke=BAR_STRONG, r=3, sw=1)


def field(d, x, y, w, h, label=None, chevron=False, color=MUTED, size=14):
    """入力欄"""
    d.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=8, sw=1)
    if label:
        if est(label, size) > w - 24:
            print(f"WARN field {label}", file=sys.stderr)
        d.text(x + 12, y, w - 24, h, label, size, color, valign="middle")
    if chevron:
        cx, cy = x + w - 18, y + h / 2
        d.line([(cx - 5, cy - 2), (cx, cy + 3), (cx + 5, cy - 2)], color=BAR_STRONG, arrow=False, sw=1.2)


def button(d, x, y, w, h, label, primary=True, size=14):
    """ボタン。primary は塗り、それ以外は枠"""
    if primary:
        d.rect(x, y, w, h, fill=ACCENT, r=8)
        d.text(x, y, w, h, label, size, WHITE, bold=True, align="center", valign="middle")
    else:
        d.rect(x, y, w, h, fill=WHITE, stroke=LINE, r=8, sw=1)
        d.text(x, y, w, h, label, size, TEXT, align="center", valign="middle")


def toggle(d, x, y, on=True, w=34, h=20):
    """Switch"""
    d.rect(x, y, w, h, fill=ACCENT if on else BAR, r=h / 2)
    cx = x + w - h / 2 if on else x + h / 2
    d.dot(cx, y + h / 2, d=h - 6, fill=WHITE, stroke=WHITE)
