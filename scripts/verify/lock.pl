#!/usr/bin/perl
# 同じリポジトリの worktree の間で共有する排他ロックを取ってから、コマンドを実行する。
#
# 使い方: lock.pl <ロックのファイル> <待機の上限（秒）> <記録のファイル> -- <コマンド> [引数...]
#
# 方式:
#   - ロックはカーネルの flock(2)（LOCK_EX）。ロックを持つのは、このプロセスが開いたファイルの記述子である。
#     プロセスが終わると（正常終了、異常終了、kill -9 を含む）、カーネルがロックを解放する。
#     そのため、古いロックを消す処理、PID の再利用の判定、他人のロックを誤って消すことは起きない。
#   - ロックのファイル自体は消さない（消すと、別のプロセスが同じパスに新しいファイルを作り、二重に取得できる）。
#   - 所有者の情報（PID、開始時刻、worktree、ホスト、コマンド）は <ロックのファイル>.owner に書く。
#     診断のための情報で、ロックの判定には使わない。
#   - コマンドは子プロセスで、別のプロセスグループとして実行する。ロックの記述子は子プロセス（npm、Playwright、Vite）にも
#     引き継ぐ（close-on-exec を外す）。このプロセスが kill -9 で終わっても、検品のプロセスが 1 つでも残っている間は
#     ロックが解放されない（ロックを持つ記述子を、残ったプロセスも開いているため）。
#   - INT、TERM、HUP を受け取ったら、子のプロセスグループ全体に同じシグナルを送る。
#   - 子が終わった後、同じプロセスグループに残ったプロセス（終了していない Vite など）に TERM を送り、最大 30 秒待つ。
#     残っていれば KILL を送る。グループのプロセスがなくなってから解放する。
#   - 端末の Ctrl+C（INT）は、このプロセスが受け取り、子のプロセスグループへ送る（子は別のグループのため直接は受け取らない）。
#   - 待機の上限を超えたら、コマンドを実行せずに終了コード 75（EX_TEMPFAIL）で終わる。
#   - 協調的なロックである。このスクリプトを使わない検品（直接の npx playwright test など）は止められない。
use strict;
use warnings;
use Fcntl qw(:flock O_RDWR O_CREAT F_GETFD F_SETFD FD_CLOEXEC);
use POSIX qw(strftime :sys_wait_h);
use Time::HiRes qw(time sleep);

my ($lockfile, $timeout, $events, $sep, @cmd) = @ARGV;
die "usage: lock.pl <lockfile> <timeout-seconds> <events-file> -- <command...>\n"
  unless defined $sep && $sep eq '--' && @cmd && $timeout =~ /^\d+$/;

sub stamp { strftime('%Y-%m-%d %H:%M:%S', localtime) }
sub event {
  my ($msg) = @_;
  open(my $e, '>>', $events) or return;
  print $e stamp() . " $msg\n";
  close $e;
}
sub owner_text {
  my $f = "$lockfile.owner";
  open(my $o, '<', $f) or return '(owner unknown)';
  local $/;
  my $t = <$o> // '';
  close $o;
  $t =~ s/\n/ /g;
  return $t;
}

sysopen(my $fh, $lockfile, O_RDWR | O_CREAT, 0644) or die "cannot open $lockfile: $!\n";
my $start = time;
my $last_note = 0;
until (flock($fh, LOCK_EX | LOCK_NB)) {
  my $waited = time - $start;
  if ($waited >= $timeout) {
    event("lock timeout after ${timeout}s; held by: " . owner_text());
    print STDERR "lock.pl: timed out after ${timeout}s waiting for $lockfile (held by: " . owner_text() . ")\n";
    exit 75;
  }
  if ($waited - $last_note >= 30 || $last_note == 0) {
    event(sprintf('lock waiting %ds; held by: %s', $waited, owner_text()));
    $last_note = $waited || 1;
  }
  sleep 2;
}

my $worktree = `git rev-parse --show-toplevel 2>/dev/null`;
chomp $worktree;
my $host = `hostname`;
chomp $host;
open(my $ow, '>', "$lockfile.owner") or die "cannot write owner: $!\n";
printf $ow "pid=%d started=%s host=%s worktree=%s command=%s\n", $$, stamp(), $host, $worktree, join(' ', @cmd);
close $ow;
event(sprintf('lock acquired %s pid=%d waited=%ds', $lockfile, $$, time - $start));

# ロックの記述子を子プロセスにも引き継ぐ
my $flags = fcntl($fh, F_GETFD, 0) or die "fcntl: $!\n";
fcntl($fh, F_SETFD, $flags & ~FD_CLOEXEC) or die "fcntl: $!\n";

my $child = fork();
die "fork failed: $!\n" unless defined $child;
if ($child == 0) {
  setpgrp(0, 0);
  $ENV{FLOW_VERIFY_LOCK_HELD} = $lockfile;
  exec { $cmd[0] } @cmd or do { print STDERR "exec failed: $!\n"; POSIX::_exit(127) };
}
# 子が exec する前にシグナルを送っても届くよう、親でもグループを設定する（どちらが先でも同じ結果）
setpgrp($child, $child);

my $forwarded = '';
for my $sig (qw(INT TERM HUP)) {
  $SIG{$sig} = sub { $forwarded = $sig; kill $sig => -$child };
}
my $status;
while (1) {
  my $r = waitpid($child, 0);
  if ($r == $child) { $status = $?; last }
  last if $r == -1;
}
$status //= 1 << 8;
my $code = WIFEXITED($status) ? WEXITSTATUS($status) : 128 + WTERMSIG($status);

# 同じプロセスグループに残ったプロセスを終わらせてから解放する
if (kill 0 => -$child) {
  event(sprintf('lock cleanup: processes left in group %d; sending TERM', $child));
  kill TERM => -$child;
  my $deadline = time + 30;
  sleep 0.5 while time < $deadline && kill 0 => -$child;
  if (kill 0 => -$child) {
    event(sprintf('lock cleanup: sending KILL to group %d', $child));
    kill KILL => -$child;
    sleep 0.5;
  }
}

# 所有者の記録は、ロックを持っている間に消す（次の所有者の記録を消さないため）
unlink "$lockfile.owner";
event(sprintf('lock released %s pid=%d exit=%d%s', $lockfile, $$, $code, $forwarded ? " signal=$forwarded" : ''));
flock($fh, LOCK_UN);
close $fh;
exit $code;
