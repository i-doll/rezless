#!/usr/bin/env bash
# Build packages/vm/wasm/slua.wasm: SLua's VM and compiler with rezless's
# bridge (packages/vm/native/slua-bridge.cpp), as a standalone WebAssembly
# module using native wasm exceptions.
#
# Needs Emscripten (emcmake/em++ on PATH; Ubuntu's `emscripten` package
# works) and CMake; the committed module was built with Emscripten 3.1.74.
# Uses the SLua checkout in $SLUA_SRC, or clones secondlife/slua at
# $SLUA_COMMIT. The bridge is written against the v0.710 sources; SLua's
# development branch has a different API and library layout. The build runs
# on a copy of the sources whose VM/src/mono_strings.cpp has its case tables
# replaced by packages/vm/native/case-tables.inc, generated from Unicode data
# by scripts/gen-case-tables.ts.
set -euo pipefail

SLUA_COMMIT="${SLUA_COMMIT:-728d25f17f75bf1ebcf68c91e54450cbed4bba34}" # v0.710.12
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${SLUA_WORK:-$ROOT/.slua-build}"
OUT="$ROOT/packages/vm/wasm/slua.wasm"

if [[ -z "${SLUA_SRC:-}" ]]; then
  SLUA_SRC="$WORK/slua"
  if [[ ! -d "$SLUA_SRC/.git" ]]; then
    git clone --filter=blob:none https://github.com/secondlife/slua.git "$SLUA_SRC"
  fi
  git -C "$SLUA_SRC" checkout --quiet "$SLUA_COMMIT"
fi

SRC="$WORK/src"
# A fresh copy of the sources rebuilds everything anyway, and an older build
# directory may be configured for another source directory.
rm -rf "$SRC" "$WORK/build"
mkdir -p "$SRC"
tar -C "$SLUA_SRC" --exclude=.git -cf - . | tar -C "$SRC" -xf -
STRINGS="$SRC/VM/src/mono_strings.cpp"
awk -v inc="$ROOT/packages/vm/native/case-tables.inc" '
  /^static const uint16_t ToLowerDataLow \[\] = \{/ { skip = 1; while ((getline line < inc) > 0) print line }
  /^\/\/ Data table cribbed from Mono/ { next }
  !skip { print }
  skip && /^static const uint16_t ToUpperDataHigh \[\] = \{/ { last = 1 }
  skip && last && /^\};/ { skip = 0 }
' "$SLUA_SRC/VM/src/mono_strings.cpp" > "$STRINGS"
if [[ "$(grep -c 'static const uint16_t To' "$STRINGS")" != 4 ]] || ! grep -q 'gen-case-tables' "$STRINGS" \
  || ! grep -q '^std::string to_upper_mono' "$STRINGS"; then
  echo "could not replace the case tables in mono_strings.cpp" >&2
  exit 1
fi

# Source paths stay out of the module: assert messages name files as slua/...
FLAGS="-O2 -fwasm-exceptions -ffile-prefix-map=$SRC=slua -ffile-prefix-map=$ROOT=rezless"
emcmake cmake -S "$SRC" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release \
  -DLUAU_BUILD_CLI=OFF -DLUAU_BUILD_TESTS=OFF \
  -DCMAKE_CXX_FLAGS="$FLAGS" -DCMAKE_C_FLAGS="$FLAGS" > /dev/null
cmake --build "$WORK/build" --target Luau.VM Luau.Compiler Luau.LSLBuiltins -j"$(nproc)"

B="$WORK/build"
mkdir -p "$(dirname "$OUT")"
em++ $FLAGS -std=c++17 -sSTANDALONE_WASM --no-entry \
  -sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=4MB -sTOTAL_STACK=1MB \
  -I"$SRC/VM/include" -I"$SRC/VM/src" -I"$SRC/Compiler/include" \
  -I"$SRC/Ast/include" -I"$SRC/Common/include" \
  -I"$SRC/LSLBuiltins/include" \
  "$ROOT/packages/vm/native/slua-bridge.cpp" \
  "$B/libLuau.Compiler.a" "$B/libLuau.VM.a" "$B/libLuau.Ast.a" \
  "$B/libLuau.LSLBuiltins.a" "$B/libLuau.Common.a" \
  -o "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
