import type { SupabaseClient } from "@supabase/supabase-js";

export const OWNER_STORE_COMMERCE_NOTIFICATIONS_LIST_RPC = "get_owner_store_commerce_notifications";

export type OwnerStoreCommerceNotificationsRpcResult =
  | { ok: true; notifications: Record<string, unknown>[] }
  | { ok: false; error: string };

export async function fetchOwnerStoreCommerceNotificationsRpc(
  sb: SupabaseClient<any>,
  userId: string,
  storeId: string,
  limit = 200
): Promise<OwnerStoreCommerceNotificationsRpcResult | null> {
  const uid = userId.trim();
  const sid = storeId.trim();
  if (!uid || !sid) return null;

  const { data, error } = await sb.rpc(OWNER_STORE_COMMERCE_NOTIFICATIONS_LIST_RPC, {
    p_user_id: uid,
    p_store_id: sid,
    p_limit: limit,
  });

  if (error) {
    if (!/get_owner_store_commerce_notifications|schema cache|function/i.test(String(error.message ?? ""))) {
      throw error;
    }
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[owner-store-commerce-notifications-rpc-miss]", error.message);
    }
    return null;
  }

  if (Array.isArray(data)) {
    return { ok: true, notifications: data as Record<string, unknown>[] };
  }

  if (data && typeof data === "object") {
    const rows = (data as { notifications?: unknown }).notifications;
    if (Array.isArray(rows)) {
      return { ok: true, notifications: rows as Record<string, unknown>[] };
    }
  }

  return { ok: true, notifications: [] };
}
