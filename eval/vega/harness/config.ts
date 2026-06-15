// Pinned eval configuration. Everything here is held IDENTICAL across both A/B arms —
// only the installed argent version is allowed to vary. Changing any value invalidates
// cross-run comparisons, so treat edits as a new benchmark generation.

/** App under test (hardcoded for now; see eval/vega/README.md). */
export const APP_ID = "com.amazondeveloper.keplervideoapp.main";

/**
 * Agent model. Same model on both arms or the comparison is meaningless. Overridable via
 * ARGENT_EVAL_MODEL so a run can name the model under eval without editing this file.
 * Default: Opus 4.8.
 */
export const MODEL = process.env.ARGENT_EVAL_MODEL ?? "claude-opus-4-8";

/**
 * The argent Vega tools the agent is allowed to use. Restricting the surface keeps the
 * task honest and identical across arms. Names are the MCP-namespaced tool ids.
 */
export const ALLOWED_TOOLS = [
  "mcp__argent__describe",
  "mcp__argent__remote",
  "mcp__argent__keyboard",
  "mcp__argent__screenshot",
  "mcp__argent__list-devices",
].map((t) => t);

/**
 * Fixed system prompt. Tuned to drive Vega from the `describe` text tree (the path the
 * transport change targets). Do not branch on argent version.
 */
export const SYSTEM_PROMPT = [
  "You control an Amazon Fire TV (Vega) device through the `argent` MCP tools.",
  "The target app is already launched and showing its home screen.",
  "",
  "Tools:",
  "- `describe` returns the on-screen element tree with focus/selection state. Call it to OBSERVE before and after acting. Never guess what is on screen.",
  "- `remote` presses TV remote / D-pad buttons (up/down/left/right/select/back/home/menu/playPause). Pass a single button or a path of buttons. Vega is remote-driven: there is no tapping.",
  "- `keyboard` types text into the focused field.",
  "",
  "Method: observe with `describe`, decide the next D-pad move toward the goal, press it with `remote`, then observe again to confirm focus moved as expected. Work in small steps.",
  "Stop as soon as the goal screen is reached and confirmed by a `describe` call. Do not take extra actions after the goal is reached.",
  "",
  "IMPORTANT: Emit EXACTLY ONE tool call per turn. Never request more than one tool in the same message — wait for each tool result before deciding the next call. (You may still pass a multi-button path to a single `remote` call; that is one tool call.)",
].join("\n");

/** How often to poll the trial MCP log for goal satisfaction (ms). */
export const GOAL_POLL_MS = 300;

/**
 * Settle delay after restart-app before starting a trial (ms). Gives the app time to
 * reach home and lets Vega's automation toolkit (binds at launch) attach so the first
 * `describe` returns a populated tree.
 */
export const SETTLE_MS = 2500;
