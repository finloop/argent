// Parse a per-trial MCP call log (JSONL) and decompose latency.
//
// The argent MCP server writes one JSON object per line to ARGENT_MCP_LOG, emitting a
// `tool_called` event (with ts, name, args) before each call and a `tool_result` event
// (with ts, name, durationMs, isError, result) after. See packages/argent-mcp/src/mcp-server.ts.
import * as fs from "node:fs";
import type { McpLogEntry, Decomposition } from "./types.ts";

export function parseLog(text: string): McpLogEntry[] {
  const out: McpLogEntry[] = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      out.push(JSON.parse(s) as McpLogEntry);
    } catch {
      // tolerate partial/corrupt trailing lines (log may be read mid-write)
    }
  }
  return out;
}

export function readLog(path: string): McpLogEntry[] {
  if (!fs.existsSync(path)) return [];
  return parseLog(fs.readFileSync(path, "utf-8"));
}

/**
 * Decompose a trial's entries into device time (Σ durationMs), model time (Σ gaps between
 * a tool_result and the next tool_called), step count, and error count.
 */
export function decompose(entries: McpLogEntry[]): Decomposition {
  let deviceMs = 0;
  let modelMs = 0;
  let steps = 0;
  let errors = 0;
  let lastResultTs: number | null = null;

  for (const e of entries) {
    const t = Date.parse(e.ts);
    if (e.event === "tool_called") {
      steps += 1;
      if (lastResultTs != null && Number.isFinite(t)) {
        const gap = t - lastResultTs;
        if (gap > 0) modelMs += gap; // time the model spent before issuing this call
      }
    } else if (e.event === "tool_result") {
      if (typeof e.durationMs === "number") deviceMs += e.durationMs;
      if (e.isError) errors += 1;
      if (Number.isFinite(t)) lastResultTs = t;
    }
  }
  return { deviceMs, modelMs, steps, errors };
}

/** Timestamp (ms) of the first `tool_called`, used as t0 for time-to-goal. */
export function firstCallTs(entries: McpLogEntry[]): number | null {
  for (const e of entries) {
    if (e.event === "tool_called") {
      const t = Date.parse(e.ts);
      return Number.isFinite(t) ? t : null;
    }
  }
  return null;
}
