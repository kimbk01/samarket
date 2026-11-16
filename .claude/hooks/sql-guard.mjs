#!/usr/bin/env node
// PreToolUse 훅 — 운영 DB(ckdosyydvgzqwpbwuhon) MCP execute_sql 을 보내기 전에 검사한다.
// 설계: docs/audit/mcp-sql-guard-hook-design-2026-11-16.md
// 훅 자체가 실패하면 통과(작업을 막지 않음) + 경고 한 줄.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROD_PROJECT = "ckdosyydvgzqwpbwuhon";
const CACHE = path.join(os.tmpdir(), "dibay-prod-schema.json");
const TTL_MS = 10 * 60 * 1000;
const REFRESH_ON_MISS_AFTER_MS = 30 * 1000;

const SNAPSHOT_SQL = `begin read only;
set local statement_timeout = '15s';
select n.nspname || '.' || c.relname, a.attname
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where a.attnum > 0 and not a.attisdropped
  and c.relkind in ('r','v','m','f','p')
  and n.nspname not in ('pg_catalog','information_schema','pg_toast')
  and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
order by 1, a.attnum;
rollback;`;

function out(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

function warn(msg) {
  out({ systemMessage: `sql-guard: ${msg} — 검사 없이 통과` });
}

function findDbPassword() {
  if (process.env.SUPABASE_DB_PASSWORD) return process.env.SUPABASE_DB_PASSWORD;
  const dirs = [];
  if (process.env.CLAUDE_PROJECT_DIR) dirs.push(process.env.CLAUDE_PROJECT_DIR);
  try {
    const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    dirs.push(path.dirname(common));
  } catch {
    /* git 없음 */
  }
  for (const d of dirs) {
    try {
      const txt = fs.readFileSync(path.join(d, ".env.local"), "utf8");
      const m = txt.match(/^SUPABASE_DB_PASSWORD=(.*)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

function fetchSnapshot() {
  const pw = findDbPassword();
  if (!pw) throw new Error("SUPABASE_DB_PASSWORD 를 찾지 못함");
  const txt = execFileSync(
    "psql",
    [
      `host=aws-1-ap-south-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.${PROD_PROJECT} sslmode=require connect_timeout=8`,
      "-X",
      "-q",
      "-A",
      "-t",
      "-F",
      "\t",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      SNAPSHOT_SQL,
    ],
    { encoding: "utf8", env: { ...process.env, PGPASSWORD: pw, PGAPPNAME: "sql-guard-schema" }, timeout: 15000, maxBuffer: 64 * 1024 * 1024 }
  );
  const tables = {};
  for (const line of txt.split("\n")) {
    const [t, c] = line.split("\t");
    if (!t || !c) continue;
    (tables[t] ??= []).push(c);
  }
  if (Object.keys(tables).length < 10) throw new Error("스키마 사진이 비어 있음");
  const snap = { fetchedAt: Date.now(), tables };
  try {
    fs.writeFileSync(CACHE, JSON.stringify(snap));
  } catch {
    /* 캐시 실패는 무시 */
  }
  return snap;
}

function loadSnapshot() {
  try {
    const snap = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - snap.fetchedAt < TTL_MS) return snap;
  } catch {
    /* 없음 */
  }
  return fetchSnapshot();
}

async function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }
  const tool = String(input?.tool_name ?? "");
  if (!tool.endsWith("__execute_sql")) process.exit(0);
  if (input?.tool_input?.project_id !== PROD_PROJECT) process.exit(0);
  const sql = String(input?.tool_input?.query ?? "");
  if (!sql.trim()) process.exit(0);

  let analyzeSql;
  try {
    ({ analyzeSql } = await import("./sql-guard-core.mjs"));
  } catch (e) {
    warn(`문법 검사기(libpg-query) 불러오기 실패 (${e?.message ?? e}). npm install 필요`);
  }

  let snap = null;
  let snapErr = null;
  try {
    snap = loadSnapshot();
  } catch (e) {
    snapErr = e;
  }

  let r = await analyzeSql(sql, snap);
  if (r.decision === "deny" && r.problems?.length && snap && Date.now() - snap.fetchedAt > REFRESH_ON_MISS_AFTER_MS) {
    // 방금 적용한 마이그레이션일 수 있음 — 1회 새로 읽고 다시 판단
    try {
      snap = fetchSnapshot();
      r = await analyzeSql(sql, snap);
    } catch {
      /* 기존 판단 유지 */
    }
  }

  if (r.decision === "allow") {
    if (snapErr) warn(`운영 스키마 사진을 읽지 못함 (${snapErr.message}) — 문법·쓰기만 검사함`);
    process.exit(0);
  }
  out({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: r.decision,
      permissionDecisionReason: r.reason,
    },
  });
}

main().catch((e) => warn(`훅 오류 (${e?.message ?? e})`));
