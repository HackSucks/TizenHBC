#!/bin/sh
# Build and sign the Tizen widget.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PROFILE=${HBC_PROFILE:-tv}
TIZEN=${TIZEN:-$HOME/tizen-studio/tools/ide/bin/tizen}
OUT="$ROOT/dist/tizenhbc.wgt"
TMP="$ROOT/dist/.wgt-build"

cd "$ROOT"

if [ ! -x "$TIZEN" ]; then
  echo "Tizen CLI not found at $TIZEN" >&2
  echo "Set TIZEN=/path/to/tizen or install Tizen Studio." >&2
  exit 1
fi

echo "==> Checking JavaScript"
for f in app/js/*.js; do
  node --check "$f"
done

echo "==> Checking JSON"
node -e "JSON.parse(require('fs').readFileSync('app/res/programs.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('schemas/programs.schema.json','utf8'))"

# Bundle the companion inside the widget so the app can start it itself.
STAGE="$ROOT/app/hbc-srv"
rm -rf "$STAGE"
if [ -f "$ROOT/dist/hbc-srv/hbc-srv.dll" ]; then
  echo "==> Bundling hbc-srv into the widget"
  mkdir -p "$STAGE"
  cp "$ROOT/dist/hbc-srv/hbc-srv.dll" "$ROOT/dist/hbc-srv/hbc-srv.deps.json" \
     "$ROOT/dist/hbc-srv/hbc-srv.runtimeconfig.json" "$STAGE/"
  cp -R "$ROOT/dist/hbc-srv/programs" "$STAGE/programs"
  if [ -d "$ROOT/dist/hbc-srv/elf-run" ]; then
    cp -R "$ROOT/dist/hbc-srv/elf-run" "$STAGE/elf-run"
  fi
  cp "$ROOT/tools/hbc-srv.sh" "$STAGE/"
  trap 'rm -rf "$STAGE"' EXIT
else
  echo "!! dist/hbc-srv not built (run ./tools/build-companion.sh first); the widget will not be able to start the service by itself" >&2
fi

echo "==> Packaging with profile '$PROFILE'"
rm -rf "$TMP"
mkdir -p "$TMP"
"$TIZEN" package -t wgt -s "$PROFILE" -o "$TMP" -- "$ROOT/app"

set -- "$TMP"/*.wgt
if [ ! -f "$1" ]; then
  echo "Packaging did not produce a .wgt file" >&2
  exit 1
fi
mv "$1" "$OUT"
rm -rf "$TMP"

echo "==> Built $OUT"
ls -lh "$OUT"
