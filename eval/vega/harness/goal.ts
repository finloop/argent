// Evaluate a goal predicate against a `describe` tool result.
//
// The matcher is deliberately tolerant: it coerces the describe result to text and
// matches at the line level (one line ≈ one node), so it survives minor format changes
// in the rendered tree. Scalar keys (contains_text/focused/selected/role) must all hold
// on the SAME line; all_of/any_of compose across the whole tree.
//
// NOTE: predicates are PROVISIONAL until validated against the live app — confirm each
// fires on the real target screen and not before (plan step 3).
import type { GoalPredicate } from "./types.ts";

/** Pull a searchable text blob out of whatever the describe tool logged as `result`. */
export function describeToText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const obj = result as Record<string, unknown>;
    if (typeof obj.description === "string") return obj.description;
    if (typeof obj.source === "string") return obj.source;
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function lineMatchesScalars(line: string, g: GoalPredicate): boolean {
  const l = line.toLowerCase();
  if (g.contains_text != null && !l.includes(g.contains_text.toLowerCase())) return false;
  if (g.role != null && !l.includes(g.role.toLowerCase())) return false;
  if (g.focused === true && !/\[focused\]/i.test(line)) return false;
  if (g.selected === true && !/\[selected\]/i.test(line)) return false;
  return true;
}

function hasScalarKeys(g: GoalPredicate): boolean {
  return (
    g.contains_text != null || g.role != null || g.focused != null || g.selected != null
  );
}

/** True iff the predicate holds over the describe tree. */
export function matchesGoal(describeResult: unknown, goal: GoalPredicate): boolean {
  const lines = describeToText(describeResult)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return predicateHolds(lines, goal);
}

function predicateHolds(lines: string[], g: GoalPredicate): boolean {
  // Scalar part: some single line satisfies all present scalar keys.
  if (hasScalarKeys(g)) {
    if (!lines.some((line) => lineMatchesScalars(line, g))) return false;
  }
  if (g.all_of && !g.all_of.every((sub) => predicateHolds(lines, sub))) return false;
  if (g.any_of && !g.any_of.some((sub) => predicateHolds(lines, sub))) return false;
  return true;
}
