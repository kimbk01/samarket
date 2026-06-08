#!/usr/bin/env node
/**
 * Force owner hub badge snapshot refresh for one user (service_role).
 * Usage: node scripts/refresh-owner-hub-badge-snapshot-user.mjs <userId|qqqq>
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function loadEnvLocal() {
  const p = ".env.local";
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\n/)) {
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

function floorCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

async function resolveUserId(sb, arg) {
  const raw = (arg ?? "").trim();
  if (!raw) throw new Error("userId or login id required");
  if (/^[0-9a-f-]{36}$/i.test(raw)) return raw;
  const email = raw.includes("@") ? raw.toLowerCase() : `${raw.toLowerCase()}@manual.local`;
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const user = (data.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
  if (!user?.id) throw new Error(`user not found: ${email}`);
  return user.id;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !sk) throw new Error("Supabase env missing");

  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const userId = await resolveUserId(sb, process.argv[2] ?? "qqqq");

  const rpc0 = Date.now();
  const { data, error } = await sb.rpc("get_owner_hub_badge_snapshot", { p_user_id: userId });
  const rpcMs = Date.now() - rpc0;
  if (error) throw error;

  const d = data ?? {};
  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    store_order_participant_unread: floorCount(d.store_order_participant_unread),
    item_trade_participant_unread: floorCount(d.item_trade_participant_unread),
    community_participant_unread: floorCount(d.community_participant_unread),
    product_chat_unread_deduped: floorCount(d.product_chat_unread_deduped),
    community_messenger_unread_room_count: floorCount(d.community_messenger_unread_room_count),
    has_hub_store: Boolean(d.has_hub_store),
    hub_store_id: typeof d.hub_store_id === "string" ? d.hub_store_id : null,
    hub_store_slug: typeof d.hub_store_slug === "string" ? d.hub_store_slug : null,
    store_order_chat_unread: floorCount(d.store_order_chat_unread),
    refund_pending_count: floorCount(d.refund_pending_count),
    order_pending_count: floorCount(d.order_pending_count),
    inquiry_pending_count: floorCount(d.inquiry_pending_count),
    updated_at: now,
  };

  const hasNtKeys = "nt_bottom_nav_chat" in d;
  if (hasNtKeys) {
    Object.assign(row, {
      nt_bottom_nav_chat: floorCount(d.nt_bottom_nav_chat),
      nt_bottom_nav_community: floorCount(d.nt_bottom_nav_community),
      nt_bottom_nav_delivery: floorCount(d.nt_bottom_nav_delivery),
      nt_fab_owner_orders: floorCount(d.nt_fab_owner_orders),
      nt_fab_owner_store: floorCount(d.nt_fab_owner_store),
      nt_fab_owner_order_chat: floorCount(d.nt_fab_owner_order_chat),
      nt_owner_commerce_inbox: floorCount(d.nt_owner_commerce_inbox),
      nt_bundle_at: now,
    });
  }

  const { error: upsertErr } = await sb.from("hub_badge_user_unread_counters").upsert(row, {
    onConflict: "user_id",
  });
  if (upsertErr) throw upsertErr;

  console.log("[refresh-owner-hub-badge-snapshot-user]", {
    user_id_short: userId.slice(0, 8),
    rpc_ms: rpcMs,
    rpc_has_nt_keys: hasNtKeys ? 1 : 0,
    nt_bundle_at: hasNtKeys ? now : null,
    upserted: 1,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
