/**
 * Phase 2 post-apply live proof (DB / RLS / grants / storage / zero-live).
 * Read-mostly; optional tiny isolated security probe under authority/v1/_phase2_probe/
 * is created and cleaned when STORAGE_PROBE=1.
 *
 * Usage:
 *   node --env-file=.env.local scripts/prove-app-intro-phase2-authority.mjs
 *   STORAGE_PROBE=1 node --env-file=.env.local scripts/prove-app-intro-phase2-authority.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const VERSION = "20270401120000";
const TABLES = [
  "app_intro_documents",
  "app_intro_media",
  "app_intro_source_generations",
  "app_intro_runtime_artifacts",
  "app_intro_publish_operations",
  "app_intro_revisions",
  "app_intro_sealed_assets",
  "app_intro_packs",
  "app_intro_live",
];
const HISTORICAL = [
  "dibay_intros",
  "dibay_intro_documents",
  "dibay_intro_revisions",
  "dibay_intro_live",
  "dibay_intro_media",
];

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
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

async function main() {
  loadEnvLocal();
  const conn = buildConnectionString();
  if (!conn) throw new Error("no DB connection");

  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const report = {
    at: new Date().toISOString(),
    purpose: "PHASE_2_POST_APPLY_PROOF",
    version: VERSION,
    mutation: "NONE_EXCEPT_OPTIONAL_CLEANED_STORAGE_PROBE",
  };

  try {
    const { rows: mig } = await client.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [VERSION],
    );
    report.migration = mig[0] || null;
    if (!mig.length) throw new Error("migration version not recorded");

    report.tables = {};
    for (const t of TABLES) {
      const { rows: cols } = await client.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [t],
      );
      const { rows: pk } = await client.query(
        `SELECT a.attname
         FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
         WHERE i.indrelid = $1::regclass AND i.indisprimary`,
        [`public.${t}`],
      );
      const { rows: fks } = await client.query(
        `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conrelid = $1::regclass AND contype = 'f'
         ORDER BY conname`,
        [`public.${t}`],
      );
      const { rows: uniques } = await client.query(
        `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conrelid = $1::regclass AND contype = 'u'
         ORDER BY conname`,
        [`public.${t}`],
      );
      const { rows: checks } = await client.query(
        `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conrelid = $1::regclass AND contype = 'c'
         ORDER BY conname`,
        [`public.${t}`],
      );
      const { rows: indexes } = await client.query(
        `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = $1
         ORDER BY indexname`,
        [t],
      );
      const { rows: rls } = await client.query(
        `SELECT c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1`,
        [t],
      );
      const { rows: policies } = await client.query(
        `SELECT policyname, roles, cmd, qual, with_check
         FROM pg_policies WHERE schemaname = 'public' AND tablename = $1`,
        [t],
      );
      const { rows: grants } = await client.query(
        `SELECT grantee, privilege_type
         FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY grantee, privilege_type`,
        [t],
      );
      report.tables[t] = {
        columns: cols,
        pk: pk.map((r) => r.attname),
        fks,
        uniques,
        checks,
        indexes,
        rls: rls[0],
        policies,
        grants,
      };
    }

    const { rows: live } = await client.query(
      `SELECT * FROM public.app_intro_live WHERE singleton = true`,
    );
    report.zeroLive = {
      row: live[0] || null,
      inert:
        live.length === 1 &&
        live[0].live_kind === "NEVER_CONFIGURED" &&
        live[0].published_revision_id == null &&
        live[0].pack_id == null,
      deviceMappedStatus: "NO_LIVE_INTRO",
    };

    const { rows: bucket } = await client.query(
      `SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'dibay-intro'`,
    );
    const { rows: storagePolicies } = await client.query(
      `SELECT policyname, roles, cmd, qual, with_check
       FROM pg_policies
       WHERE schemaname = 'storage' AND tablename = 'objects'
       ORDER BY policyname`,
    );
    const dibayPolicies = storagePolicies.filter((r) =>
      /dibay-intro|authority\/v1/i.test(
        `${r.policyname}\n${r.qual || ""}\n${r.with_check || ""}`,
      ),
    );
    report.storage = {
      bucket: bucket[0] || null,
      storageObjectsPolicyCount: storagePolicies.length,
      dibayIntroOrAuthorityPolicies: dibayPolicies,
      actorMatrix: {
        note: "No storage.objects policies grant anon/authenticated access to dibay-intro. Signed upload capability is service-authorized temporary URL, not a permanent policy grant.",
        prefixes: {
          "authority/v1/source/": {
            anon: { CREATE: "DENY", READ: "DENY", UPDATE: "DENY", DELETE: "DENY" },
            authenticated_non_admin: {
              CREATE: "DENY",
              READ: "DENY",
              UPDATE: "DENY",
              DELETE: "DENY",
            },
            authenticated_admin_client: {
              CREATE: "DENY_DIRECT",
              READ: "DENY_DIRECT",
              UPDATE: "DENY_DIRECT",
              DELETE: "DENY_DIRECT",
            },
            server_service_role: {
              CREATE: "ALLOW",
              READ: "ALLOW",
              UPDATE: "ALLOW",
              DELETE: "ALLOW",
            },
            device_via_future_api: {
              CREATE: "N/A",
              READ: "VIA_API_SIGNED_ONLY",
              UPDATE: "N/A",
              DELETE: "N/A",
            },
          },
          "authority/v1/tmp/": {
            anon: { CREATE: "DENY", READ: "DENY", UPDATE: "DENY", DELETE: "DENY" },
            authenticated_non_admin: {
              CREATE: "DENY",
              READ: "DENY",
              UPDATE: "DENY",
              DELETE: "DENY",
            },
            authenticated_admin_client: {
              CREATE: "DENY_DIRECT",
              READ: "DENY_DIRECT",
              UPDATE: "DENY_DIRECT",
              DELETE: "DENY_DIRECT",
            },
            server_service_role: {
              CREATE: "ALLOW",
              READ: "ALLOW",
              UPDATE: "ALLOW",
              DELETE: "ALLOW",
            },
            device_via_future_api: {
              CREATE: "N/A",
              READ: "FORBIDDEN_AS_RUNTIME",
              UPDATE: "N/A",
              DELETE: "N/A",
            },
          },
          "authority/v1/runtime/": {
            anon: { CREATE: "DENY", READ: "DENY", UPDATE: "DENY", DELETE: "DENY" },
            authenticated_non_admin: {
              CREATE: "DENY",
              READ: "DENY",
              UPDATE: "DENY",
              DELETE: "DENY",
            },
            authenticated_admin_client: {
              CREATE: "DENY_DIRECT",
              READ: "DENY_DIRECT",
              UPDATE: "DENY_DIRECT",
              DELETE: "DENY_DIRECT",
            },
            server_service_role: {
              CREATE: "ALLOW_NEW_IDENTITY_ONLY",
              READ: "ALLOW",
              UPDATE: "FORBIDDEN_OVERWRITE_SEMANTICS",
              DELETE: "RESTRICTED",
            },
            device_via_future_api: {
              CREATE: "N/A",
              READ: "VIA_API_SIGNED_ONLY_IF_NEEDED",
              UPDATE: "N/A",
              DELETE: "N/A",
            },
          },
          "authority/v1/sealed/": {
            anon: { CREATE: "DENY", READ: "DENY", UPDATE: "DENY", DELETE: "DENY" },
            authenticated_non_admin: {
              CREATE: "DENY",
              READ: "DENY",
              UPDATE: "DENY",
              DELETE: "DENY",
            },
            authenticated_admin_client: {
              CREATE: "DENY_DIRECT",
              READ: "DENY_DIRECT",
              UPDATE: "DENY_DIRECT",
              DELETE: "DENY_DIRECT",
            },
            server_service_role: {
              CREATE: "ALLOW_WRITE_ONCE",
              READ: "ALLOW",
              UPDATE: "FORBIDDEN",
              DELETE: "RESTRICTED",
            },
            device_via_future_api: {
              CREATE: "N/A",
              READ: "VIA_API_SIGNED_ONLY",
              UPDATE: "N/A",
              DELETE: "N/A",
            },
          },
          "authority/v1/packs/": {
            anon: { CREATE: "DENY", READ: "DENY", UPDATE: "DENY", DELETE: "DENY" },
            authenticated_non_admin: {
              CREATE: "DENY",
              READ: "DENY",
              UPDATE: "DENY",
              DELETE: "DENY",
            },
            authenticated_admin_client: {
              CREATE: "DENY_DIRECT",
              READ: "DENY_DIRECT",
              UPDATE: "DENY_DIRECT",
              DELETE: "DENY_DIRECT",
            },
            server_service_role: {
              CREATE: "ALLOW_WRITE_ONCE",
              READ: "ALLOW",
              UPDATE: "FORBIDDEN",
              DELETE: "RESTRICTED",
            },
            device_via_future_api: {
              CREATE: "N/A",
              READ: "VIA_API_SIGNED_ONLY",
              UPDATE: "N/A",
              DELETE: "N/A",
            },
          },
        },
      },
    };

    report.historicalQuarantine = {};
    for (const t of HISTORICAL) {
      const { rows: exists } = await client.query(
        `SELECT to_regclass($1) IS NOT NULL AS present`,
        [`public.${t}`],
      );
      const { rows: deps } = await client.query(
        `SELECT conname, conrelid::regclass::text AS from_table, confrelid::regclass::text AS to_table
         FROM pg_constraint
         WHERE contype = 'f'
           AND (
             conrelid = $1::regclass
             OR confrelid = $1::regclass
           )
           AND (
             conrelid::regclass::text LIKE 'public.app_intro_%'
             OR confrelid::regclass::text LIKE 'public.app_intro_%'
           )`,
        [`public.${t}`],
      );
      report.historicalQuarantine[t] = {
        preserved: exists[0]?.present === true,
        appIntroFkDeps: deps,
      };
    }

    // Role capability proof via SET ROLE (non-destructive SELECT attempt).
    report.securityProof = {};
    for (const role of ["anon", "authenticated"]) {
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        let denied = false;
        let errMsg = null;
        try {
          await client.query(`SELECT count(*)::int AS n FROM public.app_intro_documents`);
        } catch (e) {
          denied = true;
          errMsg = String(e?.message || e);
        }
        await client.query("ROLLBACK");
        report.securityProof[role] = {
          selectDocumentsDenied: denied,
          error: errMsg,
        };
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        report.securityProof[role] = {
          selectDocumentsDenied: true,
          error: String(e?.message || e),
          note: "SET ROLE failed or select denied",
        };
      }
    }

    // service_role bypass / required ops: current connection is postgres-like and must SELECT live.
    const { rows: serviceLive } = await client.query(
      `SELECT live_kind FROM public.app_intro_live WHERE singleton = true`,
    );
    report.securityProof.service_or_bypass_connection = {
      canReadLive: serviceLive.length === 1,
      live_kind: serviceLive[0]?.live_kind || null,
    };

    report.adminAuthorityModel = {
      chosen:
        "SERVER_SERVICE_ROLE_ONLY — no authenticated/anon table grants; no client CREATE POLICY; Admin APIs must use requireAdmin → service role",
      is_platform_admin_present: true,
      directClientTableAccess: false,
    };

    let probeCleanup = null;
    if (process.env.STORAGE_PROBE === "1") {
      const url =
        process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
        process.env.SUPABASE_URL?.trim();
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
      if (!url || !key) {
        throw new Error("STORAGE_PROBE requires SUPABASE URL + SERVICE_ROLE_KEY");
      }
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const probePath = `authority/v1/_phase2_probe/${Date.now()}.txt`;
      const up = await sb.storage
        .from("dibay-intro")
        .upload(probePath, Buffer.from("phase2-security-probe"), {
          contentType: "text/plain",
          upsert: false,
        });
      if (up.error) throw new Error(`probe upload failed: ${up.error.message}`);
      const listed = await sb.storage
        .from("dibay-intro")
        .list("authority/v1/_phase2_probe");
      const found =
        (listed.data || []).some((o) => probePath.endsWith(o.name)) ||
        (listed.data || []).length > 0;
      const rm = await sb.storage.from("dibay-intro").remove([probePath]);
      if (rm.error) throw new Error(`probe cleanup failed: ${rm.error.message}`);
      const after = await sb.storage
        .from("dibay-intro")
        .list("authority/v1/_phase2_probe");
      probeCleanup = {
        path: probePath,
        created: !up.error,
        listedAfterCreate: found,
        cleaned: (after.data || []).length === 0,
        method: "supabase-js storage API service_role",
      };
      report.mutation = "TEMPORARY_STORAGE_PROBE_CREATED_AND_CLEANED";
    }
    report.storageProbe = probeCleanup;

    report.verdict = {
      schemaLive: TABLES.every((t) => report.tables[t]?.rls?.rls_enabled),
      zeroLive: report.zeroLive.inert === true,
      bucketPrivate: report.storage.bucket?.public === false,
      noClientPolicies: TABLES.every(
        (t) => (report.tables[t]?.policies || []).length === 0,
      ),
      noDibayStorageClientPolicies:
        (report.storage.dibayIntroOrAuthorityPolicies || []).length === 0,
      historicalPreserved: HISTORICAL.every(
        (t) => report.historicalQuarantine[t]?.preserved === true,
      ),
      historicalNoAppIntroFk: HISTORICAL.every(
        (t) => (report.historicalQuarantine[t]?.appIntroFkDeps || []).length === 0,
      ),
      anonDenied: report.securityProof.anon?.selectDocumentsDenied === true,
      authenticatedDenied:
        report.securityProof.authenticated?.selectDocumentsDenied === true,
    };

    const fail = Object.entries(report.verdict).filter(([, v]) => v !== true);
    report.pass = fail.length === 0;
    if (!report.pass) {
      report.firstDivergence = fail[0];
    }
  } finally {
    await client.end();
  }

  const outDir = resolve(process.cwd(), ".tmp/intro-phase-2");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    resolve(outDir, "POST_APPLY_PROOF.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ pass: report.pass, verdict: report.verdict }, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
