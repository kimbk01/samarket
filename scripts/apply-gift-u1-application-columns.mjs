/**
 * Apply ONLY U1 gift application columns migration to linked Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local
 *
 * Usage:
 *   node --env-file=.env.local scripts/apply-gift-u1-application-columns.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261127150000_gift_certificate_application_u1.sql";
const VERSION = "20261127150000";
const EXPECTED_HOST_FRAGMENT = "ckdosyydvgzqwpbwuhon";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

function buildConnectionString() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const pass = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!pass) return null;
  const pooler =
    process.env.SUPABASE_POOLER_URL?.trim() ||
    "postgresql://postgres.ckdosyydvgzqwpbwuhon@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) u.username = "postgres.ckdosyydvgzqwpbwuhon";
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

function assertApprovedSql(sql) {
  const upper = sql.toUpperCase();
  for (const bad of ["DROP TABLE", "DROP COLUMN", "TRUNCATE", "DELETE FROM"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  if (!/ALTER\s+TABLE\s+public\.gift_certificate_applications/i.test(sql)) {
    throw new Error("MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: missing applications ALTER");
  }
  for (const col of ["requested_purchase_price", "image_url", "rejection_reason"]) {
    if (!sql.includes(col)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: missing ${col}`);
    }
  }
  // Only one table may be altered
  const alters = [...sql.matchAll(/ALTER\s+TABLE\s+([^\s;]+)/gi)].map((m) => m[1].toLowerCase());
  const unexpected = alters.filter((t) => t !== "public.gift_certificate_applications");
  if (unexpected.length) {
    throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: unexpected ALTER ${unexpected.join(",")}`);
  }
}

async function columnProof(client) {
  const { rows } = await client.query(
    `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gift_certificate_applications'
      AND column_name = ANY($1::text[])
    ORDER BY column_name
    `,
    [["requested_purchase_price", "image_url", "rejection_reason"]]
  );
  const by = Object.fromEntries(rows.map((r) => [r.column_name, r]));
  return {
    requested_purchase_price: by.requested_purchase_price || null,
    image_url: by.image_url || null,
    rejection_reason: by.rejection_reason || null,
  };
}

async function main() {
  loadEnvLocal();
  const path = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  assertApprovedSql(sql);

  const plan = {
    migrationPlan: "150000 ONLY",
    approvedMigration: MIGRATION_FILE,
    version: VERSION,
    otherMigrations: "NONE",
  };
  console.log(JSON.stringify({ phase: "PLAN", ...plan }, null, 2));

  const conn = buildConnectionString();
  if (!conn) {
    console.error(
      JSON.stringify({
        phase: "BLOCKED",
        reason: "SAFE_SINGLE_MIGRATION_APPLY_PATH_MISSING_CREDENTIALS",
        need: "SUPABASE_DB_PASSWORD or DATABASE_URL in .env.local",
        note: "Repo path exists (pg + single-file apply). Password not present — will not invent alternate apply.",
      })
    );
    process.exit(3);
  }

  // Host gate: must target approved Production ref
  const host = new URL(conn.replace(/^postgresql:/, "http:")).hostname;
  if (!host.includes(EXPECTED_HOST_FRAGMENT) && !conn.includes(EXPECTED_HOST_FRAGMENT)) {
    console.error(JSON.stringify({ phase: "BLOCKED", reason: "WRONG_DB_HOST", host }));
    process.exit(4);
  }

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // Refuse if this apply would be confused with a bulk push — we only execute this file.
    const before = await columnProof(client);
    console.log(JSON.stringify({ phase: "BEFORE_SCHEMA", columns: before }, null, 2));

    // Skip if already applied
    if (before.requested_purchase_price && before.image_url && before.rejection_reason) {
      console.log(JSON.stringify({ phase: "ALREADY_APPLIED", columns: before }, null, 2));
      return;
    }

    await client.query("BEGIN");
    await client.query(sql);
    let history = { recorded: false, note: null };
    try {
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
         VALUES ($1, $2, ARRAY[]::text[])
         ON CONFLICT DO NOTHING`,
        [VERSION, MIGRATION_FILE]
      );
      history = { recorded: true, note: "version+name+statements" };
    } catch (e1) {
      try {
        await client.query(
          `INSERT INTO supabase_migrations.schema_migrations (version, name)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [VERSION, MIGRATION_FILE]
        );
        history = { recorded: true, note: "version+name" };
      } catch (e2) {
        try {
          await client.query(
            `INSERT INTO supabase_migrations.schema_migrations (version)
             VALUES ($1)
             ON CONFLICT DO NOTHING`,
            [VERSION]
          );
          history = { recorded: true, note: "version_only" };
        } catch (e3) {
          history = {
            recorded: false,
            note: String(e3?.message || e2?.message || e1?.message || e3).slice(0, 200),
          };
        }
      }
    }
    await client.query("COMMIT");

    const after = await columnProof(client);
    const ok =
      after.requested_purchase_price?.data_type === "integer" &&
      after.requested_purchase_price?.is_nullable === "YES" &&
      after.image_url?.data_type === "text" &&
      after.image_url?.is_nullable === "YES" &&
      after.rejection_reason?.data_type === "text" &&
      after.rejection_reason?.is_nullable === "YES";

    console.log(
      JSON.stringify(
        {
          phase: "AFTER_SCHEMA",
          migrationApply: ok ? "PASS" : "FAIL",
          otherMigrationsApplied: "NONE",
          history,
          columns: after,
        },
        null,
        2
      )
    );
    if (!ok) process.exit(1);
    console.log("[apply-gift-u1-application-columns] ok");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
