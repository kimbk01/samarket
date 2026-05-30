#!/usr/bin/env node
/**
 * EXPLAIN ANALYZE for count_notification_unread_segmented warn modes.
 *   node scripts/explain-notification-unread-segmented.mjs <userId> [segment]
 * Requires DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const SEGMENTS = ["consumer_no_chat", "bottom_nav_no_chat"];

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const pooler =
    process.env.SUPABASE_POOLER_URL?.trim() ||
    "postgresql://postgres.ckdosyydvgzqwpbwuhon@aws-1-ap-south-1.pooler.supabase.com:5432/postgres";
  if (!password) return "";
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(password);
  if (!u.username) u.username = "postgres.ckdosyydvgzqwpbwuhon";
  return `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
}

async function explainSegment(pool, userId, segment) {
  const sql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT count(*)::bigint
FROM public.notifications AS n
WHERE n.user_id = $1
  AND n.is_read = false
  AND CASE trim(coalesce($2, ''))
    WHEN 'consumer_no_chat' THEN
      (
        coalesce(n.notification_type, '') <> 'commerce'
        OR (
          n.notification_type = 'commerce'
          AND coalesce(n.meta->>'kind', '') NOT IN (
            'store_order_created',
            'store_order_accept_reminder_30s',
            'store_order_accept_reminder_60s',
            'store_order_payment_completed',
            'store_order_buyer_cancelled',
            'store_order_refund_requested'
          )
        )
      )
      AND coalesce(n.notification_type, '') <> 'chat'
      AND coalesce(n.push_kind, '') <> 'chat'
      AND coalesce(n.meta->>'kind', '') NOT IN ('community_chat', 'trade_chat', 'group_chat')
    WHEN 'bottom_nav_no_chat' THEN
      (
        coalesce(n.notification_type, '') <> 'commerce'
        OR (
          n.notification_type = 'commerce'
          AND coalesce(n.meta->>'kind', '') NOT IN (
            'store_order_created',
            'store_order_accept_reminder_30s',
            'store_order_accept_reminder_60s',
            'store_order_payment_completed',
            'store_order_buyer_cancelled',
            'store_order_refund_requested',
            'store_order_payment_completed_buyer',
            'store_order_owner_status',
            'store_order_payment_failed',
            'store_order_refund_approved',
            'store_order_auto_completed'
          )
        )
      )
      AND coalesce(n.notification_type, '') <> 'chat'
      AND coalesce(n.push_kind, '') <> 'chat'
      AND coalesce(n.meta->>'kind', '') NOT IN ('community_chat', 'trade_chat', 'group_chat')
    ELSE false
  END`;
  const res = await pool.query(sql, [userId, segment]);
  return res.rows.map((r) => r["QUERY PLAN"]).join("\n");
}

async function listIndexes(pool) {
  const res = await pool.query(
    `select indexname, indexdef
     from pg_indexes
     where schemaname = 'public'
       and tablename = 'notifications'
       and indexname like 'idx_notifications_user_unread%'
     order by indexname`
  );
  return res.rows;
}

async function main() {
  loadEnvLocal();
  const userId = (process.argv[2] ?? "").trim();
  const onlySegment = (process.argv[3] ?? "").trim();
  if (!userId) {
    console.error("Usage: node scripts/explain-notification-unread-segmented.mjs <userId> [segment]");
    process.exit(1);
  }
  const conn = resolveDatabaseUrl();
  if (!conn) {
    console.error("DATABASE_URL or SUPABASE_DB_PASSWORD + pooler URL required (.env.local)");
    process.exit(1);
  }
  const pool = new pg.default.Pool({ connectionString: conn, max: 1, ssl: { rejectUnauthorized: false } });
  try {
    const indexes = await listIndexes(pool);
    console.log("[notification-unread-explain] indexes:", indexes);
    const segments = onlySegment ? [onlySegment] : SEGMENTS;
    for (const segment of segments) {
      const plan = await explainSegment(pool, userId, segment);
      console.log(`\n[notification-unread-explain] segment=${segment} user=${userId.slice(0, 8)}\n${plan}`);
    }
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
