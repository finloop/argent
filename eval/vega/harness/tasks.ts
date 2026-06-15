// Load golden tasks from eval/vega/tasks/<id>.md (markdown + YAML frontmatter).
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { Task, GoalPredicate } from "./types.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TASKS_DIR = path.resolve(HERE, "..", "tasks");

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function parseTaskFile(filePath: string): Task {
  const raw = fs.readFileSync(filePath, "utf-8");
  const m = FRONTMATTER.exec(raw);
  if (!m) throw new Error(`${filePath}: missing YAML frontmatter (--- ... ---)`);

  const fm = yaml.load(m[1]!) as Record<string, unknown>;
  const instruction = m[2]!.trim();

  const id = String(fm.id ?? path.basename(filePath, ".md"));
  const max_steps = Number(fm.max_steps);
  const max_seconds = Number(fm.max_seconds);
  if (!Number.isFinite(max_steps) || max_steps <= 0)
    throw new Error(`${filePath}: max_steps must be a positive number`);
  if (!Number.isFinite(max_seconds) || max_seconds <= 0)
    throw new Error(`${filePath}: max_seconds must be a positive number`);
  if (!fm.goal || typeof fm.goal !== "object")
    throw new Error(`${filePath}: missing 'goal' predicate`);
  if (!instruction) throw new Error(`${filePath}: empty instruction body`);

  return {
    id,
    max_steps,
    max_seconds,
    goal: fm.goal as GoalPredicate,
    instruction,
    sourcePath: filePath,
  };
}

/** Load all tasks, or a filtered subset by id. Sorted by id for stable ordering. */
export function loadTasks(only?: string[]): Task[] {
  const files = fs
    .readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(TASKS_DIR, f));
  let tasks = files.map(parseTaskFile);
  if (only && only.length) {
    const set = new Set(only);
    tasks = tasks.filter((t) => set.has(t.id));
    const missing = only.filter((id) => !tasks.some((t) => t.id === id));
    if (missing.length) throw new Error(`Unknown task id(s): ${missing.join(", ")}`);
  }
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}
