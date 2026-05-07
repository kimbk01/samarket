import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  getApprovedStoreBySlug,
  loadStoreCommerceMeta,
  STORE_SELECT_LEGACY_DETAIL,
} from "@/lib/stores/get-approved-store-by-slug";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
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
    const storeRes = await getApprovedStoreBySlug(supabase, decoded, STORE_SELECT_LEGACY_DETAIL);
    if (storeRes.ok === false) {
      if (storeRes.reason === "db_error") {
        console.error("[api/stores/slug] store", storeRes.message);
        return NextResponse.json({ ok: false, error: storeRes.message }, { status: 500 });
      }
      return NextResponse.json(
        { ok: true, store: null, products: [], meta: { source: "supabase" as const } },
        { status: 404 }
      );
    }

    const store = storeRes.store;
    const storeId = String(store.id ?? "");

    const viewerId = await getRouteUserId();
    const meta = await loadStoreCommerceMeta(supabase, storeId, viewerId);

    let products: unknown[] = [];
    if (meta.canSell) {
      const { data: prods, error: pErr } = await supabase
        .from("store_products")
        .select(
          "id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory, min_order_qty, max_order_qty, product_status, thumbnail_url, pickup_available, local_delivery_available, shipping_available, category_id, menu_section_id, item_type, is_featured, sort_order, options_json, store_menu_sections ( id, name, sort_order, is_hidden ), store_product_categories ( name, slug )"
        )
        .eq("store_id", storeId)
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
        canSell: meta.canSell,
        source: "supabase",
        favorite_count: meta.favoriteCount,
        recent_order_count: meta.recentOrderCount,
        viewer_favorited: meta.viewerFavorited,
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
