// Aggregate trial results into per-task stats and render tables.
import type { TrialResult } from "./types.ts";

export interface TaskStats {
  taskId: string;
  arm: string;
  trials: number;
  successRate: number;
  // time-to-goal over SUCCESSFUL trials only (ms)
  ttgMedian: number | null;
  ttgP95: number | null;
  // decomposition medians over all trials
  deviceMsMedian: number;
  modelMsMedian: number;
  stepsMedian: number;
  tokensOutMedian: number | null;
}

function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx]!;
}
const median = (xs: number[]) => percentile(xs, 50);

export function summarize(results: TrialResult[]): TaskStats[] {
  const byKey = new Map<string, TrialResult[]>();
  for (const r of results) {
    const key = `${r.arm}::${r.taskId}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(r);
  }
  const stats: TaskStats[] = [];
  for (const group of byKey.values()) {
    const succ = group.filter((r) => r.success);
    const ttg = succ.map((r) => r.timeToGoalMs!).filter((n) => n != null);
    const tokensOut = group.map((r) => r.tokens?.output).filter((n): n is number => n != null);
    stats.push({
      taskId: group[0]!.taskId,
      arm: group[0]!.arm,
      trials: group.length,
      successRate: succ.length / group.length,
      ttgMedian: median(ttg),
      ttgP95: percentile(ttg, 95),
      deviceMsMedian: median(group.map((r) => r.decomposition.deviceMs)) ?? 0,
      modelMsMedian: median(group.map((r) => r.decomposition.modelMs)) ?? 0,
      stepsMedian: median(group.map((r) => r.decomposition.steps)) ?? 0,
      tokensOutMedian: tokensOut.length ? median(tokensOut) : null,
    });
  }
  return stats.sort((a, b) => a.taskId.localeCompare(b.taskId) || a.arm.localeCompare(b.arm));
}

const ms = (n: number | null) => (n == null ? "—" : `${Math.round(n)}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Human-readable table for one arm's results. */
export function renderArmTable(stats: TaskStats[]): string {
  const header = ["task", "succ", "ttg_p50", "ttg_p95", "device_p50", "model_p50", "steps", "tok_out"];
  const rows = stats.map((s) => [
    s.taskId,
    pct(s.successRate),
    ms(s.ttgMedian),
    ms(s.ttgP95),
    ms(s.deviceMsMedian),
    ms(s.modelMsMedian),
    String(Math.round(s.stepsMedian)),
    s.tokensOutMedian == null ? "—" : String(Math.round(s.tokensOutMedian)),
  ]);
  return table([header, ...rows]);
}

function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, c) => Math.max(...rows.map((r) => r[c]!.length)));
  return rows
    .map((r) => r.map((cell, c) => cell.padEnd(widths[c]!)).join("  "))
    .join("\n");
}
