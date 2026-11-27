#!/usr/bin/env bash
# 全件検品を 2 回続けて実行し、結果を機械で読める形（summary.jsonl）で残す。
#
# 使い方（検品する worktree の中で）:
#   caffeinate -i -s scripts/verify/full-pair.sh <出力先のディレクトリ> <PREVIEW_TEST_PORT>
#   例: caffeinate -i -s scripts/verify/full-pair.sh /tmp/verify-$(git rev-parse --short HEAD) 5342
#
# 方式:
#   - 1 回 = typecheck → preview:build → test:tokens → test:ssr → test:patterns → test:components
#   - Playwright は 3 ワーカー。PREVIEW_TEST_PORT は worktree ごとに分ける
#   - テストの成果物（--output）は、回と段階ごとに <出力先>/results-run<回>-<段階> に分ける
#   - 各回の前に、電源の接続（AC Power）と、ほかの worktree の Playwright の実行がないことを確かめる。
#     条件を満たすまで 20 秒ごとに待つ（ほかのプロセスは終了しない）
#   - 実行の前後の HEAD と作業ツリーの変更の有無を記録する（検品中に編集していないことの確認）
#   - Vite の標準出力は、playwright.config.ts の webServer.stdout: "pipe" で各段階のログに残る
#   - スリープの防止は、呼び出す側の caffeinate -i -s で行う（-s は電源の接続中だけ有効）
#
# 出力:
#   <出力先>/summary.jsonl  1 段階 1 行（run、step、exit、seconds、head、counts）
#   <出力先>/events.log     各回の開始・終了（HEAD、変更の有無、負荷、電源）と待機の理由
#   <出力先>/run<回>-<段階>.log  各段階の出力
#
# 判定: summary.jsonl の 12 行がすべて exit 0 で、counts に failed と flaky がないこと。
set -u
if [ $# -ne 2 ]; then
  echo "usage: $0 <output-dir> <PREVIEW_TEST_PORT>" >&2
  exit 2
fi
REPO=$(git rev-parse --show-toplevel) || exit 2
OUT=$1
export PREVIEW_TEST_PORT=$2
mkdir -p "$OUT"
cd "$REPO" || exit 2
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$OUT/events.log"; }
# ほかの worktree の Playwright の実行（この worktree のものを除く）
others() { ps -axo pid=,command= | grep -E "playwright(\.js)? test" | grep -v grep | grep -v "$REPO/" ; }
dirty() { git status --porcelain | grep -v '^?? node_modules$' | wc -l | tr -d ' '; }
power() { pmset -g batt | head -1 | sed "s/Now drawing from //"; }
wait_ready() {
  local quiet=0
  while :; do
    local ac=1 busy=0
    pmset -g batt | head -1 | grep -q "AC Power" || ac=0
    [ -n "$(others)" ] && busy=1
    if [ $ac = 1 ] && [ $busy = 0 ]; then
      quiet=$((quiet + 1))
      [ $quiet -ge 3 ] && return
    else
      quiet=0
      log "waiting: ac=$ac other-playwright=$busy $(others | awk '{print $1, $3}' | tr '\n' ';')"
    fi
    sleep 20
  done
}
for r in 1 2; do
  wait_ready
  head=$(git rev-parse HEAD)
  log "run $r start head=$head dirty=$(dirty) load=$(sysctl -n vm.loadavg) power=$(power)"
  for step in typecheck preview:build test:tokens test:ssr test:patterns test:components; do
    s=${step//:/_}
    start=$(date +%s)
    case $step in
      test:ssr | test:patterns | test:components)
        npm run "$step" -- --workers=3 --output="$OUT/results-run$r-$s" > "$OUT/run$r-$s.log" 2>&1 ;;
      *)
        npm run "$step" > "$OUT/run$r-$s.log" 2>&1 ;;
    esac
    code=$?
    counts=$(grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped|did not run)' "$OUT/run$r-$s.log" | tr -s ' ' | sed 's/^ //' | tr '\n' ',' | sed 's/,$//')
    printf '{"run":%d,"step":"%s","exit":%d,"seconds":%d,"head":"%s","counts":"%s"}\n' \
      "$r" "$step" "$code" "$(($(date +%s) - start))" "$(git rev-parse --short HEAD)" "$counts" >> "$OUT/summary.jsonl"
  done
  after=$(git rev-parse HEAD)
  log "run $r end head=$after dirty=$(dirty) same-head=$([ "$head" = "$after" ] && echo yes || echo no) power=$(power)"
done
