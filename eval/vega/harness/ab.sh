#!/usr/bin/env bash
# Full ABAB orchestrator: install one argent version, run all tasks x K trials, fully
# remove it, install the other, repeat — for N cycles — then print the comparison.
#
# DESTRUCTIVE: uninstalls the global @swmansion/argent and `rm -rf ~/.argent` between arms.
# Read ab.md before running. Requires: the `vega` SDK CLI, npm, and a Claude Code env the
# Agent SDK can use. One VVD; do NOT `adb connect` it.
#
# Required env:
#   CURRENT_INSTALL  npm spec or path to install for the "current" arm
#                    (e.g. "@swmansion/argent@0.10.1-vega" or "/abs/path/argent-x.tgz")
#   NEXT_INSTALL     same, for the "next" arm
# Optional env:
#   TRIALS=8  CYCLES=2  OUT_ROOT=../runs  TASKS=""  (TASKS: comma-separated task ids)
set -euo pipefail

: "${CURRENT_INSTALL:?set CURRENT_INSTALL to an npm spec or .tgz path}"
: "${NEXT_INSTALL:?set NEXT_INSTALL to an npm spec or .tgz path}"
TRIALS="${TRIALS:-8}"
CYCLES="${CYCLES:-2}"
OUT_ROOT="${OUT_ROOT:-../runs}"
TASKS_ARG=""
[ -n "${TASKS:-}" ] && TASKS_ARG="--tasks ${TASKS}"

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

reboot_vvd() {
  echo "[ab] rebooting VVD…"
  vega virtual-device stop >/dev/null 2>&1 || true
  vega virtual-device start
  # wait until exactly one Vega device is listable
  for _ in $(seq 1 60); do
    if vega device list 2>/dev/null | grep -qiE "virtual|firetv|device"; then return 0; fi
    sleep 2
  done
  echo "[ab] WARNING: VVD did not appear in 'vega device list' within timeout" >&2
}

clean_argent() {
  echo "[ab] removing installed argent + state…"
  argent server stop >/dev/null 2>&1 || true
  npm uninstall -g @swmansion/argent >/dev/null 2>&1 || true
  rm -rf "$HOME/.argent"
}

install_argent() {
  local spec="$1"
  echo "[ab] installing argent: $spec"
  npm install -g "$spec" >/dev/null
  argent --version
}

run_arm() {
  local arm="$1" spec="$2" cycle="$3"
  reboot_vvd
  clean_argent
  install_argent "$spec"
  echo "[ab] cycle $cycle / arm $arm → run.ts"
  npx tsx run.ts --arm "$arm" --trials "$TRIALS" --out "$OUT_ROOT/cycle$cycle" $TASKS_ARG
}

CYCLE_DIRS=()
for cycle in $(seq 1 "$CYCLES"); do
  run_arm current "$CURRENT_INSTALL" "$cycle"
  run_arm next    "$NEXT_INSTALL"    "$cycle"
  CYCLE_DIRS+=("$OUT_ROOT/cycle$cycle")
done

echo "[ab] all cycles done — comparing"
npx tsx compare.ts "${CYCLE_DIRS[@]}"
