#!/usr/bin/env node
/**
 * PASS-3: lite bundle RPC must exclude viewer left_at / blocked_hidden_at memberships.
 * Uses service role (no DATABASE_URL required for RPC probe).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const AAAA = "11111111-1111-1111-1111-111111111111";
const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LEFT_PASS3_PREFIX = "PASS3-LEAVE";

function loadEnvLocal() {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[t.slice(0, i).trim()] ??= v;
  }
}

function authCookie(session, ref) {
  const payload = Buffer.from(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    })
  ).toString("base64url");
  return `sb-${ref}-auth-token=base64-${payload}`;
}

function roomIdFromRow(row) {
  return String(row?.id ?? row?.room_id ?? "").trim();
}

function pass3FromBody(body) {
  return [...(body.chats ?? []), ...(body.groups ?? [])].filter((r) =>
    String(r.title ?? "").includes(LEFT_PASS3_PREFIX)
  );
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !serviceKey || !anon) {
    console.error("FAIL: Supabase env missing");
    process.exit(1);
  }
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  if (!ref) {
    console.error("FAIL: cannot parse project ref");
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log("\n=== CM bootstrap lite bundle active-membership verify ===\n");

  const { data: leftRows } = await sb
    .from("community_messenger_participants")
    .select("room_id, left_at, community_messenger_rooms!inner(title)")
    .eq("user_id", AAAA)
    .not("left_at", "is", null)
    .ilike("community_messenger_rooms.title", `%${LEFT_PASS3_PREFIX}%`);

  const leftRoomIds = (leftRows ?? []).map((r) => String(r.room_id)).filter(Boolean);
  console.log("aaaa_left_pass3_room_ids:", leftRoomIds);

  const { data: liteRaw, error: liteErr } = await sb.rpc("community_messenger_bootstrap_lite_my_rooms_bundle", {
    p_user_id: AAAA,
    p_limit: 500,
  });
  if (liteErr) {
    console.error("FAIL: lite bundle RPC error:", liteErr.message);
    process.exit(1);
  }

  const liteIds = (Array.isArray(liteRaw?.room_ids) ? liteRaw.room_ids : []).map((id) => String(id));
  const litePass3 = (Array.isArray(liteRaw?.rooms) ? liteRaw.rooms : []).filter((r) =>
    String(r.title ?? "").includes(LEFT_PASS3_PREFIX)
  );
  const leaked = leftRoomIds.filter((id) => liteIds.includes(id));

  console.log("lite_bundle_room_count:", liteIds.length);
  console.log("lite_bundle_pass3_count:", litePass3.length);
  console.log("left_membership_leaked_in_lite:", leaked);

  if (leaked.length > 0) {
    console.log("\nFAIL: left_at rooms still present in community_messenger_bootstrap_lite_my_rooms_bundle");
    console.log("Run: SUPABASE_DB_PASSWORD=... node scripts/apply-cm-bootstrap-lite-bundle-active-membership.mjs");
    process.exit(1);
  }

  const { data: activeRpc } = await sb.rpc("community_messenger_bootstrap_my_room_ids", {
    p_user_id: AAAA,
    p_limit: 500,
  });
  const activeIds = new Set((activeRpc ?? []).map((r) => String(r.room_id)));
  const liteNotInActive = liteIds.filter((id) => !activeIds.has(id));
  if (liteNotInActive.length > 0) {
    console.log("\nFAIL: lite_bundle room_ids not subset of bootstrap_my_room_ids:", liteNotInActive.slice(0, 5));
    process.exit(1);
  }

  console.log("\nRPC PASS: lite bundle excludes left memberships");

  await sb.from("community_messenger_bootstrap_snapshots").delete().eq("user_id", AAAA);
  await sb.from("community_messenger_home_sync_snapshots").delete().eq("user_id", AAAA);
  console.log("snapshot_rows_purged_for_aaaa: ok");

  const authSb = createClient(url, anon, { auth: { persistSession: false } });
  const { data: signIn } = await authSb.auth.signInWithPassword({
    email: "aaaa@manual.local",
    password: "1234",
  });
  if (!signIn?.session) {
    console.error("FAIL: aaaa login");
    process.exit(1);
  }
  const cookie = authCookie(signIn.session, ref);

  const bootstrapRes = await fetch(
    `${ORIGIN}/api/community-messenger/bootstrap?tier=critical&cmBootstrapBypass=1&_v=${Date.now()}`,
    { headers: { Cookie: cookie } }
  );
  const bootstrap = await bootstrapRes.json();
  const bootstrapPass3 = pass3FromBody(bootstrap);
  const bootstrapLeftLeaked = bootstrapPass3.filter((r) => leftRoomIds.includes(roomIdFromRow(r)));

  const homeRes = await fetch(
    `${ORIGIN}/api/community-messenger/home-sync?tier=critical&fresh=1&_v=${Date.now()}`,
    { headers: { Cookie: cookie } }
  );
  const home = await homeRes.json();
  const homePass3 = pass3FromBody(home);
  const homeLeftLeaked = homePass3.filter((r) => leftRoomIds.includes(roomIdFromRow(r)));

  console.log("\n--- HTTP reload probe (aaaa) ---");
  console.log("bootstrap_pass3_count:", bootstrapPass3.length);
  console.log("bootstrap_left_leaked:", bootstrapLeftLeaked.map(roomIdFromRow));
  console.log("home_sync_pass3_count:", homePass3.length);
  console.log("home_sync_left_leaked:", homeLeftLeaked.map(roomIdFromRow));

  if (bootstrapLeftLeaked.length > 0 || homeLeftLeaked.length > 0) {
    console.log("\nFAIL: bootstrap/home-sync still lists left PASS3 rooms after snapshot purge");
    process.exit(1);
  }

  const activePass3 = bootstrapPass3.filter((r) => !leftRoomIds.includes(roomIdFromRow(r)));
  console.log("active_pass3_remaining:", activePass3.map((r) => ({ id: roomIdFromRow(r), title: r.title })));

  console.log("\nPASS: PASS-3 reload — left PASS3-LEAVE rooms excluded from bootstrap/home-sync");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
