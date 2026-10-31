#!/bin/sh
# Push dist/hbc-srv to the TV and start it. Usage: ./tools/install-companion.sh [tv-ip]
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SDB=${SDB:-$HOME/tizen-studio/tools/sdb}
TV=${1:-${HBC_TV:-}}
DEST=${HBC_REMOTE_DIR:-/opt/usr/home/owner/share/hbc-srv}

[ -d "$ROOT/dist/hbc-srv" ] || { echo "Run ./tools/build-companion.sh first." >&2; exit 1; }
[ -n "$TV" ] && "$SDB" connect "$TV" || true

cp "$ROOT/tools/hbc-srv.sh" "$ROOT/dist/hbc-srv/"
chmod +x "$ROOT/dist/hbc-srv/hbc-srv.sh"

echo "==> Pushing to $DEST"
"$SDB" shell "mkdir -p $DEST"
"$SDB" push "$ROOT/dist/hbc-srv/." "$DEST"
"$SDB" shell "chmod +x $DEST/hbc-srv.sh $DEST/hbc-srv 2>/dev/null; true"

echo "==> Starting"
"$SDB" shell "$DEST/hbc-srv.sh start"
