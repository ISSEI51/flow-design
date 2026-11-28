#!/usr/bin/env bash
# 全件検品を 2 回続けて実行し、結果を機械で読める形（summary.jsonl、env.json）で残す。
#
# 使い方（検品する worktree の中で）:
#   scripts/verify/full-pair.sh <出力先のディレクトリ> <PREVIEW_TEST_PORT>
#   例: scripts/verify/full-pair.sh /tmp/verify-$(git rev-parse --short HEAD) 5342
#   Node.js の版を変えるときは、PATH の先頭にその版の bin を置いて呼ぶ（env.json に記録される）。
#
# 方式:
#   - 1 回 = typecheck → preview:build → test:tokens → test:ssr → test:patterns → test:components
#   - Playwright は 3 ワーカー。PREVIEW_TEST_PORT は worktree ごとに分ける。開始前にポートが空いていることを確かめる
#   - 排他ロック：同じリポジトリのすべての worktree が共有するロック（git common directory の
#     flow-design-verify.lock）を、2 回の実行の全体で持つ。取得は scripts/verify/lock.pl（flock(2)）。
#     ほかの worktree の full-pair.sh が実行中なら、終わるまで待つ（上限は FLOW_VERIFY_LOCK_TIMEOUT 秒。既定 3 時間）。
#     協調的なロックのため、このスクリプトを使わない検品は止められない。その分は下の「ほかの Playwright」の待機で補う
#   - 各回の前に、電源の接続（macOS の AC Power）と、ほかの worktree の Playwright の実行がないことを確かめる。
#     条件を満たすまで 20 秒ごとに待つ（ほかのプロセスは終了しない。ほかのリポジトリの検品も止めない）
#   - スリープの防止：macOS では caffeinate -i -s -w <このプロセス> を起動する（-s は電源の接続中だけ有効）
#   - 実行の前後の HEAD と作業ツリーの変更の有無を記録する（検品中に編集していないことの確認）
#   - Vite の標準出力は、playwright.config.ts の webServer.stdout: "pipe" で各段階のログに残る。
#     HMR の更新、再読み込み、依存の再最適化の件数を summary.jsonl に記録する
#   - SSR の検品が起動する Vite（middlewareMode）は、WebSocket を起動しない（ws: false。preview/tests/ssr-server.ts）。
#     キャッシュは spec と project ごとに分ける
#   - 検品の開発サーバーのキャッシュは node_modules/.vite-test（手動の preview:dev の node_modules/.vite と分ける）
#
# 出力:
#   <出力先>/summary.jsonl  1 段階 1 行（run、step、exit、開始・終了の時刻、秒、head、detail）
#                           detail は scripts/verify/summarize-log.mjs の出力（counts、pageErrors、vite、anomalies）
#   <出力先>/env.json       OS、Node.js、npm、Vite、Playwright、ブラウザの版、ワーカーの数、ポート
#   <出力先>/events.log     ロックの取得・解放、各回の開始・終了（HEAD、変更の有無、負荷、電源）、待機の理由
#   <出力先>/run<回>-<段階>.log  各段階の出力
#
# 判定: summary.jsonl の 12 行がすべて exit 0 で、counts に failed と flaky がなく、pageErrors の unexplained と
#       consoleProduct が 0、anomalies がすべて 0、events.log の各回の終了で same-head=yes かつ dirty=0 であること。
set -u
if [ $# -ne 2 ]; then
  echo "usage: $0 <output-dir> <PREVIEW_TEST_PORT>" >&2
  exit 2
fi
REPO=$(git rev-parse --show-toplevel) || exit 2
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$1"
OUT=$(cd "$1" && pwd)
PORT=$2
WORKERS=3

# 排他ロック（2 回の実行の全体で 1 回取る）
if [ -z "${FLOW_VERIFY_LOCK_HELD:-}" ]; then
  COMMON=$(cd "$REPO" && cd "$(git rev-parse --git-common-dir)" && pwd) || exit 2
  exec /usr/bin/perl "$SCRIPT_DIR/lock.pl" "$COMMON/flow-design-verify.lock" "${FLOW_VERIFY_LOCK_TIMEOUT:-10800}" \
    "$OUT/events.log" -- /usr/bin/env bash "$SCRIPT_DIR/full-pair.sh" "$OUT" "$PORT"
fi

export PREVIEW_TEST_PORT=$PORT
cd "$REPO" || exit 2
log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$OUT/events.log"; }
is_macos() { [ "$(uname -s)" = Darwin ]; }

# スリープの防止（このスクリプトの終了で caffeinate も終わる）
if is_macos && command -v caffeinate > /dev/null; then
  caffeinate -i -s -w $$ &
  log "caffeinate started pid=$!"
fi

# ほかの worktree の Playwright の実行（この worktree のものを除く）
others() { ps -axo pid=,command= | grep -E "playwright(\.js)? test" | grep -v grep | grep -v "$REPO/" ; }
dirty() { git status --porcelain | grep -v '^?? node_modules$' | wc -l | tr -d ' '; }
power() { if is_macos; then pmset -g batt | head -1 | sed "s/Now drawing from //"; else echo n/a; fi; }
on_ac() { if is_macos; then pmset -g batt | head -1 | grep -q "AC Power"; else return 0; fi; }
port_busy() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t > /dev/null 2>&1; }
wait_ready() {
  local quiet=0
  while :; do
    local ac=1 busy=0 portbusy=0
    on_ac || ac=0
    [ -n "$(others)" ] && busy=1
    port_busy && portbusy=1
    if [ $ac = 1 ] && [ $busy = 0 ] && [ $portbusy = 0 ]; then
      quiet=$((quiet + 1))
      [ $quiet -ge 3 ] && return
    else
      quiet=0
      log "waiting: ac=$ac other-playwright=$busy port-busy=$portbusy $(others | awk '{print $1, $3}' | tr '\n' ';')"
    fi
    sleep 20
  done
}

