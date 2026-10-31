#!/bin/sh
# Run ON THE TV (via `sdb shell`). Starts, stops or checks the hbc-srv companion.
#
#   ./hbc-srv.sh start     start in the background (default)
#   ./hbc-srv.sh stop
#   ./hbc-srv.sh status
#   ./hbc-srv.sh run       run in the foreground and print everything
#   ./hbc-srv.sh log       show the last log lines
#
# Everything it needs is found automatically: the dotnet host, a writable data
# directory and a working globalization mode. Override with HBC_DOTNET,
# HBC_DATA_ROOT or HBC_PORT.

DIR=$(cd "$(dirname "$0")" && pwd)
PORT=${HBC_PORT:-2325}
CMD=${1:-start}

# ── a directory we can write to ────────────────────────────────────────────
STATE=""
for d in "${HBC_DATA_ROOT:-}" /opt/usr/home/hbc /opt/usr/home/owner/share/hbc \
         "${HOME:-/tmp}/hbc" /tmp/hbc; do
  [ -n "$d" ] || continue
  mkdir -p "$d" 2>/dev/null || continue
  if touch "$d/.w" 2>/dev/null; then rm -f "$d/.w"; STATE=$d; break; fi
done
[ -n "$STATE" ] || { echo "No writable directory found. Set HBC_DATA_ROOT." >&2; exit 1; }
LOG="$STATE/hbc-srv.out"
PIDFILE="$STATE/hbc-srv.pid"
export HBC_DATA_ROOT="$STATE"

# ── a dotnet host ──────────────────────────────────────────────────────────
find_dotnet() {
  [ -n "${HBC_DOTNET:-}" ] && [ -x "$HBC_DOTNET" ] && { echo "$HBC_DOTNET"; return; }
  [ -n "${DOTNET_ROOT:-}" ] && [ -x "$DOTNET_ROOT/dotnet" ] && { echo "$DOTNET_ROOT/dotnet"; return; }
  for c in /usr/share/dotnet.tizen/dotnet /usr/share/dotnet/dotnet \
           /opt/usr/home/owner/share/dotnet/dotnet /opt/usr/share/dotnet/dotnet \
           /usr/local/bin/dotnet /usr/bin/dotnet; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  command -v dotnet 2>/dev/null
}

port_open() {
  # No curl on most TVs: look at the kernel's listening sockets instead.
  hex=$(printf '%04X' "$PORT")
  grep -qi ":$hex .* 0A " /proc/net/tcp /proc/net/tcp6 2>/dev/null
}

is_running() {
  [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

do_stop() {
  if is_running; then
    kill "$(cat "$PIDFILE")" 2>/dev/null
    sleep 1
    is_running && kill -9 "$(cat "$PIDFILE")" 2>/dev/null
    echo "hbc-srv stopped."
  else
    echo "hbc-srv is not running."
  fi
  rm -f "$PIDFILE"
}

DOTNET=$(find_dotnet)
if [ -z "$DOTNET" ] && [ "$CMD" != "stop" ] && [ "$CMD" != "log" ] && [ "$CMD" != "status" ]; then
  echo "No dotnet runtime found on this TV." >&2
  echo "Install one and point HBC_DOTNET at its 'dotnet' binary, e.g." >&2
  echo "  HBC_DOTNET=/opt/usr/home/owner/share/dotnet/dotnet $0 start" >&2
  exit 1
fi

# Embedded images rarely ship ICU; without this the runtime aborts at start-up.
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1
export DOTNET_EnableDiagnostics=0
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1
export DOTNET_gcServer=0
[ -n "$DOTNET" ] && export DOTNET_ROOT=$(dirname "$DOTNET")
export DOTNET_BUNDLE_EXTRACT_BASE_DIR="$STATE/.net"
export HOME=${HOME:-$STATE}
export TMPDIR=${TMPDIR:-$STATE}

case "$CMD" in
  stop) do_stop ;;
  status)
    if is_running && port_open; then echo "hbc-srv is running (pid $(cat "$PIDFILE")) on 127.0.0.1:$PORT"
    elif port_open; then echo "Something is listening on port $PORT (not started by this script)"
    else echo "hbc-srv is NOT running."; exit 1; fi ;;
  log) tail -n 40 "$LOG" 2>/dev/null; tail -n 20 "$STATE/hbc-srv.log" 2>/dev/null ;;
  run) exec "$DOTNET" "$DIR/hbc-srv.dll" ;;
  start)
    # Already running (the widget may ask more than once): do nothing. Both
    # conditions matter - is_running alone is wrong: a stale pid file can point
    # at an unrelated process the TV has since reused that pid for, which would
    # falsely read as "running" and skip the actual start.
    if is_running && port_open; then echo "hbc-srv already running (pid $(cat "$PIDFILE"))."; exit 0; fi
    rm -f "$PIDFILE"
    echo "dotnet:  $DOTNET"
    echo "data:    $STATE"
    : > "$LOG"
    nohup "$DOTNET" "$DIR/hbc-srv.dll" >> "$LOG" 2>&1 &
    echo $! > "$PIDFILE"
    i=0
    while [ $i -lt 30 ]; do
      sleep 1; i=$((i + 1))
      if ! is_running; then
        echo "hbc-srv exited during start-up. Output:" >&2
        cat "$LOG" >&2
        rm -f "$PIDFILE"
        exit 1
      fi
      if port_open; then echo "hbc-srv is up on 127.0.0.1:$PORT (pid $(cat "$PIDFILE"))."; exit 0; fi
    done
    echo "hbc-srv started but the port did not open within 30s. Output:" >&2
    cat "$LOG" >&2
    exit 1 ;;
  *) echo "usage: $0 [start|stop|status|run|log]" >&2; exit 2 ;;
esac
