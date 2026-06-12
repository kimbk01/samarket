#!/usr/bin/env node
/**
 * BN14-3 prep — S4 direct cold dev/prod 3회 측정.
 *
 * Usage:
 *   node scripts/measure-cm-s4-direct-cold.mjs --mode=dev
 *   node scripts/measure-cm-s4-direct-cold.mjs --mode=prod
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const modeArg = process.argv.find((a) => a.startsWith("--mode="));
const mode = modeArg?.split("=")[1] ?? "dev";
const runs = process.argv.find((a) => a.startsWith("--runs="))?.split("=")[1] ?? "3";

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function loadRoomIdFromPrepare() {
  const preparePath = path.join(process.cwd(), "scripts", "prepare-cm-pass0-e2e.mjs");
  if (!fs.existsSync(preparePath)) return null;
  const r = spawnSync("node", [preparePath], { encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    const jsonLine = r.stdout.split("\n").find((l) => l.includes("E2E_SNAPSHOT_DIAG_ROOM_ID"));
    if (!jsonLine) return null;
    const m = jsonLine.match(/"E2E_SNAPSHOT_DIAG_ROOM_ID":\s*"([^"]+)"/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

const roomId = process.env.E2E_SNAPSHOT_DIAG_ROOM_ID?.trim() || (await loadRoomIdFromPrepare());
if (!roomId) {
  console.error("[measure-cm-s4] E2E_SNAPSHOT_DIAG_ROOM_ID 없음 — node scripts/prepare-cm-pass0-e2e.mjs 먼저 실행");
  process.exit(1);
}

const baseEnv = {
  PLAYWRIGHT_NO_WEBSERVER: "1",
  E2E_TEST_USERNAME: process.env.E2E_TEST_USERNAME ?? "aaaa",
  E2E_TEST_PASSWORD: process.env.E2E_TEST_PASSWORD ?? "1234",
  E2E_SNAPSHOT_DIAG_ROOM_ID: roomId,
  S4_MEASURE_RUNS: runs,
  CM_S4_MEASURE_MODE: mode,
};

if (mode === "prod") {
  console.log("[measure-cm-s4] prod — build 후 PORT=3001 start 가 이미 떠 있어야 합니다.");
  run("npx", ["playwright", "test", "tests/e2e/messenger-pass0-s4-direct-cold.spec.ts"], {
    ...baseEnv,
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
  });
} else {
  console.log("[measure-cm-s4] dev — npm run dev (localhost:3000) 가 떠 있어야 합니다.");
  run("npx", ["playwright", "test", "tests/e2e/messenger-pass0-s4-direct-cold.spec.ts"], {
    ...baseEnv,
    PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
  });
}
