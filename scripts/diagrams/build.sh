#!/usr/bin/env bash
# Regenerate .drawio sources and export light / dark SVGs.
# Usage: scripts/diagrams/build.sh [diagram ...]   (no argument: all diagrams)
# Requires the draw.io desktop app. Set DRAWIO to its CLI path if it is not the macOS default.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/docs/diagrams"
DRAWIO="${DRAWIO:-/Applications/draw.io.app/Contents/MacOS/draw.io}"
for g in gen.py gen_advanced.py gen_data_display.py gen_app_structure.py gen_data_browsing.py gen_data_analysis.py; do
  python3 -I "$ROOT/scripts/diagrams/$g" "$OUT"
done
if [ "$#" -eq 0 ]; then
  set -- $(cd "$OUT" && ls *.drawio | sed 's/\.drawio$//')
fi
for f in "$@"; do
  for t in light dark; do
    "$DRAWIO" -x -f svg --svg-theme "$t" -b 16 -o "$OUT/$f-$t.svg" "$OUT/$f.drawio" >/dev/null 2>&1
  done
  printf '%s %s\n' "$f" "$(grep -o 'width="[0-9]*px" height="[0-9]*px"' "$OUT/$f-light.svg" | head -1)"
done
