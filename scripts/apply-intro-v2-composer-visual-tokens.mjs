#!/usr/bin/env node
/**
 * Apply ONLY 20270328120000_intro_v2_composer_visual_tokens
 * via linked CLI. Does NOT run `supabase db push`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270328120000_intro_v2_composer_visual_tokens.sql";
const VERSION = "20270328120000";
const NAME = "intro_v2_composer_visual_tokens";

function assertApprovedSql(sql) {
  const upper = sql
    .split(/\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toUpperCase();
  for (const bad of ["DROP TABLE", "TRUNCATE", "DROP SCHEMA", "DROP POLICY", "VERCEL --PROD"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  if (/CREATE\s+TABLE/i.test(sql) || /ALTER\s+TABLE/i.test(sql)) {
    throw new Error("must not create/alter tables");
  }
  for (const must of ["intro_v2_cta_ok", "intro_v2_layer_ok", "heightPct", "fontSizePct", "CREATE OR REPLACE FUNCTION"]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
  }
}

function runLinkedSqlFile(absPath, label) {
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", absPath], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 20 * 1024 * 1024,
    env: process.env,
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  if (r.status !== 0) {
    console.error(`[FAIL] ${label}`);
    console.error(out.replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]"));
    process.exit(r.status || 1);
  }
  return out;
}

function runLinkedSqlText(sql, label) {
  const tmp = resolve(process.cwd(), `.tmp-intro-v2-composer-${process.pid}-${Date.now()}.sql`);
  writeFileSync(tmp, sql, "utf8");
  try {
    return runLinkedSqlFile(tmp, label);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

const abs = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
const sql = readFileSync(abs, "utf8");
assertApprovedSql(sql);

const already = runLinkedSqlText(
  `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${VERSION}';`,
  "check schema_migrations"
);
if (already.includes(VERSION)) {
  console.log(`[SKIP] ${VERSION} already in schema_migrations`);
  process.exit(0);
}

console.log(`[APPLY] ${MIGRATION_FILE}`);
const applyOut = runLinkedSqlFile(abs, "apply composer visual tokens");
mkdirSync(resolve(process.cwd(), ".tmp/intro-v2-phase2-reconstruction"), { recursive: true });
writeFileSync(
  resolve(process.cwd(), ".tmp/intro-v2-phase2-reconstruction/APPLY_VISUAL_TOKENS.log"),
  applyOut,
  "utf8"
);

runLinkedSqlText(
  `INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('${VERSION}', '${NAME}')
   ON CONFLICT (version) DO NOTHING;`,
  "record schema_migrations"
);

const check = runLinkedSqlText(
  `SELECT json_build_object(
     'migration', (
       SELECT version FROM supabase_migrations.schema_migrations WHERE version='${VERSION}'
     ),
     'old_cta_ok', public.intro_v2_cta_ok('{"enabled":false,"destination":{"type":"COMMUNITY"}}'::jsonb),
     'new_cta_ok', public.intro_v2_cta_ok('{"enabled":true,"destination":{"type":"COMMUNITY"},"label":"시작하기","xPct":50,"yPct":86,"widthPct":56,"heightPct":8,"fontSizePct":3.2,"fontWeight":700,"cornerRadiusPct":24,"opacity":1,"align":"center"}'::jsonb),
     'old_layer_ok', public.intro_v2_layer_ok('{"id":"hero","type":"IMAGE","zIndex":1,"anchor":"center","widthPct":80,"assetId":"a1"}'::jsonb),
     'new_layer_ok', public.intro_v2_layer_ok('{"id":"hero","type":"TEXT","zIndex":2,"anchor":"center","name":"제목","xPct":50,"yPct":72,"widthPct":70,"heightPct":12,"fontSizePct":4.2,"fontWeight":700,"lineHeight":1.3,"textAlign":"center","text":"안녕"}'::jsonb),
     'unknown_cta', public.intro_v2_cta_ok('{"enabled":false,"cssPx":12}'::jsonb),
     'unknown_layer', public.intro_v2_layer_ok('{"id":"hero","type":"IMAGE","zIndex":1,"anchor":"center","widthPct":80,"assetId":"a1","cssPx":12}'::jsonb)
   );`,
  "post-apply function check"
);
console.log(check);
console.log("[OK] intro v2 composer visual tokens applied");
