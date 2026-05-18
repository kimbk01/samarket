/**
 * Verify order_chat_* -> community_messenger_* backfill coverage (service role).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  } catch {
    // CI can provide env vars directly.
  }
  return { ...env, ...process.env };
}

async function count(sb, table, filter) {
  let q = sb.from(table).select("id", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return c ?? 0;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log(JSON.stringify({ ok: false, error: "missing_supabase_env" }));
  process.exit(1);
}

const sb = createClient(url, key);
const [
  legacyRooms,
  linkedOrders,
  messengerStoreOrderRooms,
  legacyMessages,
  migratedMessages,
  messengerParticipants,
] = await Promise.all([
  count(sb, "order_chat_rooms"),
  count(sb, "store_orders", (q) => q.not("community_messenger_room_id", "is", null)),
  count(sb, "community_messenger_rooms", (q) => q.like("direct_key", "store_order:%")),
  count(sb, "order_chat_messages"),
  count(sb, "community_messenger_messages", (q) => q.eq("metadata->>domain", "store_order")),
  count(sb, "community_messenger_participants"),
]);

const ok = linkedOrders >= legacyRooms && migratedMessages >= legacyMessages;
console.log(
  JSON.stringify(
    {
      ok,
      legacyRooms,
      linkedOrders,
      messengerStoreOrderRooms,
      legacyMessages,
      migratedMessages,
      messengerParticipants,
    },
    null,
    2
  )
);
process.exit(ok ? 0 : 1);
