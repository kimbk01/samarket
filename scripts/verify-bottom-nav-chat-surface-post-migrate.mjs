#!/usr/bin/env node
/**
 * Post-migrate bottom_nav_chat surface verify (3-axis badge separation).
 * Usage: npm run verify:bottom-nav-chat-surface
 * Optional: VERIFY_USER_ID=<uuid> in .env.local for live RPC cross-check.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const hints = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function extractCaseBranch(sql, marker, nextMarker) {
  const start = sql.indexOf(marker);
  if (start < 0) return "";
  const bodyStart = start + marker.length;
  const end = sql.indexOf(nextMarker, bodyStart);
  return sql.slice(bodyStart, end < 0 ? undefined : end);
}

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
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

const latestMigration = read("supabase/migrations/20260609120000_bottom_nav_chat_consumer_chat_room_only.sql");
const oldMigration = read("supabase/migrations/20260606120000_notification_targets.sql");
const bottomNavChatBranch = extractCaseBranch(
  latestMigration,
  "WHEN 'bottom_nav_chat' THEN",
  "WHEN 'bottom_nav_community' THEN"
);

if (!bottomNavChatBranch) {
  errors.push("20260609120000 migration: missing bottom_nav_chat CASE");
}
if (!/t\.target_type = 'chat_room'/.test(bottomNavChatBranch)) {
  errors.push("20260609120000 migration: bottom_nav_chat must use target_type = chat_room");
}
if (!/t\.scope = 'consumer'/.test(bottomNavChatBranch)) {
  errors.push("20260609120000 migration: bottom_nav_chat must stay consumer-scoped");
}
if (/'trade'/.test(bottomNavChatBranch)) {
  errors.push("20260609120000 migration: bottom_nav_chat must NOT include trade target");
}
if (!/WHEN 'bottom_nav_chat' THEN[\s\S]*'chat_room'[\s\S]*'trade'/.test(oldMigration)) {
  errors.push("20260606120000 migration: expected legacy chat_room+trade pattern not found");
}
if (!/CREATE OR REPLACE FUNCTION public\.count_notification_targets\(/.test(latestMigration)) {
  errors.push("20260609120000 migration: missing count_notification_targets replacement");
}

const docsSql = read("docs/messenger-bottom-nav-chat-surface-verify.sql");
if (!docsSql.includes("count_notification_targets_hub_bundle")) {
  errors.push("docs/messenger-bottom-nav-chat-surface-verify.sql: missing hub bundle section");
}
if (!docsSql.includes("pg_get_function_identity_arguments")) {
  errors.push("docs/messenger-bottom-nav-chat-surface-verify.sql: should pin function signature");
}

async function optionalLiveRpcCheck() {
  loadEnvLocal();
  const userId = (process.env.VERIFY_USER_ID ?? "").trim();
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!userId || !url || !key) {
    hints.push("SKIP live RPC: set VERIFY_USER_ID + Supabase env in .env.local for optional cross-check");
    return;
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: bundle, error: bundleErr } = await sb.rpc("count_notification_targets_hub_bundle", {
    p_user_id: userId,
    p_store_id: null,
  });
  if (bundleErr) {
    hints.push(`live RPC bundle skipped: ${bundleErr.message}`);
    return;
  }

  const messengerTab = Math.max(0, Number(bundle?.bottom_nav_chat) || 0);
  const deliveryTab = Math.max(0, Number(bundle?.bottom_nav_delivery) || 0);
  hints.push(`live bottom_nav_chat=${messengerTab} bottom_nav_delivery=${deliveryTab}`);

  const { data: targets, error: targetsErr } = await sb
    .from("notification_targets")
    .select("target_type, scope, is_unread")
    .eq("user_id", userId)
    .eq("is_unread", true);
  if (targetsErr) {
    hints.push(`live targets breakdown skipped: ${targetsErr.message}`);
    return;
  }

  const tradeUnread = (targets ?? []).filter((r) => r.target_type === "trade" && r.scope === "consumer").length;
  const chatRoomUnread = (targets ?? []).filter((r) => r.target_type === "chat_room" && r.scope === "consumer").length;
  hints.push(`live raw trade_unread=${tradeUnread} chat_room_unread=${chatRoomUnread}`);

  if (tradeUnread > 0 && chatRoomUnread === 0) {
    if (messengerTab === 0) {
      hints.push("live trade-only unread does not affect bottom_nav_chat");
    } else {
      errors.push(
        "live check: messenger_tab > 0 while only trade targets unread - migration may not be applied"
      );
    }
  }
  if (chatRoomUnread > 0 && messengerTab !== chatRoomUnread) {
    hints.push(
      `note: messenger_tab (${messengerTab}) vs chat_room_unread (${chatRoomUnread}) — check stale targets or owner overlap`
    );
  }
}

await optionalLiveRpcCheck();

if (errors.length) {
  console.error("verify:bottom-nav-chat-surface FAIL\n" + errors.map((e) => `  - ${e}`).join("\n"));
  if (hints.length) console.error("\nHints:\n" + hints.map((h) => `  - ${h}`).join("\n"));
  process.exit(1);
}

console.log("verify:bottom-nav-chat-surface PASS");
for (const h of hints) console.log(`  hint: ${h}`);
