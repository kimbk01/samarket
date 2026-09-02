/**
 * Apply ONLY 20261202150000_gift_certificate_offer_messenger_atomic to linked Production DB.
 * Does NOT run `supabase db push`. Does NOT apply other pending migrations.
 *
 * Usage: node --env-file=.env.local scripts/apply-gift-offer-messenger-atomic-migration.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const MIGRATION_FILE = "20261202150000_gift_certificate_offer_messenger_atomic.sql";
const VERSION = "20261202150000";
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
  for (const bad of ["DROP TABLE", "TRUNCATE", "DELETE FROM"]) {
    if (upper.includes(bad)) {
      throw new Error(`MIGRATION CONTENT DIFFERS FROM APPROVED SCOPE: contains ${bad}`);
    }
  }
  for (const must of [
    "INSERT INTO public.community_messenger_messages",
    "messenger_message_id = v_message_id",
    "room_id_required",
    "'transfer_status', 'PENDING'",
    "gift_certificate_offer",
  ]) {
    if (!sql.includes(must)) throw new Error(`missing ${must}`);
  }
}

async function verify(client) {
  const { rows: mig } = await client.query(
    `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1 LIMIT 1`,
    [VERSION]
  );
  const { rows: fn } = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS def
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='gift_certificate_offer'
     LIMIT 1`
  );
  const def = String(fn[0]?.def || "");
  if (!def.includes("INSERT INTO public.community_messenger_messages")) {
    throw new Error("gift_certificate_offer missing messenger message insert");
  }
  if (!def.includes("room_id_required")) {
    throw new Error("gift_certificate_offer missing room_id_required guard");
  }
  return {
    schema_migration_row: mig.length > 0,
    rpc_messenger_atomic: true,
    rpc_signature: "gift_certificate_offer(uuid,uuid,uuid,uuid,text)",
  };
}

async function main() {
  loadEnvLocal();
  const path = resolve(process.cwd(), "supabase/migrations", MIGRATION_FILE);
  const sql = readFileSync(path, "utf8");
  assertApprovedSql(sql);

  const conn = buildConnectionString();
  if (!conn) {
    console.error(
      JSON.stringify({
        phase: "BLOCKED",
        reason: "SAFE_SINGLE_MIGRATION_APPLY_PATH_MISSING_CREDENTIALS",
        need: "SUPABASE_DB_PASSWORD or DATABASE_URL in .env.local",
      })
    );
    process.exit(3);
  }

  const host = new URL(conn.replace(/^postgresql:/, "http:")).hostname;
  if (!host.includes(EXPECTED_HOST_FRAGMENT) && !conn.includes(EXPECTED_HOST_FRAGMENT)) {
    console.error(JSON.stringify({ phase: "BLOCKED", reason: "WRONG_DB_HOST", host }));
    process.exit(4);
  }

  const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    let already = false;
    try {
      const proof = await verify(client);
      already = proof.schema_migration_row && proof.rpc_messenger_atomic;
      if (already) {
        console.log(JSON.stringify({ phase: "ALREADY_APPLIED", proof }, null, 2));
      }
    } catch {
      already = false;
    }

    if (!already) {
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
      const proof = await verify(client);
      console.log(
        JSON.stringify(
          {
            phase: "AFTER_SCHEMA",
            migrationApply: "PASS",
            otherMigrationsApplied: "NONE",
            history,
            proof,
          },
          null,
          2
        )
      );
    }
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
  console.log("[apply-gift-offer-messenger-atomic-migration] ok");
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "FAIL", error: String(e?.message || e) }));
  process.exit(1);
});
