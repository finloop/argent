// Device/version helpers — shell out to the INSTALLED `argent` CLI (no source imports).
// These go through `argent run` (CLI → tool-server), NOT `argent mcp`, so they do not
// write to the MCP call log and therefore never pollute a trial's measured slice.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Pin the auto-screenshot confound OFF for the run by setting the global
 * `disable-auto-screenshot` flag in ~/.argent/flags.json. Auto-screenshot adds a per-call
 * delay + capture + image tokens after describe/keyboard, which would inflate model-time
 * and tokens and differ in cost on the (often blank on macOS VVD) Vega screen. Set
 * directly via the JSON file so the harness stays independent of CLI flag-command syntax
 * and survives the `rm -rf ~/.argent` performed during each version swap.
 */
export function pinAutoScreenshotOff(): void {
  const dir = path.join(os.homedir(), ".argent");
  const file = path.join(dir, "flags.json");
  fs.mkdirSync(dir, { recursive: true });
  let flags: Record<string, boolean> = {};
  try {
    flags = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    /* no existing flags */
  }
  flags["disable-auto-screenshot"] = true;
  fs.writeFileSync(file, JSON.stringify(flags, null, 2) + "\n");
}

/** `argent --version` of whatever is currently installed on PATH. */
export async function argentVersion(): Promise<string> {
  const { stdout } = await execFileAsync("argent", ["--version"], { timeout: 30_000 });
  return stdout.trim();
}

/** Resolve a Vega device serial via `argent run list-devices --json` (or honor an override). */
export async function resolveVegaSerial(override?: string): Promise<string> {
  if (override) return override;
  const { stdout } = await execFileAsync("argent", ["run", "list-devices", "--json"], {
    timeout: 60_000,
  });
  const parsed = JSON.parse(stdout) as { devices?: Array<Record<string, unknown>> };
  const devices = parsed.devices ?? [];
  const vega = devices.find((d) => d.platform === "vega");
  if (!vega) {
    throw new Error(
      `No Vega device found in list-devices. Start one: \`vega virtual-device start\`. ` +
        `Devices seen: ${JSON.stringify(devices.map((d) => ({ platform: d.platform, serial: d.serial })))}`
    );
  }
  const serial = (vega.serial ?? vega.udid) as string | undefined;
  if (!serial) throw new Error(`Vega device has no serial/udid: ${JSON.stringify(vega)}`);
  return serial;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reset to start state: terminate + relaunch the app (NOT reinstall). Assumes a stateless app.
 *
 * Vega cold-launches the RN bundle slowly (~45s+), and argent SIGKILLs `vega launch-app`
 * at its internal cap — but the on-device launch is already triggered ("Sending: pkg://…")
 * and completes anyway. So we don't trust restart-app's exit code: we kick it off, then poll
 * `describe` until a real (interactive) screen is up.
 */
export async function restartApp(serial: string, appId: string): Promise<void> {
  try {
    await execFileAsync(
      "argent",
      ["run", "restart-app", "--udid", serial, "--bundleId", appId],
      { timeout: 120_000 }
    );
  } catch {
    // The slow launch is often SIGKILLed by argent's cap while still coming up on-device;
    // fall through to the readiness poll rather than failing the trial.
  }
  await waitUntilReady(serial, 75_000);
}

/** Poll describe until the app shows an interactive screen (not blank/mid-launch). */
async function waitUntilReady(serial: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync(
        "argent",
        ["run", "describe", "--udid", serial, "--json"],
        { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }
      );
      const obj = JSON.parse(stdout) as { description?: string };
      const text = obj.description ?? stdout;
      const interactive = (text.match(/\b(button|card|carousel)\b/g) ?? []).length;
      if (interactive >= 5) return; // a real screen is loaded
    } catch (e) {
      lastErr = e;
    }
    await sleep(2500);
  }
  throw new Error(
    `app did not reach an interactive screen within ${timeoutMs}ms` +
      (lastErr instanceof Error ? `: ${lastErr.message}` : "")
  );
}
