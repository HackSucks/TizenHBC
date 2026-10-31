#!/bin/sh
# Create the complete source + build zip.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT="$ROOT/dist/tizenhbc-project.zip"

cd "$ROOT"

rm -f "$OUT"
zip -r -q "$OUT" \
  README.md COPYING \
  app companion docs programs schemas tools \
  -x '*/bin/*' '*/obj/*' '*/node_modules/*' '*.pdb' '*/.manifest.tmp'

if [ -f "$ROOT/dist/tizenhbc.wgt" ]; then
  zip -j -q "$OUT" "$ROOT/dist/tizenhbc.wgt"
fi

if [ -d "$ROOT/dist/hbc-srv" ]; then
  (cd "$ROOT/dist" && zip -r -q "$OUT" hbc-srv)
fi

echo "==> Built $OUT"
ls -lh "$OUT"
