/**
 * BN12-C — PASS0 E2E seed·auth·room id 한 번에 준비.
 *
 * 순서:
 *  1. ensure-e2e-aaaa-manual-auth (Supabase aaaa@manual.local)
 *  2. apply-community-seed-and-trade-room (E2E_SNAPSHOT_DIAG_ROOM_ID)
 *  3. (선택) create-cm-storage-state — SKIP_CM_STORAGE=1 로 생략
 *
 * dev 서버가 떠 있으면 test-login 으로 e2eUserId 매칭이 더 정확함.
 *
 * 실행: node scripts/prepare-cm-pass0-e2e.mjs
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repoRoot = process.cwd();

function runNode(scriptRel, env = {}) {
  const script = resolve(repoRoot, scriptRel);
  const r = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`${scriptRel} exited ${r.status ?? "unknown"}`);
  }
  return r.stdout;
}

function parseSeedStdout(stdout) {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line.startsWith("{")) continue;
    try {
      return JSON.parse(line);
    } catch {
      /* multi-line JSON — try block from first { */
    }
  }
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(stdout.slice(start, end + 1));
  }
  return null;
}

async function main() {
  runNode("scripts/ensure-e2e-aaaa-manual-auth.mjs");

  const seedOut = runNode("scripts/apply-community-seed-and-trade-room.mjs");
  const seedJson = parseSeedStdout(seedOut);
  const roomId = seedJson?.E2E_SNAPSHOT_DIAG_ROOM_ID ?? seedJson?.roomWire?.roomId ?? null;

  let storageStatePath = null;
  if (process.env.SKIP_CM_STORAGE !== "1") {
    try {
      runNode("tests/e2e/scripts/create-cm-storage-state.mjs");
      storageStatePath = "tests/e2e/.auth/cm-storage.json";
    } catch (e) {
      console.warn("[prepare-cm-pass0-e2e] storageState skipped:", String(e));
    }
  }

  const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
  const pass = process.env.E2E_TEST_PASSWORD ?? "1234";

  const runCmd =
    `PLAYWRIGHT_NO_WEBSERVER=1 E2E_TEST_USERNAME=${user} E2E_TEST_PASSWORD=${pass}` +
    (roomId ? ` E2E_SNAPSHOT_DIAG_ROOM_ID=${roomId}` : "") +
    (storageStatePath ? ` PLAYWRIGHT_STORAGE_STATE=${storageStatePath}` : "") +
    ` npx playwright test tests/e2e/messenger-pass0-timeline-capture.spec.ts`;

  console.log(
    JSON.stringify(
      {
        ok: true,
        E2E_SNAPSHOT_DIAG_ROOM_ID: roomId,
        storageStatePath,
        seedSummary: seedJson?.roomWire ?? null,
        playwrightCommand: runCmd,
        notes: [
          `${origin} 에 dev 서버 기동 후 위 playwrightCommand 실행`,
          "목록 비어 있으면 product_chats·community_messenger_participants seed 확인",
        ],
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
