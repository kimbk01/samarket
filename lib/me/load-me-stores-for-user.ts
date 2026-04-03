import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

const ME_STORE_SELECT =
  [
    "id, owner_user_id, store_name, slug, business_type, owner_can_edit_store_identity",
    "store_category_id, store_topic_id",
    "description, kakao_id, phone, email, website_url",
    "region, city, district, address_line1, address_line2, lat, lng",
    "profile_image_url, business_hours_json, gallery_images_json, is_open",
    "delivery_available, pickup_available, reservation_available, visit_available",
    "approval_status, is_visible, rejected_reason, revision_note",
    "created_at, updated_at, approved_at",
    "store_categories ( name, slug ), store_topics ( name, slug )",
  ].join(", ");

type MeStoreRow = Record<string, unknown> & { id: string };

/**
 * GET /api/me/stores 와 동일 본문 — Route·RSC 선로딩에서 공유.
 */
export async function loadMeStoresListForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true; stores: StoreRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("stores")
    .select(ME_STORE_SELECT)
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[loadMeStoresListForUser]", error);
    return { ok: false, error: error.message };
  }

  const list = (data ?? []) as unknown as MeStoreRow[];

  let ownerApplicantFallback: string | null = null;
  const { data: prof } = await supabase.from("profiles").select("nickname").eq("id", userId).maybeSingle();
  const pn = typeof prof?.nickname === "string" ? prof.nickname.trim() : "";
  if (pn) ownerApplicantFallback = pn;

  const nickFromCol = new Map<string, string>();
  const storeIds = list.map((s) => s.id);
  if (storeIds.length > 0) {
    const { data: nickRows, error: nickErr } = await supabase
      .from("stores")
      .select("id, applicant_nickname")
      .in("id", storeIds);
    if (!nickErr && nickRows) {
      for (const r of nickRows) {
        const sid = String((r as { id?: string }).id ?? "");
        const an = String((r as { applicant_nickname?: string | null }).applicant_nickname ?? "").trim();
        if (sid && an) nickFromCol.set(sid, an);
      }
    }
  }
  const ids = list.map((s) => s.id);
  const permByStore: Record<string, { allowed_to_sell: boolean; sales_status: string }> = {};
  if (ids.length > 0) {
    const { data: perms } = await supabase
      .from("store_sales_permissions")
      .select("store_id, allowed_to_sell, sales_status")
      .in("store_id", ids);
    for (const p of perms ?? []) {
      permByStore[p.store_id as string] = {
        allowed_to_sell: !!p.allowed_to_sell,
        sales_status: String(p.sales_status ?? ""),
      };
    }
  }

  const stores = list.map(
    (s) =>
      ({
        ...s,
        applicant_nickname: nickFromCol.get(s.id) ?? ownerApplicantFallback,
        sales_permission: permByStore[s.id] ?? null,
      }) as StoreRow
  );

  return { ok: true, stores };
}

const OWNER_PRODUCT_SELECT = [
  "id, store_id, title, summary, description_html, price, discount_price, discount_percent, stock_qty, track_inventory",
  "thumbnail_url, product_status, pickup_available, local_delivery_available, shipping_available",
  "category_id, menu_section_id, item_type, is_featured, sort_order",
  "created_at, updated_at",
  "store_menu_sections ( id, name, sort_order, is_hidden )",
  "store_product_categories ( name, slug )",
].join(", ");

/** GET /api/me/stores/[storeId]/products 와 동일(오너 검증 포함) */
export async function loadStoreProductsForOwner(
  supabase: SupabaseClient,
  userId: string,
  storeId: string
): Promise<
  | { ok: true; products: unknown[] }
  | { ok: false; error: "not_found" | "forbidden" | "db"; message?: string }
> {
  const id = storeId.trim();
  if (!id) return { ok: false, error: "not_found" };

  const { data: store, error: sErr } = await supabase
    .from("stores")
    .select("id, owner_user_id")
    .eq("id", id)
    .maybeSingle();

  if (sErr || !store) return { ok: false, error: "not_found" };
  if ((store as { owner_user_id?: string }).owner_user_id !== userId) {
    return { ok: false, error: "forbidden" };
  }

  const { data: products, error: pErr } = await supabase
    .from("store_products")
    .select(OWNER_PRODUCT_SELECT)
    .eq("store_id", id)
    .not("product_status", "eq", "deleted")
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (pErr) {
    console.error("[loadStoreProductsForOwner]", pErr);
    return { ok: false, error: "db", message: pErr.message };
  }

  return { ok: true, products: products ?? [] };
}
