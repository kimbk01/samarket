import { NextResponse } from "next/server";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "refund_requested",
] as const;

/** PostgREST 임베드 포함 시 클라이언트 제네릭이 깨져 `store_id` 등 접근에 캐스트 필요 */
type StoreProductPublicRow = { store_id: string } & Record<string, unknown>;

/** 공개 매장 상품 단건 (active + 매장·판매 조건 충족) */
export async function GET(
  _req: Request,
  context: { params: Promise<{ productId: string }> }
) {
  const { productId } = await context.params;
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: product, error: pErr } = await sb
    .from("store_products")
    .select(
      [
        "id, store_id, title, summary, description_html, price, discount_price, discount_percent, stock_qty, track_inventory",
        "min_order_qty, max_order_qty, thumbnail_url, images_json, options_json",
        "pickup_available, local_delivery_available, shipping_available",
        "category_id, menu_section_id, item_type, is_featured, sort_order, created_at",
        "store_menu_sections ( id, name, sort_order )",
        "store_product_categories ( name, slug )",
      ].join(", ")
    )
    .eq("id", id)
    .eq("product_status", "active")
    .maybeSingle();

  if (pErr || !product) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const prod = product as unknown as StoreProductPublicRow;

  const { data: store, error: sErr } = await sb
    .from("stores")
    .select(
      "id, slug, store_name, approval_status, is_visible, phone, region, city, district, is_open, business_hours_json, profile_image_url, delivery_available, pickup_available, rating_avg, review_count"
    )
    .eq("id", prod.store_id)
    .maybeSingle();

  if (sErr || !store || store.approval_status !== "approved" || !store.is_visible) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { data: perm } = await sb
    .from("store_sales_permissions")
    .select("allowed_to_sell, sales_status")
    .eq("store_id", store.id)
    .maybeSingle();

  if (!perm || !perm.allowed_to_sell || perm.sales_status !== "approved") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const since90d = new Date();
  since90d.setUTCDate(since90d.getUTCDate() - 90);
  let favorite_count = 0;
  let recent_order_count = 0;
  try {
    const [favRes, ordRes] = await Promise.all([
      sb
        .from("store_favorites")
        .select("id", { count: "exact", head: true })
        .eq("store_id", store.id),
      sb
        .from("store_orders")
        .select("id", { count: "exact", head: true })
        .eq("store_id", store.id)
        .in("order_status", [...RECENT_ORDER_STATUSES])
        .gte("created_at", since90d.toISOString()),
    ]);
    if (!favRes.error && typeof favRes.count === "number") favorite_count = favRes.count;
    if (!ordRes.error && typeof ordRes.count === "number") recent_order_count = ordRes.count;
  } catch {
    /* ignore aggregate errors */
  }

  return NextResponse.json({
    ok: true,
    product: prod,
    store: {
      id: store.id,
      slug: store.slug,
      store_name: store.store_name,
      phone: store.phone,
      region: store.region,
      city: store.city,
      district: store.district,
      is_open: store.is_open,
      business_hours_json: store.business_hours_json,
      profile_image_url: store.profile_image_url,
      delivery_available: store.delivery_available,
      pickup_available: store.pickup_available,
      rating_avg: store.rating_avg ?? null,
      review_count: store.review_count ?? null,
      favorite_count,
      recent_order_count,
    },
  });
}
