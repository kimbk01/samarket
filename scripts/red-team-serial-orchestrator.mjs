#!/usr/bin/env node
/**
 * Serial red-team orchestrator — one VIEWER lock for the whole suite.
 * Order fixed; never runs room-unread + badge-lifecycle in parallel.
 *
 *   node --env-file=.env.local scripts/red-team-serial-orchestrator.mjs
 *
 * DO NOT: declare PRODUCT PASS / HARD LOCK from this script alone.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { withRedTeamViewerLock } from "./qa/lib/red-team-viewer-lock.mjs";

const ROOT = process.cwd();
const VIEWER = process.env.ROOM_UNREAD_VIEWER_ID || "35dd245c-d398-4ea3-93a0-c0eda37cc777";
const OUT = join(ROOT, ".qa-logs/messenger-final-stabilization-9897fb328/red-team-serial");
mkdirSync(OUT, { recursive: true });

const STEPS = [
  {
    id: "room_unread_authority_matrix",
    cmd: ["node", "--env-file=.env.local", "scripts/room-unread-authority-runtime-matrix.mjs"],
  },
  {
    id: "badge_lifecycle_transition",
    cmd: ["npx", "tsx", "--env-file=.env.local", "scripts/badge-lifecycle-transition-runtime.ts"],
  },
];

function runStep(step) {
  console.log(`\n=== SERIAL ${step.id} ===`);
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      RED_TEAM_LOCK_NESTED: "1",
      RED_TEAM_LOCK_HELD_BY_ORCHESTRATOR: String(process.pid),
      RED_TEAM_ORCHESTRATOR: "1",
    },
    maxBuffer: 20 * 1024 * 1024,
  });
  const logPath = join(OUT, `${step.id}.log`);
  writeFileSync(logPath, `${r.stdout || ""}\n${r.stderr || ""}`);
  const pass = r.status === 0;
  console.log(`[${step.id}] exit=${r.status} pass=${pass} log=${logPath}`);
  if (!pass) {
    const tail = `${r.stdout || ""}\n${r.stderr || ""}`.trim().split("\n").slice(-50).join("\n");
    console.log(tail);
  }
  return { id: step.id, pass, status: r.status, log: logPath };
}

async function mainUnlocked() {
  const results = [];
  for (const step of STEPS) {
    const res = runStep(step);
    results.push(res);
    if (!res.pass) break;
  }

  const serverPass = results.length === STEPS.length && results.every((r) => r.pass);
  const verdict = {
    generated_at: new Date().toISOString(),
    mode: "serial_red_team",
    viewer: VIEWER,
    pass: serverPass,
    red_team_pass_candidate: serverPass,
    product_pass: false,
    hard_lock: false,
    results,
    note:
      "Server/RPC serial layers only in this orchestrator. Device cold/resume formula is a separate gate. PRODUCT PASS / HARD LOCK remain blocked.",
  };
  writeFileSync(join(OUT, "VERDICT.json"), JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
  return serverPass;
}

async function main() {
  // Drop stale lock file if any dead holder
  const lockFile = join(ROOT, ".qa-logs/red-team-locks", `${VIEWER}.lock`);
  if (existsSync(lockFile)) {
    try {
      rmSync(lockFile);
    } catch {
      /* acquire will handle live holders */
    }
  }
  if (existsSync(join(OUT, "VERDICT.json"))) {
    try {
      rmSync(join(OUT, "VERDICT.json"));
    } catch {
      /* ignore */
    }
  }

  const ok = await withRedTeamViewerLock(
    { viewerId: VIEWER, owner: "red-team-serial-orchestrator", script: import.meta.url },
    mainUnlocked
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(e?.code === "RED_TEAM_LOCK_HELD" ? 3 : 1);
});
