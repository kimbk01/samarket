#!/usr/bin/env node
/**
 * FIN-10 · 운영 함수 드리프트 오프라인 비교 (DB 접속 없음).
 *
 * 커밋된 운영 스냅샷(docs/audit/delivery-owner-2026-10-20/fin10-prod-function-md5.json)의
 * md5(prosrc) 와 저장소 supabase/migrations 의 "최신 정의"(파일명 정렬상 마지막
 * `create [or replace] function public.<name>(`) 본문(달러 인용 태그 사이 원문) md5 를 비교한다.
 *
 * Usage:
 *   node scripts/verify-prod-function-drift.mjs            # report-only (exit 0)
 *   node scripts/verify-prod-function-drift.mjs --strict   # DRIFT/MISSING 있으면 exit 1
 *   node scripts/verify-prod-function-drift.mjs --json     # 결과 JSON 출력
 *   node scripts/verify-prod-function-drift.mjs --snapshot <path>
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const DEFAULT_SNAPSHOT = join(
  ROOT,
  "docs",
  "audit",
  "delivery-owner-2026-10-20",
  "fin10-prod-function-md5.json",
);

const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const asJson = argv.includes("--json");
const snapIdx = argv.indexOf("--snapshot");
const snapshotPath = snapIdx >= 0 && argv[snapIdx + 1] ? resolve(argv[snapIdx + 1]) : DEFAULT_SNAPSHOT;

function md5(s) {
  return createHash("md5").update(s, "utf8").digest("hex");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 한 SQL 파일에서 해당 함수의 모든 정의 본문을 순서대로 추출.
 * 본문 = `AS $tag$` 직후부터 같은 `$tag$` 직전까지의 원문 (= pg_proc.prosrc).
 */
export function extractFunctionBodies(sql, name) {
  const header = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:"?public"?\\.)?"?${escapeRe(name)}"?\\s*\\(`,
    "gi",
  );
  const out = [];
  let m;
  while ((m = header.exec(sql))) {
    const rest = sql.slice(m.index + m[0].length);
    const as = /\bas\s+(\$[A-Za-z0-9_]*\$)/i.exec(rest);
    if (!as) continue;
    const tag = as[1];
    const bodyStart = as.index + as[0].length;
    const bodyEnd = rest.indexOf(tag, bodyStart);
    if (bodyEnd < 0) continue;
    out.push(rest.slice(bodyStart, bodyEnd));
  }
  return out;
}

/** 파일명 정렬 기준 최신 정의 (같은 파일 안에서는 마지막 정의). */
export function latestRepoDefinition(name, files, readFile) {
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const bodies = extractFunctionBodies(readFile(files[i]), name);
    if (bodies.length) return { file: files[i], body: bodies[bodies.length - 1] };
  }
  return null;
}

function main() {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const cache = new Map();
  const readFile = (f) => {
    if (!cache.has(f)) cache.set(f, readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    return cache.get(f);
  };

  const rows = [];
  for (const fn of snapshot.functions) {
    const repo = latestRepoDefinition(fn.name, files, readFile);
    const repoMd5 = repo ? md5(repo.body) : null;
    let status = "MATCH";
    if (!repo) status = "MISSING_IN_REPO";
    else if (repoMd5 !== fn.prod_md5) status = "DRIFT";
    else if (fn.trigger && !["O", "A"].includes(fn.tgenabled)) status = "TRIGGER_DISABLED";
    rows.push({
      name: fn.name,
      prod_md5: fn.prod_md5,
      repo_md5: repoMd5,
      repo_file: repo ? repo.file : null,
      status,
    });
  }

  const bad = rows.filter((r) => r.status !== "MATCH");
  if (asJson) {
    console.log(JSON.stringify({ snapshot: snapshot.captured_at, rows }, null, 2));
  } else {
    console.log(`[verify:prod-function-drift] snapshot=${snapshot.captured_at} project=${snapshot.project}`);
    for (const r of rows) {
      console.log(
        `${r.status.padEnd(15)} ${r.name.padEnd(48)} prod=${r.prod_md5} repo=${r.repo_md5 ?? "-"} ${r.repo_file ?? ""}`,
      );
    }
    console.log(
      `[verify:prod-function-drift] MATCH=${rows.length - bad.length} DRIFT/MISSING=${bad.length}` +
        (bad.length ? ` → ${bad.map((r) => r.name).join(", ")}` : ""),
    );
  }

  if (bad.length && strict) {
    console.error("[verify:prod-function-drift] FAIL (--strict)");
    process.exit(1);
  }
  if (bad.length) console.log("[verify:prod-function-drift] report-only (use --strict to fail)");
  else console.log("[verify:prod-function-drift] PASS");
}

main();
