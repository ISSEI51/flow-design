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
#   - コマンドは子プロセスで実行する。ロックの記述子は close-on-exec のため、子プロセス（npm、Playwright、Vite）には
#     引き継がない。子プロセスが残っても、このプロセスの終了でロックは解放される。
#   - INT、TERM、HUP を受け取ったら子プロセスに同じシグナルを送り、子プロセスの終了を待ってから解放する。
#   - 待機の上限を超えたら、コマンドを実行せずに終了コード 75（EX_TEMPFAIL）で終わる。
#   - 協調的なロックである。このスクリプトを使わない検品（直接の npx playwright test など）は止められない。
use strict;
use warnings;
use Fcntl qw(:flock O_RDWR O_CREAT);
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

my $child = fork();
die "fork failed: $!\n" unless defined $child;
if ($child == 0) {
  $ENV{FLOW_VERIFY_LOCK_HELD} = $lockfile;
  exec { $cmd[0] } @cmd or do { print STDERR "exec failed: $!\n"; POSIX::_exit(127) };
}

my $forwarded = '';
for my $sig (qw(INT TERM HUP)) {
  $SIG{$sig} = sub { $forwarded = $sig; kill $sig => $child };
}
my $status;
while (1) {
  my $r = waitpid($child, 0);
  if ($r == $child) { $status = $?; last }
  last if $r == -1;
}
$status //= 1 << 8;
my $code = WIFEXITED($status) ? WEXITSTATUS($status) : 128 + WTERMSIG($status);

# 所有者の記録は、ロックを持っている間に消す（次の所有者の記録を消さないため）
unlink "$lockfile.owner";
event(sprintf('lock released %s pid=%d exit=%d%s', $lockfile, $$, $code, $forwarded ? " signal=$forwarded" : ''));
flock($fh, LOCK_UN);
close $fh;
exit $code;
