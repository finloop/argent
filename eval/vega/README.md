# Vega agent-task latency eval

Measures **how long an LLM agent takes to reach a goal screen in a Fire TV (Vega) app
using argent's tools** — end-to-end, in a real workflow — and compares two *installed*
argent versions ("current" vs "next").

This is an **agent-task benchmark**, not a tool microbenchmark. argent's input/describe
transport speed is one input; the agent's thinking time and step count are the others. The
harness measures the whole loop and **decomposes** it (device time vs model time vs steps)
so you can see whether a faster transport actually moved the end-to-end number.

> Full design rationale: `~/.claude/plans/how-could-i-evaluate-delegated-meadow.md`.

## What it measures

Per task, per argent version, per trial:

| Metric | Definition | Source |
|---|---|---|
| **time-to-goal** (headline) | wall-clock, first agent action → verified goal state | harness clock |
| success | goal predicate satisfied within step/time budget | goal verifier |
| device time | Σ `durationMs` of all tool calls | `~/.argent/mcp-calls.log` |
| model time | Σ gaps between consecutive calls' `ts` | same log |
| steps | count of `tool_called` events | same log |
| tokens | input/output tokens for the session | Agent SDK usage |

A credible "next is faster" result is **device time down, steps & model-time ≈ flat,
success ≥ current**. If steps move, the `describe` *content* changed (not just its speed) —
a different finding that needs separate scrutiny.

## Layout

```
eval/vega/
  README.md            # this file
  tasks/<id>.md        # one golden task per file (frontmatter + instruction body)
  harness/             # the runner (standalone; no argent-source imports)
```

The harness reads `tasks/` from the **repo working tree**, not the installed argent package
(which is uninstalled/reinstalled between A/B arms). Task prompts live in-repo so changes go
through PR review and a benchmark run is pinned to a commit.

## App under test

Hardcoded for now: **`com.amazondeveloper.keplervideoapp.main`** (the Kepler video sample).
Add a per-task `app` frontmatter field later if the suite grows to span multiple apps.

## Task file format

`tasks/<id>.md` is markdown with YAML frontmatter:

```markdown
---
id: open-settings
max_steps: 25
max_seconds: 120
goal:
  contains_text: "Network"      # a node whose text contains this string …
  focused: true                 # … and which is currently focused (optional)
---
From the home screen, open the Settings screen and move focus to the Network option.
```

- **Frontmatter** (machine-read by the verifier): `id`, `max_steps`, `max_seconds`, `goal`.
- **`goal` predicate** is matched against the parsed `describe` element tree. Supported
  keys (see `harness/goal.ts`): `contains_text`, `focused`, `selected`, `role`,
  `all_of` / `any_of` for composition.
- **Body**: the natural-language instruction handed to the agent verbatim.

> Goal predicates must be **validated against the live app** before trusting any numbers —
> confirm each fires on the real target screen and *not* before. See plan step 3.

## Running

```bash
# 1. one VVD running (do NOT `adb connect` it)
vega virtual-device start && vega device list

# 2. install the arm under test, then:
cd eval/vega/harness
npm install
ARGENT_MCP_LOG=$HOME/.argent/mcp-calls.log npx tsx run.ts --arm current --trials 8 --out ../runs/

# 3. swap argent versions per the A/B loop (see harness/ab.md) and re-run with --arm next
```
