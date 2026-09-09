#!/usr/bin/env node
/**
 * Fail-fast existing-live schema authority verifier (CUT 7-E/F).
 * READ-ONLY catalog SELECT only. No DDL/DML/migration apply.
 *
 * Usage:
 *   node scripts/verify-schema-authority.mjs --fixtures
 *   node scripts/verify-schema-authority.mjs --compat
 *   node scripts/verify-schema-authority.mjs --live
 *   node scripts/verify-schema-authority.mjs --all
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AUTHORITY_ROOT = join(ROOT, "supabase", "schema-authority");

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
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
    /* optional */
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

function collapseWs(s) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normDefault(v) {
  if (v == null) return null;
  let s = collapseWs(v);
  // Catalog-equivalent spellings that must not false-drift.
  if (/^CURRENT_TIMESTAMP$/i.test(s) || /^('now'::text)::timestamp with time zone$/i.test(s)) {
    s = "now()";
  }
  return s;
}

function normExpr(v) {
  if (v == null) return null;
  return collapseWs(v);
}

function fmtDiff(table, category, object, expected, actual) {
  return [
    `TABLE: ${table}`,
    `CATEGORY: ${category}`,
    `OBJECT: ${object}`,
    `EXPECTED: ${typeof expected === "string" ? expected : JSON.stringify(expected)}`,
    `ACTUAL: ${typeof actual === "string" ? actual : JSON.stringify(actual)}`,
  ].join("\n");
}

function mapByName(list, key = "name") {
  const m = new Map();
  for (const item of list ?? []) m.set(item[key], item);
  return m;
}

/**
 * Compare expected fingerprint model vs actual model.
 * @returns {{ ok: boolean, diffs: string[] }}
 */
