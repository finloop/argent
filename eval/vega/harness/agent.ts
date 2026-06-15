// Run ONE trial: a headless Claude Agent SDK session driving the INSTALLED argent MCP
// server to accomplish a task, with goal detection + budget enforcement derived from the
// per-trial MCP call log.
import * as fs from "node:fs";
import * as path from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Task, TrialResult, McpLogEntry } from "./types.ts";
import { ALLOWED_TOOLS, MODEL, SYSTEM_PROMPT, GOAL_POLL_MS } from "./config.ts";
import { matchesGoal } from "./goal.ts";
import { readLog, decompose, firstCallTs } from "./mcplog.ts";

export interface TrialContext {
  arm: string;
  argentVersion: string;
  serial: string;
  /** Per-arm output directory; trial logs/results are written under here. */
  runDir: string;
  /** Trial repetition index (1-based). */
  trial: number;
}

/** Build a clean string-valued env (process.env has possibly-undefined values). */
function cleanEnv(extra: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v != null) out[k] = v;
  return { ...out, ...extra };
}

/** Earliest `describe` result that satisfies the goal → its timestamp (ms), else null. */
function goalTimestamp(entries: McpLogEntry[], task: Task): number | null {
  for (const e of entries) {
    if (e.event !== "tool_result") continue;
    if (!e.name.endsWith("describe")) continue;
    if (e.isError) continue;
    if (matchesGoal(e.result, task.goal)) {
      const t = Date.parse(e.ts);
      return Number.isFinite(t) ? t : null;
    }
  }
  return null;
}

export async function runTrial(task: Task, ctx: TrialContext): Promise<TrialResult> {
  const logPath = path.join(ctx.runDir, `${task.id}.trial${ctx.trial}.mcplog.jsonl`);
  fs.rmSync(logPath, { force: true }); // fresh slice per trial

  const prompt = [
    task.instruction,
    "",
    `The device udid is: ${ctx.serial}`,
    "Pass this exact value as the `udid` argument to every tool call.",
  ].join("\n");

  const abortController = new AbortController();
  const harnessStart = Date.now();
  // A mutable holder: the poll closure writes outcome/goalTs asynchronously, so a plain
  // `let` would get control-flow-narrowed to its initializer literal. An object property
  // is re-widened to its declared type after each await, which is what we want here.
  const state: { outcome: TrialResult["outcome"]; goalTs: number | null } = {
    outcome: "agent_stopped",
    goalTs: null,
  };
  let tokens: TrialResult["tokens"];
  let q: ReturnType<typeof query> | undefined;

  // Force-stop the agent: cooperative abort PLUS the SDK's interrupt()/return(), because a
  // wedged session does not exit the `for await` on abort alone (which would hang the whole
  // run). Best-effort and non-throwing.
  const stopAgent = () => {
    abortController.abort();
    void Promise.resolve(q?.interrupt?.()).catch(() => {});
    void Promise.resolve(q?.return?.(undefined as never)).catch(() => {});
  };

  // Poll the trial log for goal satisfaction / budget breaches, stop when hit.
  const poll = setInterval(() => {
    const entries = readLog(logPath);
    const t0 = firstCallTs(entries);
    const steps = entries.filter((e) => e.event === "tool_called").length;

    const gt = goalTimestamp(entries, task);
    if (gt != null) {
      state.goalTs = gt;
      state.outcome = "goal_reached";
      stopAgent();
      return;
    }
    const elapsedFromFirstCall = t0 != null ? (Date.now() - t0) / 1000 : 0;
    const elapsedWall = (Date.now() - harnessStart) / 1000;
    if (elapsedFromFirstCall > task.max_seconds || elapsedWall > task.max_seconds + 30) {
      state.outcome = "max_seconds";
      stopAgent();
      return;
    }
    if (steps > task.max_steps) {
      state.outcome = "max_steps";
      stopAgent();
      return;
    }
  }, GOAL_POLL_MS);

  // Hard deadline: a backstop so the trial ALWAYS returns even if the SDK loop never exits
  // on abort (a hung session). Sits 30s past the cooperative budget the poll enforces.
  const hardDeadlineMs = (task.max_seconds + 30) * 1000;
  let hardTimer: ReturnType<typeof setTimeout> | undefined;

  try {
    q = query({
      prompt,
      options: {
        model: MODEL,
        systemPrompt: SYSTEM_PROMPT,
        cwd: ctx.runDir, // neutral cwd: no project-scope .argent flags override the global pin
        tools: [], // disable built-in Claude Code tools; only the argent MCP surface
        allowedTools: ALLOWED_TOOLS,
        permissionMode: "bypassPermissions",
        maxTurns: task.max_steps + 5,
        abortController,
        mcpServers: {
          argent: {
            command: "argent",
            args: ["mcp"],
            env: cleanEnv({ ARGENT_MCP_LOG: logPath }),
          },
        },
      },
    });

    // Drain the message stream. A real (non-abort) error propagates; abort/interrupt is
    // swallowed so the race below resolves cleanly.
    const consume = (async () => {
      for await (const msg of q!) {
        if (msg.type === "result") {
          const u = (msg as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
          if (u) tokens = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0 };
        }
        if (abortController.signal.aborted) break;
      }
    })().catch((err) => {
      if (!abortController.signal.aborted) throw err;
    });

    const hard = new Promise<void>((resolve) => {
      hardTimer = setTimeout(() => {
        if (state.outcome !== "goal_reached") state.outcome = "max_seconds";
        stopAgent();
        resolve(); // proceed even if `consume` is wedged — it is abandoned, not awaited
      }, hardDeadlineMs);
    });

    await Promise.race([consume, hard]);
    consume.catch(() => {}); // swallow any late rejection from an abandoned loop
  } catch (err) {
    // A real error from consume (not abort/interrupt).
    clearInterval(poll);
    if (hardTimer) clearTimeout(hardTimer);
    stopAgent();
    return buildResult(task, ctx, logPath, "error", null, tokens, String(err));
  } finally {
    clearInterval(poll);
    if (hardTimer) clearTimeout(hardTimer);
  }

  // Final authoritative pass over the completed log (catches a goal reached on the very
  // last call before the stream closed).
  const entries = readLog(logPath);
  if (state.outcome !== "goal_reached") {
    const gt = goalTimestamp(entries, task);
    if (gt != null) {
      state.goalTs = gt;
      state.outcome = "goal_reached";
    }
  }
  return buildResult(task, ctx, logPath, state.outcome, state.goalTs, tokens);
}

function buildResult(
  task: Task,
  ctx: TrialContext,
  logPath: string,
  outcome: TrialResult["outcome"],
  goalTs: number | null,
  tokens: TrialResult["tokens"],
  notes?: string
): TrialResult {
  const entries = readLog(logPath);
  const t0 = firstCallTs(entries);
  const timeToGoalMs =
    outcome === "goal_reached" && goalTs != null && t0 != null ? goalTs - t0 : null;
  return {
    taskId: task.id,
    arm: ctx.arm,
    argentVersion: ctx.argentVersion,
    trial: ctx.trial,
    success: outcome === "goal_reached",
    timeToGoalMs,
    outcome,
    decomposition: decompose(entries),
    tokens,
    logPath,
    notes,
  };
}
