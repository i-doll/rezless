#!/usr/bin/env bash
# Build packages/vm/wasm/slua.wasm: SLua's VM and compiler with rezless's
# bridge (packages/vm/native/slua-bridge.cpp), as a standalone WebAssembly
# module using native wasm exceptions.
#
# Needs Emscripten (emcmake/em++ on PATH; Ubuntu's `emscripten` package
# works) and CMake. Uses the SLua checkout in $SLUA_SRC, or clones
# secondlife/slua at $SLUA_COMMIT.
set -euo pipefail

SLUA_COMMIT="${SLUA_COMMIT:-af1379e6fc30d66ba991f15213f2d48d65175e55}"
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

FLAGS="-O2 -fwasm-exceptions"
emcmake cmake -S "$SLUA_SRC" -B "$WORK/build" -DCMAKE_BUILD_TYPE=Release \
  -DLUAU_BUILD_CLI=OFF -DLUAU_BUILD_TESTS=OFF \
  -DCMAKE_CXX_FLAGS="$FLAGS" -DCMAKE_C_FLAGS="$FLAGS" > /dev/null
cmake --build "$WORK/build" --target Luau.VM Luau.Compiler -j"$(nproc)"

B="$WORK/build"
mkdir -p "$(dirname "$OUT")"
em++ $FLAGS -std=c++17 -sSTANDALONE_WASM --no-entry \
  -sALLOW_MEMORY_GROWTH -sINITIAL_MEMORY=4MB -sTOTAL_STACK=1MB \
  -sERROR_ON_UNDEFINED_SYMBOLS=0 \
  -I"$SLUA_SRC/VM/include" -I"$SLUA_SRC/VM/src" -I"$SLUA_SRC/Compiler/include" \
  -I"$SLUA_SRC/Ast/include" -I"$SLUA_SRC/Bytecode/include" -I"$SLUA_SRC/Common/include" \
  -I"$SLUA_SRC/LSLBuiltins/include" \
  "$ROOT/packages/vm/native/slua-bridge.cpp" \
  "$B/libLuau.Compiler.a" "$B/libLuau.VM.a" "$B/libLuau.Ast.a" "$B/libLuau.Bytecode.a" \
  "$B/libLuau.LSLBuiltins.a" "$B/libLuau.Common.a" "$B/Tailslide/libtailslide.a" \
  -o "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
