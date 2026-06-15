// Shared types for the Vega agent-task eval harness.

/** A goal predicate matched against a `describe` element tree (see goal.ts). */
export interface GoalPredicate {
  /** A node line whose text contains this substring (case-insensitive). */
  contains_text?: string;
  /** The matched node carries the [focused] flag. */
  focused?: boolean;
  /** The matched node carries the [selected] flag. */
  selected?: boolean;
  /** The matched node's role/type contains this token (case-insensitive). */
  role?: string;
  /** All sub-predicates must hold (against the same tree). */
  all_of?: GoalPredicate[];
  /** At least one sub-predicate must hold. */
  any_of?: GoalPredicate[];
}

/** A golden task parsed from eval/vega/tasks/<id>.md. */
export interface Task {
  id: string;
  /** Hard cap on agent tool calls before the trial is a failure. */
  max_steps: number;
  /** Hard cap on wall-clock seconds before the trial is a failure. */
  max_seconds: number;
  /** Predicate over the describe tree that defines "goal reached". */
  goal: GoalPredicate;
  /** Natural-language instruction handed to the agent verbatim. */
  instruction: string;
  /** Source file path, for diagnostics. */
  sourcePath: string;
}

/** One parsed entry from ~/.argent/mcp-calls.log (JSONL). */
export interface McpLogEntry {
  ts: string; // ISO timestamp
  event: "tool_called" | "tool_result";
  name: string;
  durationMs?: number; // present on tool_result
  isError?: boolean; // present on tool_result
  args?: unknown; // present on tool_called
  result?: unknown; // present on tool_result
  error?: string;
}

/** Decomposition of a single trial's latency, derived from the MCP log. */
export interface Decomposition {
  /** Σ durationMs of all tool calls — the "device/tool round-trip" time. */
  deviceMs: number;
  /** Σ gaps between tool_result and the next tool_called — model thinking time. */
  modelMs: number;
  /** Count of tool_called events. */
  steps: number;
  /** Count of tool calls that returned isError. */
  errors: number;
}

/** Result of one trial (one task, one arm, one repetition). */
export interface TrialResult {
  taskId: string;
  arm: string;
  argentVersion: string;
  trial: number;
  success: boolean;
  /** Wall-clock ms from first tool call to first goal-satisfying describe; null if never reached. */
  timeToGoalMs: number | null;
  /** Why the trial ended. */
  outcome: "goal_reached" | "max_steps" | "max_seconds" | "agent_stopped" | "error";
  decomposition: Decomposition;
  /** Token usage from the Agent SDK, if available. */
  tokens?: { input: number; output: number };
  /** Path to the per-trial MCP log slice. */
  logPath: string;
  notes?: string;
}
