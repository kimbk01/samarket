/**
 * GET /api/me/owner-store-order-context 과 동일 — RSC에서 오너 주문 채팅 맥락 선로딩.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnerStoreOrderContext = {
  store_id: string;
  slug: string;
};

export async function loadOwnerStoreOrderContext(
  sb: SupabaseClient,
  ownerUserId: string,
  orderId: string
): Promise<
  | { ok: true; context: OwnerStoreOrderContext }
  | { ok: false; error: "not_found" | "forbidden" }
> {
  const oid = orderId.trim();
  if (!oid) {
    return { ok: false, error: "not_found" };
  }

  const { data: ord, error: oErr } = await sb.from("store_orders").select("store_id").eq("id", oid).maybeSingle();
  if (oErr || !ord) {
    return { ok: false, error: "not_found" };
  }
  const sid = String((ord as { store_id: string }).store_id ?? "").trim();
  if (!sid) {
    return { ok: false, error: "not_found" };
  }

  const { data: st, error: sErr } = await sb
    .from("stores")
    .select("id, owner_user_id, slug")
    .eq("id", sid)
    .maybeSingle();
  if (sErr || !st || String((st as { owner_user_id?: string }).owner_user_id) !== ownerUserId) {
    return { ok: false, error: "forbidden" };
  }

  return {
    ok: true,
    context: {
      store_id: st.id as string,
      slug: String((st as { slug?: string | null }).slug ?? "").trim(),
    },
  };
}
