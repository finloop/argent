// Run one A/B arm: every golden task × K trials against the currently-installed argent.
//
// Usage:
//   ARGENT_MCP_LOG is set per-trial by the harness — do NOT set it globally.
//   npx tsx run.ts --arm current --trials 8 --out ../runs/cycle1 [--tasks open-settings,...] [--serial <udid>]
//
// Run this once per arm. Between arms, perform the version swap (see ab.md): reboot the
// VVD, uninstall argent, `rm -rf ~/.argent`, install the other version, then re-run with
// the other --arm name. The orchestrator in ab.md automates the full ABAB loop.
import * as fs from "node:fs";
import * as path from "node:path";
import { loadTasks } from "./tasks.ts";
import { runTrial, type TrialContext } from "./agent.ts";
import { argentVersion, resolveVegaSerial, restartApp, pinAutoScreenshotOff } from "./device.ts";
import { APP_ID, SETTLE_MS } from "./config.ts";
import { summarize, renderArmTable } from "./report.ts";
import { preflight, PreflightError } from "./preflight.ts";
import type { TrialResult } from "./types.ts";

interface Args {
  arm: string;
  trials: number;
  out: string;
  tasks?: string[];
  serial?: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const arm = get("--arm");
  const out = get("--out");
  if (!arm) throw new Error("--arm <name> is required (e.g. current | next)");
  if (!out) throw new Error("--out <dir> is required");
  const trials = Number(get("--trials") ?? "8");
  const tasksCsv = get("--tasks");
  return {
    arm,
    out,
    trials,
    tasks: tasksCsv ? tasksCsv.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    serial: get("--serial"),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));

  pinAutoScreenshotOff();
  const version = await argentVersion();
  const serial = await resolveVegaSerial(args.serial);
  const tasks = loadTasks(args.tasks);

  // Fail loudly NOW if this installed argent lacks the eval surface (Vega device control,
  // ARGENT_MCP_LOG format, flag) — otherwise every trial would silently time out.
  try {
    const report = await preflight(version, serial);
    for (const note of report.notes) console.warn(`[eval] ${note}`);
    console.log(`[eval] preflight OK — argent ${version} exposes the eval surface`);
  } catch (err) {
    if (err instanceof PreflightError) {
      console.error(`[eval] PREFLIGHT FAILED — refusing to run.\n[eval] ${err.message}`);
      process.exit(3);
    }
    throw err;
  }

  const runDir = path.resolve(args.out, args.arm);
  fs.mkdirSync(runDir, { recursive: true });
  const resultsPath = path.join(runDir, "results.json");

  console.log(`[eval] arm=${args.arm} argent=${version} serial=${serial}`);
  console.log(`[eval] tasks=${tasks.map((t) => t.id).join(",")} trials=${args.trials}`);
  console.log(`[eval] writing to ${runDir}`);

  const results: TrialResult[] = [];
  const flush = () => fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2) + "\n");

  for (const task of tasks) {
    for (let trial = 1; trial <= args.trials; trial++) {
      // Reset to start state: terminate + relaunch (stateless app), then settle so the
      // automation toolkit attaches before the agent's first describe.
      await restartApp(serial, APP_ID);
      await sleep(SETTLE_MS);

      const ctx: TrialContext = { arm: args.arm, argentVersion: version, serial, runDir, trial };
      const t = Date.now();
      const res = await runTrial(task, ctx);
      results.push(res);
      flush();

      const ttg = res.timeToGoalMs == null ? "—" : `${Math.round(res.timeToGoalMs)}ms`;
      console.log(
        `[eval] ${task.id} trial ${trial}/${args.trials}: ${res.outcome} ttg=${ttg} ` +
          `steps=${res.decomposition.steps} device=${Math.round(res.decomposition.deviceMs)}ms ` +
          `model=${Math.round(res.decomposition.modelMs)}ms wall=${Math.round((Date.now() - t) / 1000)}s`
      );
    }
  }

  const stats = summarize(results);
  const summaryPath = path.join(runDir, "summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ arm: args.arm, version, stats }, null, 2) + "\n");

  console.log(`\n[eval] arm=${args.arm} (argent ${version}) — per-task summary:\n`);
  console.log(renderArmTable(stats));
  console.log(`\n[eval] raw: ${resultsPath}\n[eval] summary: ${summaryPath}`);
}

main().catch((err) => {
  console.error(`[eval] fatal: ${err instanceof Error ? err.stack : err}`);
  process.exit(1);
});
