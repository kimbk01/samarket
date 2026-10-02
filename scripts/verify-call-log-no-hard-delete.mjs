/**
 * WP-8 / NEW-08 (LOCK-04) 게이트 — 앱 코드가 공유 call_log 를 물리 삭제하지 못하게 막는다.
 *
 * 통화기록 삭제는 DELETE_FOR_ME(사용자별 숨김 = community_messenger_call_log_user_hides)만
 * 허용한다. community_messenger_call_logs 에 대한 .delete() 는 0건이어야 한다.
 * (물리 삭제는 WP-13 retention authority/마이그레이션에서만.)
 *
 * Usage: npm run verify:call-log-no-hard-delete
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_EXT = new Set([".ts", ".tsx"]);
const SKIP_DIR = new Set(["__tests__", "node_modules", ".next", "dist"]);
const SKIP_FILE = /\.(test|spec)\.(ts|tsx)$/;

const TABLE = "community_messenger_call_logs";
/** 같은 쿼리 체인으로 간주할 최대 창(문자). from(...) 이후 이 안에 .delete( 가 오면 위반. */
const WINDOW = 240;

/** @type {string[]} */
const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(entry.name)) continue;
      walk(path.join(dir, entry.name));
      continue;
    }
    if (!SCAN_EXT.has(path.extname(entry.name))) continue;
    if (SKIP_FILE.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const src = fs.readFileSync(full, "utf8");
    let idx = src.indexOf(TABLE);
    while (idx !== -1) {
      const window = src.slice(idx, idx + WINDOW);
      if (/\.delete\s*\(/.test(window)) {
        const line = src.slice(0, idx).split("\n").length;
        violations.push(`${path.relative(ROOT, full)}:${line}`);
      }
      idx = src.indexOf(TABLE, idx + TABLE.length);
    }
  }
}

for (const d of SCAN_DIRS) {
  const abs = path.join(ROOT, d);
  if (fs.existsSync(abs)) walk(abs);
}

if (violations.length) {
  console.error(
    "[verify:call-log-no-hard-delete] FAIL — community_messenger_call_logs 에 대한 .delete() 발견.\n" +
      "통화기록은 DELETE_FOR_ME(community_messenger_call_log_user_hides 숨김)만 허용한다 (NEW-08/LOCK-04).\n" +
      violations.map((v) => `  - ${v}`).join("\n")
  );
  process.exit(1);
}

console.log("[verify:call-log-no-hard-delete] OK — no hard delete on community_messenger_call_logs.");