# 実行環境の記録
browsers=$(node -e '
  const { chromium, webkit } = require("@playwright/test");
  (async () => {
    const out = {};
    for (const [n, t] of [["chromium", chromium], ["webkit", webkit]]) {
      try { const b = await t.launch(); out[n] = b.version(); await b.close() } catch (e) { out[n] = "error: " + e.message.split("\n")[0] }
    }
    process.stdout.write(JSON.stringify(out));
  })()' 2> /dev/null || echo '{}')
os=$(if is_macos; then echo "macOS $(sw_vers -productVersion) ($(uname -sr))"; else uname -sr; fi)
printf '{"os":"%s","arch":"%s","cpus":"%s","node":"%s","nodePath":"%s","npm":"%s","vite":"%s","playwright":"%s","browsers":%s,"workers":%d,"port":%d}\n' \
  "$os" "$(uname -m)" "$(getconf _NPROCESSORS_ONLN 2> /dev/null || echo '?')" "$(node -v)" "$(command -v node)" "$(npm -v)" \
  "$(node -p 'require("vite/package.json").version')" "$(node -p 'require("@playwright/test/package.json").version')" \
  "$browsers" "$WORKERS" "$PORT" > "$OUT/env.json"
log "env $(cat "$OUT/env.json")"

for r in 1 2; do
  wait_ready
  head=$(git rev-parse HEAD)
  log "run $r start head=$head dirty=$(dirty) load=$(sysctl -n vm.loadavg 2> /dev/null || cat /proc/loadavg 2> /dev/null) power=$(power)"
  for step in typecheck preview:build test:tokens test:ssr test:patterns test:components; do
    s=${step//:/_}
    start=$(date +%s)
    started=$(date '+%FT%T%z')
    case $step in
      test:ssr | test:patterns | test:components)
        npm run "$step" -- --workers=$WORKERS --output="$OUT/results-run$r-$s" > "$OUT/run$r-$s.log" 2>&1 ;;
      *)
        npm run "$step" > "$OUT/run$r-$s.log" 2>&1 ;;
    esac
    code=$?
    detail=$(node "$SCRIPT_DIR/summarize-log.mjs" "$OUT/run$r-$s.log" 2> /dev/null || echo '{}')
    printf '{"run":%d,"step":"%s","exit":%d,"started":"%s","ended":"%s","seconds":%d,"head":"%s","detail":%s}\n' \
      "$r" "$step" "$code" "$started" "$(date '+%FT%T%z')" "$(($(date +%s) - start))" "$(git rev-parse --short HEAD)" "$detail" >> "$OUT/summary.jsonl"
  done
  after=$(git rev-parse HEAD)
  log "run $r end head=$after dirty=$(dirty) same-head=$([ "$head" = "$after" ] && echo yes || echo no) power=$(power)"
done
