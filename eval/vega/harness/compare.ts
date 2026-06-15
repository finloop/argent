// Compare "current" vs "next" across one or more A/B cycles and print the verdict.
//
// Usage:
//   npx tsx compare.ts <cycleDir> [<cycleDir> ...]
// where each <cycleDir> contains current/results.json and next/results.json (the layout
// run.ts produces when invoked with --out <cycleDir> --arm {current,next}).
//
// Verdict (per task) — next is "better" iff, on POOLED trials:
//   success(next) >= success(current)  AND  ttg_p50(next) < ttg_p50(current)
//   AND ttg_p95(next) < ttg_p95(current)  AND the p50 delta keeps the same sign in EVERY
//   cycle (cross-cycle sign flip => within noise => "no measurable difference").
// A credible win also shows device_p50 dropping with steps roughly flat (attribution).
import * as fs from "node:fs";
import * as path from "node:path";
import { summarize, type TaskStats } from "./report.ts";
import type { TrialResult } from "./types.ts";

function loadArm(cycleDir: string, arm: string): TrialResult[] {
  const p = path.join(cycleDir, arm, "results.json");
  if (!fs.existsSync(p)) throw new Error(`missing ${p}`);
  return JSON.parse(fs.readFileSync(p, "utf-8")) as TrialResult[];
}

const byTask = (stats: TaskStats[]) => new Map(stats.map((s) => [s.taskId, s]));
const fmt = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

interface CycleDelta {
  cycle: string;
  ttgP50Delta: Map<string, number | null>; // next - current; null if either side has no successes
}

function main() {
  const cycleDirs = process.argv.slice(2);
  if (!cycleDirs.length) {
    console.error("Usage: npx tsx compare.ts <cycleDir> [<cycleDir> ...]");
    process.exit(2);
  }

  const pooled: Record<"current" | "next", TrialResult[]> = { current: [], next: [] };
  const cycleDeltas: CycleDelta[] = [];

  for (const dir of cycleDirs) {
    const cur = loadArm(dir, "current");
    const nxt = loadArm(dir, "next");
    pooled.current.push(...cur);
    pooled.next.push(...nxt);

    const c = byTask(summarize(cur));
    const n = byTask(summarize(nxt));
    const ttgP50Delta = new Map<string, number | null>();
    for (const taskId of new Set([...c.keys(), ...n.keys()])) {
      const cs = c.get(taskId);
      const ns = n.get(taskId);
      ttgP50Delta.set(
        taskId,
        cs?.ttgMedian != null && ns?.ttgMedian != null ? ns.ttgMedian - cs.ttgMedian : null
      );
    }
    cycleDeltas.push({ cycle: path.basename(dir), ttgP50Delta });
  }

  const cur = byTask(summarize(pooled.current));
  const nxt = byTask(summarize(pooled.next));
  const taskIds = [...new Set([...cur.keys(), ...nxt.keys()])].sort();

  console.log(`\n[compare] cycles: ${cycleDirs.map((d) => path.basename(d)).join(", ")}\n`);

  const header = [
    "task", "succ c→n", "ttg_p50 c→n (Δ)", "ttg_p95 c→n (Δ)", "device_p50 c→n", "steps c→n", "verdict",
  ];
  const rows: string[][] = [header];

  for (const taskId of taskIds) {
    const c = cur.get(taskId);
    const n = nxt.get(taskId);
    const ttgP50Delta = c?.ttgMedian != null && n?.ttgMedian != null ? n.ttgMedian - c.ttgMedian : null;
    const ttgP95Delta = c?.ttgP95 != null && n?.ttgP95 != null ? n.ttgP95 - c.ttgP95 : null;

    // Cross-cycle sign consistency on the p50 delta.
    const perCycle = cycleDeltas.map((cd) => cd.ttgP50Delta.get(taskId)).filter((d): d is number => d != null);
    const allNegative = perCycle.length === cycleDeltas.length && perCycle.every((d) => d < 0);
    const signFlips = perCycle.length > 1 && !(perCycle.every((d) => d < 0) || perCycle.every((d) => d > 0));

    let verdict: string;
    if (!c || !n || c.successRate === 0 || n.successRate === 0) {
      verdict = "insufficient";
    } else if (signFlips) {
      verdict = "noise (sign flip)";
    } else if (
      n.successRate >= c.successRate &&
      ttgP50Delta != null && ttgP50Delta < 0 &&
      ttgP95Delta != null && ttgP95Delta < 0 &&
      allNegative
    ) {
      const deviceDrop = n.deviceMsMedian < c.deviceMsMedian;
      verdict = deviceDrop ? "NEXT better ✓ (device↓)" : "NEXT faster (device flat?)";
    } else {
      verdict = "no improvement";
    }

    rows.push([
      taskId,
      `${pct(c?.successRate ?? 0)}→${pct(n?.successRate ?? 0)}`,
      `${fmt(c?.ttgMedian ?? null)}→${fmt(n?.ttgMedian ?? null)} (${ttgP50Delta == null ? "—" : (ttgP50Delta > 0 ? "+" : "") + Math.round(ttgP50Delta)})`,
      `${fmt(c?.ttgP95 ?? null)}→${fmt(n?.ttgP95 ?? null)} (${ttgP95Delta == null ? "—" : (ttgP95Delta > 0 ? "+" : "") + Math.round(ttgP95Delta)})`,
      `${fmt(c?.deviceMsMedian ?? null)}→${fmt(n?.deviceMsMedian ?? null)}`,
      `${Math.round(c?.stepsMedian ?? 0)}→${Math.round(n?.stepsMedian ?? 0)}`,
      verdict,
    ]);
  }

  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  console.log(rows.map((r) => r.map((cell, i) => cell.padEnd(widths[i]!)).join("  ")).join("\n"));
  console.log("\nLegend: c→n = current→next. ttg in ms (lower is better). Δ = next−current.");
  console.log("Verdict requires success≥, p50 AND p95 lower, and the same sign across ALL cycles.\n");
}

main();
