import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLog, decompose, firstCallTs } from "./mcplog.ts";

// Two calls: describe (200ms device, then 1000ms model gap), remote (50ms device).
const LOG = [
  { ts: "2026-06-15T10:00:00.000Z", event: "tool_called", name: "describe" },
  { ts: "2026-06-15T10:00:00.200Z", event: "tool_result", name: "describe", durationMs: 200, isError: false },
  { ts: "2026-06-15T10:00:01.200Z", event: "tool_called", name: "remote" },
  { ts: "2026-06-15T10:00:01.250Z", event: "tool_result", name: "remote", durationMs: 50, isError: true },
]
  .map((e) => JSON.stringify(e))
  .join("\n");

test("parseLog tolerates blank/corrupt trailing lines", () => {
  const entries = parseLog(LOG + "\n\n{not json");
  assert.equal(entries.length, 4);
});

test("decompose splits device vs model time and counts steps/errors", () => {
  const d = decompose(parseLog(LOG));
  assert.equal(d.deviceMs, 250); // 200 + 50
  assert.equal(d.modelMs, 1000); // gap between first result (10:00:00.200) and second call (10:00:01.200)
  assert.equal(d.steps, 2);
  assert.equal(d.errors, 1);
});

test("firstCallTs returns the first tool_called timestamp", () => {
  assert.equal(firstCallTs(parseLog(LOG)), Date.parse("2026-06-15T10:00:00.000Z"));
});
