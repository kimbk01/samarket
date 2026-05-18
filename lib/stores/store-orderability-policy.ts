import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

export const OWN_STORE_ORDER_BLOCK_MESSAGE = "본인 매장은 주문할 수 없습니다";

export type StoreOrderability = {
  viewer_is_owner: boolean;
  viewer_is_admin: boolean;
  can_order_store: boolean;
  owner_block_message: string | null;
};

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

async function loadViewerAdminFlag(sb: SupabaseClient, viewerUserId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("profiles")
    .select("role")
    .eq("id", viewerUserId)
    .maybeSingle();
  if (error) return false;
  return isPrivilegedAdminRole((data as { role?: string | null } | null)?.role ?? null);
}

/**
 * Store ordering policy:
 * - normal users can order stores they do not own
 * - store owners cannot order their own store
 * - platform admins may pass through for test mode
 */
export async function resolveStoreOrderability(
  sb: SupabaseClient,
  viewerUserId: string | null | undefined,
  ownerUserId: unknown
): Promise<StoreOrderability> {
  const viewerId = normalizeId(viewerUserId);
  const ownerId = normalizeId(ownerUserId);
  if (!viewerId) {
    return {
      viewer_is_owner: false,
      viewer_is_admin: false,
      can_order_store: true,
      owner_block_message: null,
    };
  }

  const [viewerIsAdmin] = await Promise.all([loadViewerAdminFlag(sb, viewerId)]);
  const viewerIsOwner = ownerId.length > 0 && ownerId === viewerId;
  const blocked = viewerIsOwner && !viewerIsAdmin;

  return {
    viewer_is_owner: viewerIsOwner,
    viewer_is_admin: viewerIsAdmin,
    can_order_store: !blocked,
    owner_block_message: blocked ? OWN_STORE_ORDER_BLOCK_MESSAGE : null,
  };
}