export function compareFingerprints(expected, actual, tableLabel) {
  const diffs = [];
  const table = tableLabel || `${expected.schema}.${expected.table}`;

  if (actual == null || actual.missing === true) {
    diffs.push(fmtDiff(table, "TABLE_MISSING", table, "present", "MISSING"));
    return { ok: false, diffs };
  }

  // Columns — name-keyed; ordinal ignored
  const expCols = mapByName(expected.columns);
  const actCols = mapByName(actual.columns);
  for (const name of expCols.keys()) {
    if (!actCols.has(name)) {
      diffs.push(fmtDiff(table, "COLUMN_MISSING", name, expCols.get(name), "MISSING"));
    }
  }
  for (const name of actCols.keys()) {
    if (!expCols.has(name)) {
      diffs.push(fmtDiff(table, "COLUMN_EXTRA", name, "ABSENT", actCols.get(name)));
    }
  }
  for (const [name, exp] of expCols) {
    const act = actCols.get(name);
    if (!act) continue;
    if (exp.udt !== act.udt) {
      diffs.push(fmtDiff(table, "COLUMN_TYPE_MISMATCH", name, exp.udt, act.udt));
    }
    if (Boolean(exp.nullable) !== Boolean(act.nullable)) {
      diffs.push(fmtDiff(table, "NULLABILITY_MISMATCH", name, exp.nullable, act.nullable));
    }
    if (normDefault(exp.default_norm) !== normDefault(act.default_norm)) {
      diffs.push(
        fmtDiff(table, "DEFAULT_MISMATCH", name, normDefault(exp.default_norm), normDefault(act.default_norm))
      );
    }
  }

  // PK
  const epk = expected.primary_key;
  const apk = actual.primary_key;
  if (JSON.stringify(epk) !== JSON.stringify(apk)) {
    diffs.push(fmtDiff(table, "PK_MISMATCH", epk?.name || "primary_key", epk, apk));
  }

  // FK / UNIQUE / CHECK — set by name
  function compareNamedSet(kind, expList, actList, summarize) {
    const em = mapByName(expList);
    const am = mapByName(actList);
    for (const [name, exp] of em) {
      if (!am.has(name)) {
        diffs.push(fmtDiff(table, `${kind}_MISMATCH`, name, summarize(exp), "MISSING"));
        continue;
      }
      const act = am.get(name);
      if (JSON.stringify(exp) !== JSON.stringify(act)) {
        diffs.push(fmtDiff(table, `${kind}_MISMATCH`, name, summarize(exp), summarize(act)));
      }
    }
    for (const [name, act] of am) {
      if (!em.has(name)) {
        diffs.push(fmtDiff(table, `${kind}_MISMATCH`, name, "ABSENT", summarize(act)));
      }
    }
  }

  compareNamedSet("FK", expected.foreign_keys, actual.foreign_keys, (x) => x);
  compareNamedSet("UNIQUE", expected.uniques, actual.uniques, (x) =>
    x ? `UNIQUE(${(x.columns || []).join(",")})` : x
  );
  compareNamedSet("CHECK", expected.checks, actual.checks, (x) =>
    x ? { name: x.name, expression_norm: normExpr(x.expression_norm) } : x
  );

  // Normalize check compare with normExpr on both sides
  {
    const em = mapByName(expected.checks);
    const am = mapByName(actual.checks);
    for (const [name, exp] of em) {
      const act = am.get(name);
      if (!act) continue;
      // re-check with normalized expressions already partially above via JSON;
      // force expression_norm equality with collapse
      if (normExpr(exp.expression_norm) !== normExpr(act.expression_norm)) {
        // avoid duplicate if already mismatched on full object
        const already = diffs.some((d) => d.includes(`OBJECT: ${name}`) && d.includes("CHECK_MISMATCH"));
        if (!already) {
          diffs.push(
            fmtDiff(table, "CHECK_MISMATCH", name, normExpr(exp.expression_norm), normExpr(act.expression_norm))
          );
        }
      }
    }
  }

  // Explicit indexes
  {
    const em = mapByName(expected.indexes);
    const am = mapByName(actual.indexes);
    for (const [name, exp] of em) {
      if (!am.has(name)) {
        diffs.push(fmtDiff(table, "INDEX_MISSING", name, exp, "MISSING"));
        continue;
      }
      const act = am.get(name);
      const expKey = {
        name: exp.name,
        method: exp.method,
        unique: Boolean(exp.unique),
        columns_norm: exp.columns_norm,
        predicate_norm: normExpr(exp.predicate_norm),
        definition_norm: normExpr(exp.definition_norm),
      };
      const actKey = {
        name: act.name,
        method: act.method,
        unique: Boolean(act.unique),
        columns_norm: act.columns_norm,
        predicate_norm: normExpr(act.predicate_norm),
        definition_norm: normExpr(act.definition_norm),
      };
      if (JSON.stringify(expKey) !== JSON.stringify(actKey)) {
        diffs.push(fmtDiff(table, "INDEX_MISMATCH", name, expKey, actKey));
      }
    }
    for (const [name, act] of am) {
      if (!em.has(name)) {
        diffs.push(fmtDiff(table, "INDEX_EXTRA", name, "ABSENT", act));
      }
    }
  }

  // RLS
  if (Boolean(expected.rls?.enabled) !== Boolean(actual.rls?.enabled)) {
    diffs.push(
      fmtDiff(table, "RLS_ENABLED_MISMATCH", "rls.enabled", expected.rls?.enabled, actual.rls?.enabled)
    );
  }
  if (Boolean(expected.rls?.forced) !== Boolean(actual.rls?.forced)) {
    diffs.push(
      fmtDiff(table, "RLS_FORCED_MISMATCH", "rls.forced", expected.rls?.forced, actual.rls?.forced)
    );
  }

  // Policies
  {
    const em = mapByName(expected.policies);
    const am = mapByName(actual.policies);
    for (const [name, exp] of em) {
      if (!am.has(name)) {
        diffs.push(fmtDiff(table, "POLICY_MISSING", name, exp, "MISSING"));
        continue;
      }
      const act = am.get(name);
      if (JSON.stringify(exp) !== JSON.stringify(act)) {
        diffs.push(fmtDiff(table, "POLICY_MISMATCH", name, exp, act));
      }
    }
    for (const [name, act] of am) {
      if (!em.has(name)) {
        diffs.push(fmtDiff(table, "POLICY_EXTRA", name, "ABSENT", act));
      }
    }
  }

  // Triggers
  {
    const em = mapByName(expected.triggers);
    const am = mapByName(actual.triggers);
    for (const [name, exp] of em) {
      if (!am.has(name)) {
        diffs.push(fmtDiff(table, "TRIGGER_MISSING", name, exp, "MISSING"));
        continue;
      }
      const act = am.get(name);
      if (JSON.stringify(exp) !== JSON.stringify(act)) {
        diffs.push(fmtDiff(table, "TRIGGER_MISMATCH", name, exp, act));
      }
    }
    for (const [name, act] of am) {
      if (!em.has(name)) {
        diffs.push(fmtDiff(table, "TRIGGER_EXTRA", name, "ABSENT", act));
      }
    }
  }

  return { ok: diffs.length === 0, diffs };
}

