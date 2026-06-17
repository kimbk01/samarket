#!/usr/bin/env node
/** Verify friendship SSOT migration + backfill integrity */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim();
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

const CHECKS = [
  {
    key: "table_exists",
    sql: `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'community_messenger_friendships'
    ) as ok`,
  },
  {
    key: "unique_pair_index_exists",
    sql: `select exists (
      select 1 from pg_indexes
      where schemaname = 'public' and indexname = 'community_messenger_friendships_pair_idx'
    ) as ok`,
  },
  {
    key: "accepted_friendship_count",
    sql: `select count(*)::int as n from public.community_messenger_friendships where status = 'accepted'`,
  },
  {
    key: "blocked_friendship_count",
    sql: `select count(*)::int as n from public.community_messenger_friendships where status = 'blocked'`,
  },
  {
    key: "duplicate_pair_rows",
    sql: `select count(*)::int as n from (
      select least(requester_user_id, addressee_user_id) u1,
             greatest(requester_user_id, addressee_user_id) u2,
             count(*) c
      from public.community_messenger_friendships
      group by 1, 2
      having count(*) > 1
    ) d`,
  },
  {
    key: "status_null_rows",
    sql: `select count(*)::int as n from public.community_messenger_friendships where status is null`,
  },
  {
    key: "self_pair_rows",
    sql: `select count(*)::int as n from public.community_messenger_friendships where requester_user_id = addressee_user_id`,
  },
  {
    key: "accepted_direct_rooms_without_friendship",
    sql: `select count(*)::int as n
      from (
        select distinct least(p1.user_id, p2.user_id) u1, greatest(p1.user_id, p2.user_id) u2
        from public.community_messenger_rooms r
        join public.community_messenger_participants p1 on p1.room_id = r.id
        join public.community_messenger_participants p2 on p2.room_id = r.id and p2.user_id <> p1.user_id
        where r.room_type = 'direct'
          and r.direct_key like '%:%'
          and r.direct_key not like 'trade_item:%'
          and r.direct_key not like 'trade_pc:%'
          and r.direct_key not like 'store_order:%'
          and r.direct_key not like 'trade_order:%'
          and coalesce(r.relation_status, 'accepted') = 'accepted'
      ) pairs
      where not exists (
        select 1 from public.community_messenger_friendships f
        where least(f.requester_user_id, f.addressee_user_id) = pairs.u1
          and greatest(f.requester_user_id, f.addressee_user_id) = pairs.u2
          and f.status = 'accepted'
      )`,
  },
  {
    key: "blocked_rows_with_invalid_permissions",
    sql: `select count(*)::int as n from public.community_messenger_friendships where status = 'blocked' and blocked_by_user_id is null`,
  },
  {
    key: "mutual_friend_social_without_accepted_friendship",
    sql: `select count(*)::int as n
      from public.user_social_relations a
      join public.user_social_relations b
        on a.owner_user_id = b.target_user_id
       and a.target_user_id = b.owner_user_id
       and a.relation_type = 'friend'
       and b.relation_type = 'friend'
      where not exists (
        select 1 from public.community_messenger_friendships f
        where least(f.requester_user_id, f.addressee_user_id) = least(a.owner_user_id, a.target_user_id)
          and greatest(f.requester_user_id, f.addressee_user_id) = greatest(a.owner_user_id, a.target_user_id)
          and f.status = 'accepted'
      )`,
  },
];

async function main() {
  loadEnvLocal();
  const cs = buildConnectionString();
  if (!cs) {
    console.error("SUPABASE_DB_PASSWORD or DATABASE_URL 필요 (.env.local)");
    process.exit(1);
  }
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const report = {};
  for (const check of CHECKS) {
    const { rows } = await client.query(check.sql);
    const row = rows[0] ?? {};
    report[check.key] = row.ok ?? row.n ?? row.count ?? row;
  }
  await client.end();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
