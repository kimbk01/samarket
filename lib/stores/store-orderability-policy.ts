import type { SupabaseClient } from "@supabase/supabase-js";
import { hasActiveAdminMembershipOrLegacyRole } from "@/lib/admin/admin-membership";

export const OWN_STORE_ORDER_BLOCK_MESSAGE_KEY = "store_err_own_store_block";

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
  const profileRole = (data as { role?: string | null } | null)?.role ?? null;
  try {
    return await hasActiveAdminMembershipOrLegacyRole(sb, viewerUserId, profileRole);
  } catch {
    return false;
  }
}

/**
 * Store ordering policy:
 * - normal users can order stores they do not own
 * - store owners cannot order their own store
 * - platform admins may pass through for test mode
 * Admin authority = CURRENT dual-read (membership OR legacy privileged role).
 * Store ownership = stores.owner_user_id only (never inferred from profiles.role).
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

  const viewerIsOwner = ownerId.length > 0 && ownerId === viewerId;
  if (!viewerIsOwner) {
    return {
      viewer_is_owner: false,
      viewer_is_admin: false,
      can_order_store: true,
      owner_block_message: null,
    };
  }

  const viewerIsAdmin = await loadViewerAdminFlag(sb, viewerId);
  const blocked = !viewerIsAdmin;

  return {
    viewer_is_owner: true,
    viewer_is_admin: viewerIsAdmin,
    can_order_store: !blocked,
    owner_block_message: null,
  };
}
