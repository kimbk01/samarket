import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

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

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const supabase = tryGetSupabaseForStores();
  if (!supabase) {
    return NextResponse.json({ ok: true, store: null, products: [], meta: { source: "supabase_unconfigured" } });
  }

  try {
    const { data: store, error: storeErr } = await supabase
      .from("stores")
      .select(
        "id, store_name, slug, business_type, description, phone, region, city, district, address_line1, address_line2, lat, lng, business_hours_json, profile_image_url, gallery_images_json, is_open, delivery_available, pickup_available, visit_available, reservation_available, rating_avg, review_count, approval_status, is_visible, created_at, updated_at"
      )
      .eq("slug", decoded)
      .maybeSingle();

    if (storeErr) {
      console.error("[api/stores/slug] store", storeErr);
      return NextResponse.json({ ok: false, error: storeErr.message }, { status: 500 });
    }

    if (!store || store.approval_status !== "approved" || !store.is_visible) {
      return NextResponse.json({ ok: true, store: null, products: [] }, { status: 404 });
    }

    const since90d = new Date();
    since90d.setUTCDate(since90d.getUTCDate() - 90);

    let favoriteCount = 0;
    let recentOrderCount = 0;
    try {
      const [favRes, ordRes] = await Promise.all([
        supabase
          .from("store_favorites")
          .select("*", { count: "exact", head: true })
          .eq("store_id", store.id),
        supabase
          .from("store_orders")
          .select("*", { count: "exact", head: true })
          .eq("store_id", store.id)
          .in("order_status", [...RECENT_ORDER_STATUSES])
          .gte("created_at", since90d.toISOString()),
      ]);
      if (favRes.error) console.error("[api/stores/slug] favorite count", favRes.error);
      else if (typeof favRes.count === "number") favoriteCount = favRes.count;
      if (ordRes.error) console.error("[api/stores/slug] recent orders count", ordRes.error);
      else if (typeof ordRes.count === "number") recentOrderCount = ordRes.count;
    } catch (e) {
      console.error("[api/stores/slug] aggregate counts", e);
    }

    const viewerId = await getRouteUserId();
    let viewerFavorited = false;
    if (viewerId) {
      try {
        const { data: favRow, error: vfErr } = await supabase
          .from("store_favorites")
          .select("id")
          .eq("store_id", store.id)
          .eq("user_id", viewerId)
          .maybeSingle();
        if (vfErr) console.error("[api/stores/slug] viewer favorited", vfErr);
        else viewerFavorited = !!favRow;
      } catch (e) {
        console.error("[api/stores/slug] viewer favorited", e);
      }
    }

    const { data: perm } = await supabase
      .from("store_sales_permissions")
      .select("allowed_to_sell, sales_status")
      .eq("store_id", store.id)
      .maybeSingle();

    const canSell =
      !!perm && perm.allowed_to_sell === true && perm.sales_status === "approved";

    let products: unknown[] = [];
    if (canSell) {
      const { data: prods, error: pErr } = await supabase
        .from("store_products")
        .select(
          "id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory, product_status, thumbnail_url, pickup_available, local_delivery_available, shipping_available, category_id, menu_section_id, item_type, is_featured, sort_order, options_json, store_menu_sections ( id, name, sort_order, is_hidden ), store_product_categories ( name, slug )"
        )
        .eq("store_id", store.id)
        .eq("product_status", "active")
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(80);

      if (pErr) console.error("[api/stores/slug] products", pErr);
      else {
        const raw = prods ?? [];
        products = raw.filter((row: { store_menu_sections?: unknown }) => {
          const sec = row.store_menu_sections;
          const o = Array.isArray(sec) ? sec[0] : sec;
          if (!o || typeof o !== "object") return true;
          return (o as { is_hidden?: boolean }).is_hidden !== true;
        });
      }
    }

    return NextResponse.json({
      ok: true,
      store,
      products,
      meta: {
        canSell,
        source: "supabase",
        favorite_count: favoriteCount,
        recent_order_count: recentOrderCount,
        viewer_favorited: viewerFavorited,
      },
    });
  } catch (e) {
    console.error("[api/stores/slug]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