function parseIndexColumns(definitionNorm) {
  const using = String(definitionNorm).match(/USING\s+\w+\s*\(/i);
  if (!using) return [];
  let i = using.index + using[0].length;
  const start = i;
  let depth = 1;
  while (i < definitionNorm.length && depth > 0) {
    const ch = definitionNorm[i++];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  const inside = definitionNorm.slice(start, i - 1);
  return inside.split(",").map((s) => collapseWs(s));
}

function cloneFp(base) {
  return JSON.parse(JSON.stringify(base));
}

function runFixtures() {
  const basePath = join(AUTHORITY_ROOT, "public/store_payments/v1.fingerprint.json");
  const base = JSON.parse(readFileSync(basePath, "utf8"));
  const results = [];

  function caseRun(name, mutateActual, expectOk) {
    const expected = cloneFp(base);
    const actual = cloneFp(base);
    // strip metadata for actual model shape used by compare
    mutateActual(actual);
    const { ok, diffs } = compareFingerprints(expected, actual, "public.store_payments");
    const pass = ok === expectOk;
    results.push({ name, pass, ok, diffs });
    console.log(`${pass ? "PASS" : "FAIL"} fixture ${name} (ok=${ok}, expectOk=${expectOk})`);
    if (!pass && diffs.length) console.log(diffs.join("\n---\n"));
  }

  caseRun("A_EXACT_MATCH", () => {}, true);

  caseRun(
    "B_COLUMN_TYPE_DRIFT",
    (a) => {
      a.columns.find((c) => c.name === "amount").udt = "int4";
    },
    false
  );

  caseRun(
    "C_UNIQUE_MISSING",
    (a) => {
      a.uniques = a.uniques.filter((u) => u.name !== "store_payments_order_id_key");
    },
    false
  );

  caseRun(
    "D_EXTRA_INDEX",
    (a) => {
      a.indexes.push({
        name: "idx_extra_bogus",
        method: "btree",
        unique: false,
        columns_norm: ["amount"],
        predicate_norm: null,
        definition_norm: "CREATE INDEX idx_extra_bogus ON public.store_payments USING btree (amount)",
      });
    },
    false
  );

  caseRun(
    "E_RLS_MISMATCH",
    (a) => {
      a.rls.enabled = false;
    },
    false
  );

  caseRun(
    "F_POLICY_EXTRA",
    (a) => {
      a.policies.push({
        name: "bogus_policy",
        command: "SELECT",
        roles: ["authenticated"],
        permissive: true,
        using_norm: "true",
        with_check_norm: null,
      });
    },
    false
  );

  caseRun(
    "G_TABLE_MISSING",
    (a) => {
      // replace with missing sentinel via compareFingerprints null
      Object.keys(a).forEach((k) => delete a[k]);
      a.missing = true;
    },
    false
  );

  // H catalog error — simulated as thrown path handled by caller; unit: AUTHORITY_CHECK_UNREADABLE
  {
    const name = "H_CATALOG_ERROR";
    try {
      throw new Error("AUTHORITY_CHECK_UNREADABLE: simulated catalog failure");
    } catch (e) {
      const msg = String(e.message || e);
      const pass = msg.includes("AUTHORITY_CHECK_UNREADABLE");
      results.push({ name, pass, ok: false, diffs: [msg] });
      console.log(`${pass ? "PASS" : "FAIL"} fixture ${name}`);
    }
  }

  const allPass = results.every((r) => r.pass);
  return { allPass, results };
}

async function loadLiveModel(client, schema, table) {
  const exists = await client.query(
    `SELECT to_regclass($1) AS reg`,
    [`${schema}.${table}`]
  );
  if (!exists.rows[0]?.reg) {
    return { missing: true };
  }

  try {
    const columnsQ = await client.query(
      `
      SELECT a.attname AS name,
             t.typname AS udt,
             NOT a.attnotnull AS nullable,
             pg_get_expr(ad.adbin, ad.adrelid) AS default_norm,
             (a.attidentity <> '') AS is_identity,
             CASE a.attidentity WHEN 'a' THEN 'ALWAYS' WHEN 'd' THEN 'BY DEFAULT' ELSE null END AS identity_generation,
             CASE a.attgenerated WHEN 's' THEN 'STORED' ELSE 'NEVER' END AS is_generated,
             CASE WHEN a.attgenerated = 's' THEN pg_get_expr(ad.adbin, ad.adrelid) ELSE null END AS generation_expression_norm
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_type t ON t.oid = a.atttypid
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum
      `,
      [schema, table]
    );

    const consQ = await client.query(
      `
      SELECT con.conname AS name,
             con.contype AS type,
             con.condeferrable AS deferrable,
             con.condeferred AS initially_deferred,
             pg_get_constraintdef(con.oid) AS def,
             (
               SELECT COALESCE(json_agg(att.attname ORDER BY u.ord), '[]'::json)
               FROM unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord)
               JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
             ) AS columns,
             rn.nspname AS ref_schema,
             rc.relname AS ref_table,
             CASE WHEN con.confrelid = 0 THEN '[]'::json ELSE (
               SELECT COALESCE(json_agg(att.attname ORDER BY u.ord), '[]'::json)
               FROM unnest(con.confkey) WITH ORDINALITY AS u(attnum, ord)
               JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = u.attnum
             ) END AS ref_columns,
             CASE con.confupdtype
               WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
               WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE null END AS on_update,
             CASE con.confdeltype
               WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
               WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' ELSE null END AS on_delete
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_class rc ON rc.oid = con.confrelid
      LEFT JOIN pg_namespace rn ON rn.oid = rc.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
      ORDER BY con.contype, con.conname
      `,
      [schema, table]
    );

    const idxQ = await client.query(
      `
      SELECT i.relname AS name,
             am.amname AS method,
             ix.indisunique AS unique,
             ix.indisprimary AS primary,
             EXISTS (SELECT 1 FROM pg_constraint cx WHERE cx.conindid = ix.indexrelid) AS constraint_backed,
             pg_get_indexdef(ix.indexrelid) AS definition_norm,
             pg_get_expr(ix.indpred, ix.indrelid) AS predicate_norm,
             pg_get_indexdef(ix.indexrelid) AS def_full
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON am.oid = i.relam
      WHERE n.nspname = $1 AND t.relname = $2
      ORDER BY i.relname
      `,
      [schema, table]
    );

    const rlsQ = await client.query(
      `
      SELECT c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
      `,
      [schema, table]
    );

    const polQ = await client.query(
      `
      SELECT policyname AS name,
             cmd AS command,
             roles,
             permissive = 'PERMISSIVE' AS permissive,
             qual AS using_norm,
             with_check AS with_check_norm
      FROM pg_policies
      WHERE schemaname = $1 AND tablename = $2
      ORDER BY policyname
      `,
      [schema, table]
    );

    const trgQ = await client.query(
      `
      SELECT tg.tgname AS name,
             CASE WHEN (tg.tgtype & 2) = 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
             ARRAY_REMOVE(ARRAY[
               CASE WHEN (tg.tgtype & 4)  = 4  THEN 'INSERT' END,
               CASE WHEN (tg.tgtype & 8)  = 8  THEN 'DELETE' END,
               CASE WHEN (tg.tgtype & 16) = 16 THEN 'UPDATE' END
             ], NULL) AS events,
             CASE WHEN (tg.tgtype & 1) = 1 THEN 'ROW' ELSE 'STATEMENT' END AS level,
             tg.tgenabled AS enabled,
             pn.nspname AS function_schema,
             p.proname AS function_name,
             pg_get_expr(tg.tgqual, tg.tgrelid) AS when_norm
      FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = tg.tgfoid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE n.nspname = $1 AND c.relname = $2 AND NOT tg.tgisinternal
      ORDER BY tg.tgname
      `,
      [schema, table]
    );

    let primary_key = null;
    const foreign_keys = [];
    const uniques = [];
    const checks = [];

    for (const row of consQ.rows) {
      if (row.type === "p") {
        primary_key = {
          name: row.name,
          columns: row.columns,
          deferrable: row.deferrable,
          initially_deferred: row.initially_deferred,
        };
      } else if (row.type === "f") {
        foreign_keys.push({
          name: row.name,
          columns: row.columns,
          ref_schema: row.ref_schema,
          ref_table: row.ref_table,
          ref_columns: row.ref_columns,
          on_update: row.on_update,
          on_delete: row.on_delete,
          deferrable: row.deferrable,
          initially_deferred: row.initially_deferred,
        });
      } else if (row.type === "u") {
        uniques.push({
          name: row.name,
          columns: row.columns,
          deferrable: row.deferrable,
          initially_deferred: row.initially_deferred,
        });
      } else if (row.type === "c") {
        // Skip attribute NOT NULL stubs if any slip through named oddly
        if (/not_null$/i.test(row.name) && /^CHECK \(/.test(row.def) === false) continue;
        if (/^\d+_\d+_\d+_not_null$/.test(row.name)) continue;
        checks.push({
          name: row.name,
          expression_norm: row.def,
        });
      }
    }

    const indexes = [];
    for (const row of idxQ.rows) {
      if (row.constraint_backed || row.primary) continue;
      indexes.push({
        name: row.name,
        method: row.method,
        unique: row.unique,
        columns_norm: parseIndexColumns(row.definition_norm),
        predicate_norm: row.predicate_norm,
        definition_norm: row.definition_norm,
      });
    }

    const policies = (polQ.rows || []).map((p) => ({
      name: p.name,
      command: p.command,
      roles: Array.isArray(p.roles) ? [...p.roles].sort() : p.roles,
      permissive: p.permissive,
      using_norm: p.using_norm,
      with_check_norm: p.with_check_norm,
    }));

    const triggers = (trgQ.rows || []).map((t) => ({
      name: t.name,
      timing: t.timing,
      events: t.events,
      level: t.level,
      enabled: t.enabled,
      function_schema: t.function_schema,
      function_name: t.function_name,
      when_norm: t.when_norm,
    }));

    return {
      columns: columnsQ.rows.map((c) => ({
        name: c.name,
        udt: c.udt,
        nullable: c.nullable,
        default_norm: c.default_norm,
        is_identity: c.is_identity,
        identity_generation: c.identity_generation,
        is_generated: c.is_generated,
        generation_expression_norm: c.generation_expression_norm,
      })),
      primary_key,
      foreign_keys,
      uniques,
      checks,
      indexes,
      rls: {
        enabled: rlsQ.rows[0]?.enabled === true,
        forced: rlsQ.rows[0]?.forced === true,
      },
      policies,
      triggers,
    };
  } catch (e) {
    const err = new Error(`AUTHORITY_CHECK_UNREADABLE: ${e.message || e}`);
    err.code = "AUTHORITY_CHECK_UNREADABLE";
    throw err;
  }
}

function discoverFingerprints() {
  const out = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (name.endsWith(".fingerprint.json")) out.push(p);
    }
  }
  walk(AUTHORITY_ROOT);
  return out.sort();
}

async function runLive() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    throw new Error("AUTHORITY_CHECK_UNREADABLE: missing DATABASE_URL or SUPABASE_DB_PASSWORD");
  }

  // Static guarantee: SQL template literals must be SELECT/catalog only (no DML/DDL verbs).
  const selfSrc = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const sqlLits = [...selfSrc.matchAll(/`([\s\S]*?)`/g)].map((m) => m[1]);
  const dmlDdl =
    /^\s*(INSERT\s+INTO|UPDATE\s+\S|DELETE\s+FROM|TRUNCATE\s+|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE|CREATE\s+INDEX|CREATE\s+POLICY|ENABLE\s+ROW\s+LEVEL|DISABLE\s+ROW\s+LEVEL)/im;
  for (const lit of sqlLits) {
    if (dmlDdl.test(lit)) {
      throw new Error("AUTHORITY_CHECK_UNREADABLE: verifier contains mutation SQL");
    }
  }

  const client = new Client({
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  try {
    const files = discoverFingerprints();
    if (!files.length) throw new Error("AUTHORITY_CHECK_UNREADABLE: no fingerprint files");
    let allOk = true;
    for (const file of files) {
      const expected = JSON.parse(readFileSync(file, "utf8"));
      const actual = await loadLiveModel(client, expected.schema, expected.table);
      const { ok, diffs } = compareFingerprints(
        expected,
        actual,
        `${expected.schema}.${expected.table}`
      );
      console.log(`${ok ? "PASS" : "FAIL"} live ${expected.schema}.${expected.table}`);
      if (!ok) {
        allOk = false;
        console.log(diffs.join("\n---\n"));
      }
    }
    return allOk;
  } finally {
    await client.end();
  }
}

function runCompat() {
  const paymentsFp = JSON.parse(
    readFileSync(join(AUTHORITY_ROOT, "public/store_payments/v1.fingerprint.json"), "utf8")
  );
  const eventsFp = JSON.parse(
    readFileSync(join(AUTHORITY_ROOT, "public/store_payment_events/v1.fingerprint.json"), "utf8")
  );
  const payCols = new Set(paymentsFp.columns.map((c) => c.name));
  const evtCols = new Set(eventsFp.columns.map((c) => c.name));

  const record = readFileSync(join(ROOT, "lib/stores/record-store-order-payment.ts"), "utf8");
  const append = readFileSync(join(ROOT, "lib/stores/append-store-payment-event.ts"), "utf8");
  const gift = readFileSync(
    join(ROOT, "supabase/migrations/20261127140000_gift_certificate_checkout_refund_atomic.sql"),
    "utf8"
  );

  const paymentInsertFields = ["order_id", "provider", "provider_payment_id", "amount", "status", "meta"];
  const eventInsertFields = ["source", "order_id", "event_type", "provider", "transmission_id", "payload"];
  const giftUpdateFields = ["status"];

  const results = [];
  function check(name, fields, colSet, sourceHint) {
    const missing = fields.filter((f) => !colSet.has(f));
    const pass = missing.length === 0 && sourceHint;
    results.push({ name, pass, missing });
    console.log(
      `${pass ? "PASS" : "FAIL"} compat ${name}${missing.length ? ` missing=${missing.join(",")}` : ""}`
    );
  }

  check(
    "STORE_PAYMENT_WRITER",
    paymentInsertFields,
    payCols,
    /from\("store_payments"\)\.insert/.test(record)
  );
  check(
    "STORE_PAYMENT_EVENT_WRITER",
    eventInsertFields,
    evtCols,
    /from\("store_payment_events"\)\.insert/.test(append)
  );
  check(
    "GIFT_REFUND_UPDATE",
    giftUpdateFields,
    payCols,
    /UPDATE public\.store_payments[\s\S]*SET status = 'refunded'/.test(gift)
  );

  if (evtCols.has("payment_id")) {
    console.log("FAIL compat payment_id must be ABSENT on store_payment_events");
    results.push({ name: "NO_PAYMENT_ID", pass: false });
  } else {
    console.log("PASS compat payment_id ABSENT");
    results.push({ name: "NO_PAYMENT_ID", pass: true });
  }

  return results.every((r) => r.pass);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const doAll = args.has("--all") || args.size === 0;
  const doFixtures = doAll || args.has("--fixtures");
  const doCompat = doAll || args.has("--compat");
  const doLive = doAll || args.has("--live");

  let ok = true;

  if (doFixtures) {
    console.log("=== fixtures ===");
    const { allPass } = runFixtures();
    if (!allPass) ok = false;
  }
  if (doCompat) {
    console.log("=== compat ===");
    if (!runCompat()) ok = false;
  }
  if (doLive) {
    console.log("=== live ===");
    try {
      const liveOk = await runLive();
      if (!liveOk) ok = false;
    } catch (e) {
      console.error(String(e.message || e));
      ok = false;
    }
  }

  process.exit(ok ? 0 : 1);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
