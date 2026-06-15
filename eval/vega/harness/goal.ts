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

interface Line {
  indent: number;
  text: string;
}

/** Split into element lines, keeping indentation (the describe tree is nested by indent). */
function toLines(describeResult: unknown): Line[] {
  return describeToText(describeResult)
    .split("\n")
    .map((raw) => ({ indent: raw.length - raw.trimStart().length, text: raw.trim() }))
    .filter((l) => l.text.length > 0);
}

/** A line + its descendants (subsequent lines indented deeper than it). */
function subtree(lines: Line[], i: number): Line[] {
  const base = lines[i]!.indent;
  const out = [lines[i]!];
  for (let j = i + 1; j < lines.length && lines[j]!.indent > base; j++) out.push(lines[j]!);
  return out;
}

function lineHasFlags(text: string, g: GoalPredicate): boolean {
  if (g.focused === true && !/\[focused\]/i.test(text)) return false;
  if (g.selected === true && !/\[selected\]/i.test(text)) return false;
  return true;
}

/** contains_text / role can be on different lines within the given set. */
function contentInLines(lines: Line[], g: GoalPredicate): boolean {
  if (g.contains_text != null) {
    const needle = g.contains_text.toLowerCase();
    if (!lines.some((l) => l.text.toLowerCase().includes(needle))) return false;
  }
  if (g.role != null) {
    const role = g.role.toLowerCase();
    if (!lines.some((l) => l.text.toLowerCase().includes(role))) return false;
  }
  return true;
}

/** True iff the predicate holds over the describe tree. */
export function matchesGoal(describeResult: unknown, goal: GoalPredicate): boolean {
  return predicateHolds(toLines(describeResult), goal);
}

function scalarHolds(lines: Line[], g: GoalPredicate): boolean {
  const needsFlags = g.focused != null || g.selected != null;
  const needsContent = g.contains_text != null || g.role != null;
  if (!needsFlags && !needsContent) return true;

  if (needsFlags) {
    // The content must live in the SUBTREE of a focused/selected element — so a focused
    // container whose label is a child text node matches (and a phantom focused node whose
    // subtree lacks the text does not).
    for (let i = 0; i < lines.length; i++) {
      if (!lineHasFlags(lines[i]!.text, g)) continue;
      if (!needsContent || contentInLines(subtree(lines, i), g)) return true;
    }
    return false;
  }
  // No flag required: content may be anywhere in the tree.
  return contentInLines(lines, g);
}

function predicateHolds(lines: Line[], g: GoalPredicate): boolean {
  if (!scalarHolds(lines, g)) return false;
  if (g.all_of && !g.all_of.every((sub) => predicateHolds(lines, sub))) return false;
  if (g.any_of && !g.any_of.some((sub) => predicateHolds(lines, sub))) return false;
  return true;
}
