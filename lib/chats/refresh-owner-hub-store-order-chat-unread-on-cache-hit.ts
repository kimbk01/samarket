/**
 * Slice 2-4 — Hub route cache HIT may be cross-isolate stale for B_store.
 * Keep cached non-chat fields; overlay fresh active-store unread **room** count only.
 * DO NOT use SQL message-sum. DO NOT mutate the cache entry in place.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerHubBadgePayload } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateHubStoreOrderUnreadMemory } from "@/lib/community-messenger/hub-store-order-unread-memory-cache";
import { countOwnerStoreOrderMessengerUnreadForHubStore } from "@/lib/community-messenger/store-order-chat-service";
import { readOwnerHubStoreLookupMemory } from "@/lib/chats/owner-hub-store-lookup-cache";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Pure response overlay — never mutates `cached`. */
export function overlayFreshOwnerStoreOrderChatUnread(
  cached: OwnerHubBadgePayload,
  freshOwnerUnreadRoomCount: number
): OwnerHubBadgePayload {
  const n = Math.max(0, Math.floor(Number(freshOwnerUnreadRoomCount) || 0));
  return {
    ...cached,
    storeOrderChatUnread: n,
  };
}

async function resolveActiveHubStoreId(
  storesSb: SupabaseClient<any> | null,
  userId: string
): Promise<string | null> {
  const uid = userId.trim();
  if (!uid) return null;

  const mem = readOwnerHubStoreLookupMemory(uid);
  if (mem.hit) {
    const id = trimText(mem.hubStore?.id);
    return id || null;
  }

  if (!storesSb) return null;

  const { data, error } = await storesSb
    .from("stores")
    .select("id")
    .eq("owner_user_id", uid)
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  const id = trimText((data[0] as { id?: unknown })?.id);
  if (!id) return null;

  const { data: permRow, error: permErr } = await storesSb
    .from("store_sales_permissions")
    .select("allowed_to_sell,sales_status")
    .eq("store_id", id)
    .maybeSingle();
  if (permErr) return null;
  const allowed = Boolean((permRow as { allowed_to_sell?: unknown } | null)?.allowed_to_sell);
  const salesStatus = trimText((permRow as { sales_status?: unknown } | null)?.sales_status);
  if (!allowed || salesStatus !== "approved") return null;
  return id;
}

/**
 * Fresh B_store room count for the account's active hub store.
 * @returns room count, or `null` when lookup/count fails (caller keeps prior room-count cache; never SQL sum).
 */
export async function resolveFreshOwnerStoreOrderChatRoomCount(input: {
  sb: SupabaseClient<any>;
  storesSb: SupabaseClient<any> | null;
  userId: string;
}): Promise<number | null> {
  try {
    const sid = await resolveActiveHubStoreId(input.storesSb, input.userId);
    if (!sid) return 0;
    invalidateHubStoreOrderUnreadMemory(input.userId, sid);
    const rooms = await countOwnerStoreOrderMessengerUnreadForHubStore(
      input.sb,
      input.userId,
      sid
    );
    if (!Number.isFinite(rooms)) return null;
    return Math.max(0, Math.floor(Number(rooms) || 0));
  } catch {
    return null;
  }
}

/** Cache HIT response: overlay fresh room count when available; else keep cached (assumed room-count unit). */
export async function withFreshOwnerStoreOrderChatUnreadOnCacheHit(input: {
  cached: OwnerHubBadgePayload;
  sb: SupabaseClient<any>;
  storesSb: SupabaseClient<any> | null;
  userId: string;
}): Promise<OwnerHubBadgePayload> {
  const fresh = await resolveFreshOwnerStoreOrderChatRoomCount({
    sb: input.sb,
    storesSb: input.storesSb,
    userId: input.userId,
  });
  if (fresh == null) return input.cached;
  return overlayFreshOwnerStoreOrderChatUnread(input.cached, fresh);
}
