// Preflight: prove the INSTALLED argent exposes the surface the eval depends on, BEFORE
// running trials — so an incompatible version (e.g. a pre-Vega build, or one whose MCP log
// format changed) fails loudly with its version string instead of silently producing a
// run where every trial just "times out".
//
// Checks:
//   1. argent --version is readable.
//   2. list-devices reports a Vega device (done by the caller via resolveVegaSerial).
//   3. `argent mcp` honors ARGENT_MCP_LOG and emits the JSONL the decomposition reads:
//      a probe `describe` against the Vega device must (a) return a populated tree and
//      (b) leave a tool_called + tool_result{durationMs:number, ts:ISO} pair in the log.
//   4. The disable-auto-screenshot flag file was written (confound pin).
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { readLog } from "./mcplog.ts";
import { restartApp } from "./device.ts";
import { APP_ID } from "./config.ts";

export class PreflightError extends Error {}

/** Minimal newline-delimited JSON-RPC exchange with `argent mcp` over stdio. */
async function probeMcpDescribe(
  serial: string,
  logPath: string,
  timeoutMs = 45_000
): Promise<{ toolNames: string[]; describeText: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("argent", ["mcp"], {
      env: { ...process.env, ARGENT_MCP_LOG: logPath },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buf = "";
    let toolNames: string[] = [];
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new PreflightError(`argent mcp probe timed out after ${timeoutMs}ms\n${stderr.slice(-500)}`));
    }, timeoutMs);

    const send = (msg: object) => child.stdin.write(JSON.stringify(msg) + "\n");
    const finish = (fn: () => void) => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      fn();
    };

    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) =>
      finish(() => reject(new PreflightError(`failed to spawn argent mcp: ${e.message}`)))
    );

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue; // banners / non-JSON
        }
        if (msg.id === 1 && msg.result) {
          // initialized → ask for the tool list, then call describe
          send({ jsonrpc: "2.0", method: "notifications/initialized" });
          send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
        } else if (msg.id === 2 && msg.result) {
          toolNames = (msg.result.tools ?? []).map((t: { name: string }) => t.name);
          send({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "describe", arguments: { udid: serial, includeImageInContext: false } },
          });
        } else if (msg.id === 3) {
          if (msg.error) {
            finish(() => reject(new PreflightError(`describe call failed: ${JSON.stringify(msg.error)}`)));
            return;
          }
          const content = msg.result?.content ?? [];
          const text = content
            .filter((c: { type: string }) => c.type === "text")
            .map((c: { text: string }) => c.text)
            .join("\n");
          finish(() => resolve({ toolNames, describeText: text }));
          return;
        }
      }
    });

    // kick off the handshake
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "vega-eval-preflight", version: "0.1.0" },
      },
    });
  });
}

export interface PreflightReport {
  version: string;
  serial: string;
  toolsPresent: string[];
  notes: string[];
}

/**
 * Run all preflight checks. Throws PreflightError (with the version string) on the first
 * failure. `version` and `serial` are resolved by the caller and passed in.
 */
export async function preflight(version: string, serial: string): Promise<PreflightReport> {
  const notes: string[] = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vega-eval-preflight-"));
  const logPath = path.join(tmp, "probe.mcplog.jsonl");

  try {
    // Launch the app first so the automation toolkit (binds at launch) is attached —
    // otherwise the probe describe can come back empty and falsely fail preflight.
    await restartApp(serial, APP_ID);
    const { toolNames, describeText } = await probeMcpDescribe(serial, logPath);

    // (3a) describe returned a populated Vega tree
    if (!/ROOT|Screen|button|text/i.test(describeText)) {
      throw new PreflightError(
        `argent ${version}: probe describe on the Vega device returned no usable element tree. ` +
          `Is this a Vega-capable build? (Vega support exists only since 2026-06-11.)`
      );
    }
    // tool surface sanity
    for (const t of ["describe", "remote", "keyboard"]) {
      if (!toolNames.includes(t)) notes.push(`warning: tool "${t}" not in tools/list`);
    }

    // (3b) the MCP log is in the format the decomposition + goal-detection read
    const entries = readLog(logPath);
    const called = entries.find((e) => e.event === "tool_called");
    const result = entries.find((e) => e.event === "tool_result");
    if (!called || !result) {
      throw new PreflightError(
        `argent ${version}: ARGENT_MCP_LOG did not produce tool_called/tool_result entries. ` +
          `This version's MCP log format is incompatible — decomposition and goal detection would silently fail.`
      );
    }
    if (typeof result.durationMs !== "number" || Number.isNaN(Date.parse(result.ts))) {
      throw new PreflightError(
        `argent ${version}: MCP log entries lack a numeric durationMs / ISO ts ` +
          `(${JSON.stringify({ durationMs: result.durationMs, ts: result.ts })}). Decomposition would be wrong.`
      );
    }

    // (4) auto-screenshot confound pinned
    const flagsFile = path.join(os.homedir(), ".argent", "flags.json");
    let flagged = false;
    try {
      flagged = JSON.parse(fs.readFileSync(flagsFile, "utf-8"))["disable-auto-screenshot"] === true;
    } catch {
      /* missing */
    }
    if (!flagged) notes.push("warning: disable-auto-screenshot flag not set — auto-screenshot confound NOT pinned");

    return { version, serial, toolsPresent: toolNames, notes };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
