/**
 * Apply ONLY 20270402120000_app_intro_media_origin_cut_a.sql
 * Does NOT run supabase db push / other migrations.
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-app-intro-media-origin-cut-a.mjs
 */
import { spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_FILE = "20270402120000_app_intro_media_origin_cut_a.sql";
const VERSION = "20270402120000";

function main() {
  const absPath = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  if (!existsSync(absPath)) throw new Error(`missing ${MIGRATION_FILE}`);

  const sql = readFileSync(absPath, "utf8");
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"]) {
    if (sql.toUpperCase().includes(bad)) {
      throw new Error(`Forbidden SQL token: ${bad}`);
    }
  }

  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", absPath],
    { encoding: "utf8", stdio: "inherit" },
  );
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }

  // Record migration version if table exists (best-effort).
  const stamp = spawnSync(
    "npx",
    [
      "supabase",
      "db",
      "query",
      "--linked",
      `insert into supabase_migrations.schema_migrations (version) values ('${VERSION}') on conflict do nothing;`,
    ],
    { encoding: "utf8" },
  );

  const verify = spawnSync(
    "npx",
    [
      "supabase",
      "db",
      "query",
      "--linked",
      `
select column_name, data_type, column_default
from information_schema.columns
where table_schema='public' and table_name='app_intro_media' and column_name='media_origin';

select media_origin, count(*)::int as n
from public.app_intro_media
where deleted_at is null
group by media_origin
order by media_origin;

select live_kind from public.app_intro_live limit 1;
`,
    ],
    { encoding: "utf8" },
  );

  const proof = {
    ok: true,
    version: VERSION,
    stampStatus: stamp.status,
    verifyStdout: verify.stdout,
    verifyStderr: verify.stderr,
  };
  mkdirSync(resolve(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), "tmp/cuta-media-origin-apply-proof.json"),
    JSON.stringify(proof, null, 2),
  );
  console.log(JSON.stringify(proof, null, 2));
}

main();
