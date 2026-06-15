# Running the A/B comparison

End-to-end procedure for comparing two **installed** argent versions on the Vega
agent-task eval. The unit under test is the whole installed package, so each arm is a real
install/uninstall — not a binary swap.

## Prerequisites

- **One VVD running**, and only one: `vega virtual-device start` then `vega device list`.
  **Do not `adb connect` it** — that pollutes `vega device list` and breaks discovery.
- **Vega SDK on PATH** (`source ~/vega/env` if needed).
- **Claude Agent SDK can run** — i.e. the `claude` runtime/auth the SDK shells out to is
  available in this shell (the harness spawns headless agent sessions).
- **Two installable argent versions**, each either a published npm spec or a local tarball:
  - published: `@swmansion/argent@0.10.1-vega`
  - local candidate: from the repo root run `npm run pack:mcp` → produces a `.tgz`; use its
    absolute path.
- `npm install` already run in `eval/vega/harness/`.

## One command (automated ABAB)

```bash
cd eval/vega/harness
CURRENT_INSTALL="@swmansion/argent@0.10.1-vega" \
NEXT_INSTALL="/abs/path/to/swmansion-argent-<next>.tgz" \
TRIALS=8 CYCLES=2 \
bash ab.sh
```

`ab.sh` loops, per cycle and per arm: reboot VVD → `argent server stop` +
`npm uninstall -g @swmansion/argent` + `rm -rf ~/.argent` → install the arm → run all
tasks × `TRIALS` via `run.ts` → write `runs/cycle<N>/<arm>/`. After all cycles it calls
`compare.ts` for the verdict.

> **DESTRUCTIVE**: `ab.sh` uninstalls the global `@swmansion/argent` and deletes
> `~/.argent` between arms. Review it before first use. If you keep a separate everyday
> argent install, run this on a throwaway machine/user or reinstall your version afterward.

## Manual / per-arm (if you'd rather drive the swap yourself)

```bash
# arm: current
vega virtual-device stop && vega virtual-device start
argent server stop || true; npm uninstall -g @swmansion/argent || true; rm -rf ~/.argent
npm install -g @swmansion/argent@0.10.1-vega
cd eval/vega/harness && npx tsx run.ts --arm current --trials 8 --out ../runs/cycle1

# arm: next  (repeat the swap with the next tarball/spec)
...
npx tsx run.ts --arm next --trials 8 --out ../runs/cycle1

# second cycle → ../runs/cycle2, then:
npx tsx compare.ts ../runs/cycle1 ../runs/cycle2
```

## Reading the result

`compare.ts` prints a per-task table: `current→next` for success rate, time-to-goal p50/p95
(with Δ), device-time p50, and steps, plus a **verdict**.

**Next is "better" for a task iff** (on pooled trials): success ≥ current, *and* time-to-goal
p50 **and** p95 are lower, *and* the p50 delta keeps the **same sign in every cycle**. A
sign flip across cycles → `noise (sign flip)` → no measurable difference. A credible win
also shows **device-time p50 dropping** (the transport actually got faster) with **steps
roughly flat** — if steps moved, the `describe` *content* changed, not just its speed, and
that needs separate scrutiny.

## Confounds the harness already pins

- **Auto-screenshot OFF** — `run.ts` sets the global `disable-auto-screenshot` flag each
  run (it adds per-call delay + image tokens after describe/keyboard, and is blank-prone on
  macOS VVD). Applied identically to both arms.
- **Pinned model / system prompt / tool surface / app id** — in `config.ts`. Editing any of
  these is a new benchmark generation; don't compare across edits.
- **Fresh state per arm** — `rm -rf ~/.argent` + VVD reboot clears the version-tied
  on-device server in `/scratch` tmpfs, so the next arm can't run against the prior server.

## Before trusting any numbers

Validate the goal predicates in `eval/vega/tasks/*.md` against the live Kepler app: confirm
each fires on the real target screen and **not before**. The predicates ship PROVISIONAL.
