import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { logSupabaseQueryFailure } from "@/lib/supabase/format-supabase-client-error";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

const ME_STORE_SELECT =
  [
    "id, owner_user_id, store_name, slug, business_type, owner_can_edit_store_identity",
    "store_category_id, store_topic_id",
    "description, kakao_id, phone, email, website_url",
    "region, city, district, address_line1, address_line2, lat, lng",
    "place_id, formatted_address, detail_address",
    "profile_image_url, business_hours_json, gallery_images_json, is_open",
    "delivery_available, pickup_available, reservation_available, visit_available, menu_sold_out_bottom",
    "messenger_voice_messages_enabled, messenger_voice_calls_enabled, messenger_video_calls_enabled",
    "approval_status, is_visible, rejected_reason, revision_note",
    "created_at, updated_at, approved_at",
    // Production has no stores.applicant_nickname — nickname comes from profiles join below.
    "store_categories ( name, slug ), store_topics ( name, slug )",
  ].join(", ");

type MeStoreRow = Record<string, unknown> & { id: string };
const ME_STORES_SERVER_CACHE_TTL_MS = 20_000;
const ME_STORES_SERVER_CACHE_MAX_KEYS = 100;

const meStoresServerCache = new Map<
  string,
  { expiresAt: number; value: { ok: true; stores: StoreRow[] } | { ok: false; error: string } }
>();

/**
 * GET /api/me/stores 와 동일 본문 — Route·RSC 선로딩에서 공유.
 */
export async function loadMeStoresListForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true; stores: StoreRow[] } | { ok: false; error: string }> {
  const key = userId.trim();
  if (!key) return { ok: true, stores: [] };
  const now0 = Date.now();
  pruneByExpiresAtAndMaxSize(meStoresServerCache, now0, ME_STORES_SERVER_CACHE_MAX_KEYS);
  const cached = meStoresServerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Production: no stores.applicant_nickname — select without it first.
  let data: unknown[] | null = null;
  let error: { message?: string } | null = null;
  {
    const r = await supabase
      .from("stores")
      .select(ME_STORE_SELECT)
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false });
    data = r.data as unknown[] | null;
    error = (r.error as any) ?? null;
    if (error && /menu_sold_out_bottom/i.test(String(error.message ?? "")) && /does not exist/i.test(String(error.message ?? ""))) {
      const legacySelect = ME_STORE_SELECT.replace(/,\s*menu_sold_out_bottom\s*(?=,)/, "");
      const r3 = await supabase
        .from("stores")
        .select(legacySelect)
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false });
      data = r3.data as unknown[] | null;
      error = (r3.error as any) ?? null;
    }
    if (
      error &&
      /messenger_voice_messages_enabled|messenger_voice_calls_enabled|messenger_video_calls_enabled/i.test(
        String(error.message ?? "")
      ) &&
      /does not exist/i.test(String(error.message ?? ""))
    ) {
      const legacySelect = ME_STORE_SELECT.replace(
        /,\s*messenger_voice_messages_enabled,\s*messenger_voice_calls_enabled,\s*messenger_video_calls_enabled\s*(?=,)/,
        ""
      );
      const r4 = await supabase
        .from("stores")
        .select(legacySelect)
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false });
      data = r4.data as unknown[] | null;
      error = (r4.error as any) ?? null;
    }
  }

  if (error) {
    const { errorCode } = logSupabaseQueryFailure("loadMeStoresListForUser", error);
    const failed = { ok: false, error: errorCode } as const;
    meStoresServerCache.set(key, {
      value: failed,
      expiresAt: Date.now() + 3_000,
    });
    pruneByExpiresAtAndMaxSize(meStoresServerCache, Date.now(), ME_STORES_SERVER_CACHE_MAX_KEYS);
    return failed;
  }

  const list = (data ?? []) as unknown as MeStoreRow[];

  let ownerApplicantFallback: string | null = null;
  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name, nickname, username")
    .eq("id", userId)
    .maybeSingle();
  const display = typeof (prof as any)?.display_name === "string" ? String((prof as any).display_name).trim() : "";
  const legacy = typeof (prof as any)?.nickname === "string" ? String((prof as any).nickname).trim() : "";
  const username = typeof (prof as any)?.username === "string" ? String((prof as any).username).trim() : "";
  const label = labelFromDisplayAndUsername(display || legacy, username).trim();
  if (label) ownerApplicantFallback = label;

  const nickFromCol = new Map<string, string>();
  for (const s of list) {
    const sid = String((s as { id?: string }).id ?? "").trim();
    const an = String((s as { applicant_nickname?: string | null }).applicant_nickname ?? "").trim();
    if (sid && an) nickFromCol.set(sid, an);
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

  const success = { ok: true, stores } as const;
  meStoresServerCache.set(key, {
    value: success,
    expiresAt: Date.now() + ME_STORES_SERVER_CACHE_TTL_MS,
  });
  pruneByExpiresAtAndMaxSize(meStoresServerCache, Date.now(), ME_STORES_SERVER_CACHE_MAX_KEYS);
  return success;
}

const OWNER_PRODUCT_SELECT = [
  "id, store_id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory",
  "thumbnail_url, product_status, pickup_available, local_delivery_available, shipping_available",
  "category_id, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order",
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
