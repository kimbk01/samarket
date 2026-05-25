#!/usr/bin/env node
/**
 * dev — hub_badge_user_unread_counters PK lookup EXPLAIN (linked local).
 *   node scripts/explain-hub-badge-counter.mjs [userId]
 */
import fs from "node:fs";
import path from "node:path";

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
  const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)/)?.[1];
  if (!password || !ref) return "";
  return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`;
}

async function main() {
  loadEnvLocal();
  const userId = (process.argv[2] ?? "").trim();
  if (!userId) {
    console.error("Usage: node scripts/explain-hub-badge-counter.mjs <userId>");
    process.exit(1);
  }
  const conn = resolveDatabaseUrl();
  if (!conn) {
    console.error("DATABASE_URL or SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL 필요");
    process.exit(1);
  }
  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error("pg 모듈 없음 — npm install pg (dev) 후 재시도");
    process.exit(1);
  }
  const pool = new pg.default.Pool({ connectionString: conn, max: 1 });
  try {
    const sql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT user_id, store_order_participant_unread, item_trade_participant_unread,
  community_participant_unread, product_chat_unread_deduped,
  community_messenger_unread_room_count, has_hub_store, hub_store_id, hub_store_slug,
  store_order_chat_unread, refund_pending_count, order_pending_count, inquiry_pending_count, updated_at
FROM hub_badge_user_unread_counters
WHERE user_id = $1`;
    const res = await pool.query(sql, [userId]);
    console.log("[hub-badge-explain]", {
      explain_ran: 1,
      user_id: userId.slice(0, 8),
      plan: res.rows.map((r) => r["QUERY PLAN"]).join("\n"),
    });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
