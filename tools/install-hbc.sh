#!/bin/sh
# Connect to a TV and install the built widget.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WGT="$ROOT/dist/tizenhbc.wgt"
SDB=${SDB:-$HOME/tizen-studio/tools/sdb}
TIZEN=${TIZEN:-$HOME/tizen-studio/tools/ide/bin/tizen}
TV=${1:-${HBC_TV:-}}

if [ ! -f "$WGT" ]; then
  echo "Widget not found: $WGT" >&2
  echo "Run ./tools/build.sh first." >&2
  exit 1
fi

if [ ! -x "$SDB" ]; then
  echo "sdb not found at $SDB" >&2
  exit 1
fi

if [ -n "$TV" ]; then
  echo "==> Connecting to $TV"
  "$SDB" connect "$TV" || true
fi

echo "==> Devices"
"$SDB" devices

SERIAL=$("$SDB" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')
if [ -z "$SERIAL" ]; then
  echo "No TV in 'device' state. Enable Developer Mode and accept the host." >&2
  exit 1
fi

echo "==> Installing on $SERIAL"
# sdb install only pushes the file on TVs; the tizen CLI runs the installer.
OUT=$("$TIZEN" install -n "$(basename "$WGT")" -s "$SERIAL" -- "$(dirname "$WGT")" 2>&1) || true
echo "$OUT"
case "$OUT" in
  *"Installed the package"*|*"installed"*|*"Tizen application is successfully installed"*) ;;
  *) echo "Install FAILED (see output above)." >&2; exit 1 ;;
esac

echo "==> Done. Launch Tizen Homebrew Channel from the TV app list."
