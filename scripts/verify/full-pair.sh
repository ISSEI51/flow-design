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
#   <出力先>/verdict.json   判定（pass か fail と、その理由）。fail の場合、このスクリプトは終了コード 1 で終わる
#
# 判定: summary.jsonl の 12 行がすべて exit 0 で、counts に failed、flaky、interrupted、didNotRun がなく、pageErrors の
#       unexplained と consoleProduct が 0、anomalies がすべて 0、各回の終了で same-head=yes かつ dirty=0 であること。
# 出力先は空のディレクトリにする（前回の記録が残っていると、判定を取り違えるため。空でなければ開始しない）。
set -u
if [ $# -ne 2 ]; then
  echo "usage: $0 <output-dir> <PREVIEW_TEST_PORT>" >&2
  exit 2
fi
REPO=$(git rev-parse --show-toplevel) || exit 2
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
if [ -z "${FLOW_VERIFY_LOCK_HELD:-}" ] && [ -d "$1" ] && [ -n "$(ls -A "$1" 2> /dev/null)" ]; then
  echo "output directory is not empty: $1" >&2
  exit 2
fi
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

# ほかの worktree の Playwright の実行（この worktree の node_modules から起動したものを除く。
# worktree が本体のリポジトリの下にある構成でも、ほかの worktree の実行を検出する）
others() { ps -axo pid=,command= | grep -E "playwright(\.js)? test" | grep -v grep | grep -v "$REPO/node_modules/" ; }
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
# JSON は node で作る（値のエスケープ）。node の配布区分（process.release.lts。LTS でない版は null）も記録する
OS_TEXT=$(if is_macos; then echo "macOS $(sw_vers -productVersion) ($(uname -sr))"; else uname -sr; fi) \
  BROWSERS="$browsers" WORKERS=$WORKERS PORT=$PORT node -e '
    const { execSync } = require("node:child_process");
    const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim() } catch { return null } };
    let browsers = {}; try { browsers = JSON.parse(process.env.BROWSERS) } catch {}
    const out = {
      os: process.env.OS_TEXT, arch: process.arch, cpus: require("node:os").cpus().length,
      node: process.version, nodeLts: process.release.lts ?? null, nodePath: process.execPath,
      npm: sh("npm -v"), vite: require("vite/package.json").version, playwright: require("@playwright/test/package.json").version,
      browsers, workers: Number(process.env.WORKERS), port: Number(process.env.PORT),
    };
    process.stdout.write(JSON.stringify(out) + "\n");' > "$OUT/env.json"
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
  printf '{"run":%d,"sameHead":%s,"dirty":%d}\n' "$r" "$([ "$head" = "$after" ] && echo true || echo false)" "$(dirty)" >> "$OUT/runs.jsonl"
done

# 判定
node -e '
  const fs = require("node:fs");
  const out = process.argv[1];
  const lines = fs.readFileSync(out + "/summary.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const runs = fs.readFileSync(out + "/runs.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const reasons = [];
  if (lines.length !== 12) reasons.push(`steps: ${lines.length} (expected 12)`);
  for (const l of lines) {
    const d = l.detail ?? {};
    const c = d.counts ?? {};
    const where = `run ${l.run} ${l.step}`;
    if (l.exit !== 0) reasons.push(`${where}: exit ${l.exit}`);
    for (const k of ["failed", "flaky", "interrupted", "didNotRun"]) if (c[k]) reasons.push(`${where}: ${k} ${c[k]}`);
    if (d.pageErrors?.unexplained) reasons.push(`${where}: unexplained page errors ${d.pageErrors.unexplained}`);
    if (d.pageErrors?.consoleProduct) reasons.push(`${where}: product console errors ${d.pageErrors.consoleProduct}`);
    for (const [k, v] of Object.entries(d.anomalies ?? {})) if (v) reasons.push(`${where}: ${k} ${v}`);
  }
  for (const r of runs) {
    if (!r.sameHead) reasons.push(`run ${r.run}: HEAD changed during the run`);
    if (r.dirty) reasons.push(`run ${r.run}: working tree changed (${r.dirty} entries)`);
  }
  const verdict = { verdict: reasons.length ? "fail" : "pass", reasons };
  fs.writeFileSync(out + "/verdict.json", JSON.stringify(verdict) + "\n");
  process.stdout.write(JSON.stringify(verdict) + "\n");
  process.exit(reasons.length ? 1 : 0);
' "$OUT"
code=$?
log "verdict exit=$code $(cat "$OUT/verdict.json" 2> /dev/null)"
exit $code
