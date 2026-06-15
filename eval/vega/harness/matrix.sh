#!/usr/bin/env bash
# Matrix sweep: 2 argent versions × N models × all tasks × K trials.
# Installs v0.10.0 (arm "current"), runs every model, installs v0.10.1 (arm "next"), runs
# every model — one install swap total — then compares per model.
#
# Output layout (compare.ts-compatible): <OUT>/<model>/{current,next}/
# Env: TRIALS (default 10), OUT_ROOT (default ../runs/big), CURRENT_TGZ, NEXT_TGZ.
set -uo pipefail   # NOT -e: a failed grid cell must not abort the whole matrix

HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
TRIALS="${TRIALS:-10}"
OUT="${OUT_ROOT:-../runs/big}"
CURRENT_TGZ="${CURRENT_TGZ:-/tmp/argent010/swmansion-argent-0.10.0-vega.tgz}"
NEXT_TGZ="${NEXT_TGZ:-/tmp/argent011/swmansion-argent-0.10.1-vega.tgz}"
SERIAL="${SERIAL:-amazon-4a27df03c9777152}"

# name:model-id pairs (bash 3.2 / zsh compatible — no associative arrays)
MODELS="opus:claude-opus-4-8 sonnet:claude-sonnet-4-6 haiku:claude-haiku-4-5-20251001"

run_grid() {
  local arm="$1"
  for pair in $MODELS; do
    local name="${pair%%:*}" id="${pair#*:}"
    echo "[matrix] === arm=$arm model=$name ($id) ==="
    ARGENT_EVAL_MODEL="$id" npx tsx run.ts \
      --arm "$arm" --trials "$TRIALS" --out "$OUT/$name" --serial "$SERIAL" \
      || echo "[matrix] WARN run failed: arm=$arm model=$name"
  done
}

echo "[matrix] installing CURRENT ($CURRENT_TGZ)"
npm install -g "$CURRENT_TGZ" >/dev/null 2>&1 && echo "[matrix] argent $(argent --version)"
run_grid current

echo "[matrix] installing NEXT ($NEXT_TGZ)"
npm install -g "$NEXT_TGZ" >/dev/null 2>&1 && echo "[matrix] argent $(argent --version)"
run_grid next

echo "[matrix] === comparisons ==="
for pair in $MODELS; do
  name="${pair%%:*}"
  echo "[matrix] ----- model=$name -----"
  npx tsx compare.ts "$OUT/$name" || echo "[matrix] compare failed for $name"
done
echo "[matrix] DONE"
