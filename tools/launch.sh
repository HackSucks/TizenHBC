#!/bin/sh
# Entry point the widget runs through the TV's root shell:
#     sh /opt/usr/apps/<pkg>/res/wgt/hbc-srv/launch.sh
# It ignores its arguments (the shell passes a stray "HTTP/1.1"), detaches
# completely from the shell that ran it and starts the companion service.
# Everything it does is logged to /tmp/hbc-launch.log - read that first when the
# in-app starter reports a failure:  sdb shell cat /tmp/hbc-launch.log
LOG=/tmp/hbc-launch.log
DIR=$(cd "$(dirname "$0")" && pwd)
{
  echo "--- $(date 2>/dev/null) launch.sh dir=$DIR user=$(id -un 2>/dev/null) port=${HBC_PORT:-default}"
  [ -f "$DIR/hbc-srv.dll" ] || echo "!! hbc-srv.dll is missing in $DIR (widget built without ./tools/build-companion.sh?)"
  [ -f "$DIR/hbc-srv.sh" ]  || echo "!! hbc-srv.sh is missing in $DIR"
} >>"$LOG" 2>&1
S=$(command -v setsid)
$S nohup sh "$DIR/hbc-srv.sh" start >>"$LOG" 2>&1 </dev/null &
exit 0
