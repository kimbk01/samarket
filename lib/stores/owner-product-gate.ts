import type { SupabaseClient } from "@supabase/supabase-js";

type AnySb = SupabaseClient<any>;

export type StoreGateRow = {
  id: string;
  owner_user_id: string;
  approval_status: string;
  owner_can_edit_store_identity: boolean;
};

export async function getStoreIfOwner(
  sb: AnySb,
  userId: string,
  storeId: string
): Promise<{ ok: true; store: StoreGateRow } | { ok: false; status: number; error: string }> {
  const { data: store, error } = await sb
    .from("stores")
    .select("id, owner_user_id, approval_status, owner_can_edit_store_identity")
    .eq("id", storeId)
    .maybeSingle();

  if (error || !store) {
    return { ok: false, status: 404, error: "store_not_found" };
  }
  if (store.owner_user_id !== userId) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return {
    ok: true,
    store: {
      id: store.id as string,
      owner_user_id: store.owner_user_id as string,
      approval_status: store.approval_status as string,
      owner_can_edit_store_identity: store.owner_can_edit_store_identity === true,
    },
  };
}

export async function canOwnerSellProducts(
  sb: AnySb,
  storeId: string
): Promise<boolean> {
  const { data: perm } = await sb
    .from("store_sales_permissions")
    .select("allowed_to_sell, sales_status")
    .eq("store_id", storeId)
    .maybeSingle();

  return !!(perm && perm.allowed_to_sell === true && perm.sales_status === "approved");
}
