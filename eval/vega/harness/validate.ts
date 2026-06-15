// Validate a task's goal predicate against the CURRENT live screen.
//
// Run it while the device is ON the screen you expect the goal to match (and again while it
// is NOT) to confirm the predicate fires on the real target and only there — the
// pre-trust check from the plan. No agent, no trials; just describe + match.
//
// Usage: npx tsx validate.ts --task open-third-in-row [--serial <udid>]
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadTasks } from "./tasks.ts";
import { resolveVegaSerial } from "./device.ts";
import { matchesGoal, describeToText } from "./goal.ts";
import type { GoalPredicate } from "./types.ts";

const execFileAsync = promisify(execFile);

function get(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Report which leaf sub-predicates currently match, for a readable diagnosis. */
function explain(text: string, g: GoalPredicate, indent = "  "): void {
  const lines = text.split("\n").map((s) => s.trim());
  const leaf = (k: string, v: string, ok: boolean) =>
    console.log(`${indent}${ok ? "✓" : "✗"} ${k}: ${v}`);
  if (g.contains_text != null)
    leaf("contains_text", g.contains_text, lines.some((l) => l.toLowerCase().includes(g.contains_text!.toLowerCase())));
  if (g.role != null)
    leaf("role", g.role, lines.some((l) => l.toLowerCase().includes(g.role!.toLowerCase())));
  if (g.focused != null) leaf("focused", String(g.focused), /\[focused\]/i.test(text));
  if (g.selected != null) leaf("selected", String(g.selected), /\[selected\]/i.test(text));
  for (const sub of g.all_of ?? []) explain(text, sub, indent + "  (all_of) ");
  for (const sub of g.any_of ?? []) explain(text, sub, indent + "  (any_of) ");
}

async function main() {
  const taskId = get("--task");
  if (!taskId) throw new Error("--task <id> is required");
  const serial = await resolveVegaSerial(get("--serial"));
  const task = loadTasks([taskId])[0]!;

  const { stdout } = await execFileAsync("argent", ["run", "describe", "--udid", serial, "--json"], {
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const result = JSON.parse(stdout);
  const text = describeToText(result);
  const ok = matchesGoal(result, task.goal);

  console.log(`\n[validate] task=${task.id} serial=${serial}`);
  console.log(`[validate] goal: ${JSON.stringify(task.goal)}`);
  explain(text, task.goal);
  console.log(`\n[validate] ${ok ? "PASS — goal matches the current screen" : "FAIL — goal does NOT match the current screen"}\n`);
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`[validate] error: ${err instanceof Error ? err.message : err}`);
  process.exit(2);
});
