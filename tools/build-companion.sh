#!/bin/sh
# Publish the companion service for linux-arm and stage its program bundle.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT="$ROOT/dist/hbc-srv"
RID=${HBC_RID:-linux-arm}

cd "$ROOT"

echo "==> Publishing hbc-srv ($RID)"
rm -rf "$OUT"
dotnet publish companion/hbc-srv/hbc-srv.csproj \
  -c Release \
  -r "$RID" \
  --self-contained false \
  -o "$OUT"

echo "==> Publishing elf-run ($RID)"
# Managed ELF loader: Tizen UEP refuses unsigned native exec, but the signed
# dotnet host may map the image and jump to it from anonymous RWX memory.
rm -rf "$OUT/elf-run"
dotnet publish companion/elf-run/elf-run.csproj \
  -c Release \
  -r "$RID" \
  --self-contained false \
  -o "$OUT/elf-run"
# The native apphost and symbols are not used; hbc-srv runs elf-run.dll.
rm -f "$OUT/elf-run/elf-run" "$OUT/elf-run/elf-run.pdb"

echo "==> Staging bundled programs"
rm -rf "$OUT/programs"
mkdir -p "$OUT/programs"
cp -R programs/. "$OUT/programs/"

echo "==> Built $OUT"
find "$OUT" -maxdepth 3 -type f | sort
