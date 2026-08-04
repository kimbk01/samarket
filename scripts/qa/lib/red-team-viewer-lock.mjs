/**
 * Red-team ownership lock — fail immediately if the same VIEWER is mutated in parallel.
 * No sleep/retry to "win" the lock. Stale locks (dead pid) may be replaced once.
 *
 *   import { withRedTeamViewerLock } from "./qa/lib/red-team-viewer-lock.mjs";
 *   await withRedTeamViewerLock({ viewerId, owner: "script-name" }, async () => { ... });
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCK_DIR = join(process.cwd(), ".qa-logs", "red-team-locks");

function lockPath(viewerId) {
  const safe = String(viewerId || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(LOCK_DIR, `${safe}.lock`);
}

function pidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === "EPERM";
  }
}

/**
 * @returns {() => void} release
 */
export function acquireRedTeamViewerLock(opts) {
  const viewerId = String(opts?.viewerId || "").trim();
  const owner = String(opts?.owner || "unknown");
  if (!viewerId) {
    throw new Error("RED_TEAM_LOCK: viewerId required");
  }

  // Nested under serial orchestrator: require parent lock, do not re-acquire.
  if (process.env.RED_TEAM_LOCK_NESTED === "1") {
    const parentPid = Number(process.env.RED_TEAM_LOCK_HELD_BY_ORCHESTRATOR || 0);
    const path = lockPath(viewerId);
    if (!existsSync(path) || !pidAlive(parentPid)) {
      const err = new Error(
        `RED_TEAM_LOCK_NESTED_WITHOUT_PARENT viewer=${viewerId} parentPid=${parentPid || "none"}`
      );
      err.code = "RED_TEAM_LOCK_HELD";
      throw err;
    }
    let existing = null;
    try {
      existing = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      existing = null;
    }
    if (Number(existing?.pid) !== parentPid) {
      const err = new Error(
        `RED_TEAM_LOCK_NESTED_MISMATCH viewer=${viewerId} lockPid=${existing?.pid} parentPid=${parentPid}`
      );
      err.code = "RED_TEAM_LOCK_HELD";
      throw err;
    }
    return () => {};
  }

  mkdirSync(LOCK_DIR, { recursive: true });
  const path = lockPath(viewerId);
  const payload = {
    pid: process.pid,
    owner,
    viewerId,
    script: opts?.script || process.argv[1] || null,
    acquired_at: new Date().toISOString(),
  };

  const tryWriteExclusive = () => {
    writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
  };

  try {
    tryWriteExclusive();
  } catch (e) {
    if (!e || e.code !== "EEXIST") throw e;
    let existing = null;
    try {
      existing = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      existing = null;
    }
    const heldPid = Number(existing?.pid);
    if (pidAlive(heldPid)) {
      const err = new Error(
        `RED_TEAM_LOCK_HELD viewer=${viewerId} owner=${existing?.owner || "?"} pid=${heldPid} (refusing parallel mutation)`
      );
      err.code = "RED_TEAM_LOCK_HELD";
      err.existing = existing;
      throw err;
    }
    // Stale lock (dead process) — replace once. Still no retry loop against a live holder.
    try {
      unlinkSync(path);
    } catch {
      /* ignore */
    }
    try {
      tryWriteExclusive();
    } catch (e2) {
      if (e2 && e2.code === "EEXIST") {
        const err = new Error(
          `RED_TEAM_LOCK_HELD viewer=${viewerId} (lost race replacing stale lock — another harness acquired)`
        );
        err.code = "RED_TEAM_LOCK_HELD";
        throw err;
      }
      throw e2;
    }
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      if (!existsSync(path)) return;
      const cur = JSON.parse(readFileSync(path, "utf8"));
      if (Number(cur?.pid) === process.pid) unlinkSync(path);
    } catch {
      /* ignore */
    }
  };

  process.once("exit", release);
  process.once("SIGINT", () => {
    release();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    release();
    process.exit(143);
  });

  return release;
}

export async function withRedTeamViewerLock(opts, fn) {
  const release = acquireRedTeamViewerLock(opts);
  try {
    return await fn();
  } finally {
    release();
  }
}
