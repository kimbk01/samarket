#!/usr/bin/env node
/**
 * FIN-10 · 운영 DB ↔ 저장소 테이블·컬럼·함수 드리프트 오프라인 비교 (DB 접속 없음 · 읽기 전용).
 *
 * 저장된 운영 스냅샷(snapshot.sql 결과) ↔ 마이그레이션에서 생성한 매니페스트(required-objects.json).
 * 운영에 없는 필수 객체가 allowlist.json 밖에 있으면 exit 1. 운영에만 있는 객체는 info.
 *
 * Usage:
 *   node scripts/prod-schema-drift/compare.mjs [--snapshot <path>] [--allowlist <path>] [--json] [--extra]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareSchema, unwrapSnapshot } from "./lib.mjs";
import { MANIFEST_PATH, readMigrations, renderManifest } from "./build-manifest.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DEFAULT_SNAPSHOT = join(ROOT, "docs", "audit", "delivery-owner-2026-10-20", "fin10-prod-schema-snapshot.json");
const DEFAULT_ALLOWLIST = join(HERE, "allowlist.json");

const argv = process.argv.slice(2);
const argPath = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : d;
};

const fresh = renderManifest(readMigrations());
let committed = "";
try {
  committed = readFileSync(MANIFEST_PATH, "utf8");
} catch {
  /* missing — fresh manifest is used */
}
if (committed !== fresh) {
  console.warn("[prod-schema-drift] WARN required-objects.json stale — using freshly built manifest (run build-manifest.mjs)");
}
const manifest = JSON.parse(fresh);
const snapshot = unwrapSnapshot(JSON.parse(readFileSync(argPath("--snapshot", DEFAULT_SNAPSHOT), "utf8")));
const allowlist = JSON.parse(readFileSync(argPath("--allowlist", DEFAULT_ALLOWLIST), "utf8"));
for (const e of allowlist.entries ?? []) {
  if (!e.object || !e.reason) {
    console.error(`[prod-schema-drift] allowlist entry needs object + reason: ${JSON.stringify(e)}`);
    process.exit(2);
  }
}
const r = compareSchema(manifest, snapshot, allowlist);
const showExtraFlag = argv.includes("--extra");

if (argv.includes("--json")) {
  console.log(JSON.stringify({ capturedAt: snapshot.captured_at ?? null, ...r }, null, 2));
} else {
  const c = r.counts;
  console.log(`[prod-schema-drift] snapshot captured_at=${snapshot.captured_at ?? "?"}`);
  console.log(
    `[prod-schema-drift] repo: ${c.manifestTables} tables / ${c.manifestColumns} columns / ${c.manifestFunctions} functions · prod: ${c.prodTables} relations / ${c.prodFunctions} functions`,
  );
  const list = (label, xs) => {
    console.log(`  ${label}: ${xs.length}`);
    for (const x of xs) console.log(`    - ${x}`);
  };
  const blocking = new Set(r.blocking);
  const only = (xs) => xs.filter((x) => blocking.has(x));
  list("MISSING tables in prod", only(r.missingTables));
  list("MISSING columns in prod", only(r.missingColumns));
  list("MISSING functions in prod", only(r.missingFunctions));
  console.log(`  allowlisted (missing but intentional): ${r.allowedMissing.length}${showExtraFlag ? "" : " (--extra 로 목록)"}`);
  if (showExtraFlag) for (const a of r.allowedMissing) console.log(`    ~ ${a.object}`);
  const showExtra = showExtraFlag;
  console.log(
    `  info · prod-only: ${r.extra.tables.length} relations, ${r.extra.columns.length} columns, ${r.extra.functions.length} functions${showExtra ? "" : " (--extra 로 목록)"}`,
  );
  if (showExtra) {
    for (const x of [...r.extra.tables, ...r.extra.columns, ...r.extra.functions.map((f) => `${f}()`)]) {
      console.log(`    · ${x}`);
    }
  }
  console.log(
    r.ok ? "[prod-schema-drift] PASS" : `[prod-schema-drift] FAIL — ${r.blocking.length} required object(s) missing in prod`,
  );
}
process.exit(r.ok ? 0 : 1);
