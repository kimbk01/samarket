import { NextResponse } from "next/server";
import { parseProductOptionsJson } from "@/lib/stores/product-line-options";
import {
  getApprovedStoreBySlug,
  loadStoreCommerceMeta,
  STORE_SELECT_ID_SLUG_GATE,
} from "@/lib/stores/get-approved-store-by-slug";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildMenuProductRow(row: Record<string, unknown>): Record<string, unknown> {
  const groups = parseProductOptionsJson(row.options_json);
  const has_options = groups.length > 0;
  const options_summary = has_options ? `옵션 ${groups.length}개 그룹` : "";
  const {
    options_json: _omit,
    ...rest
  } = row;
  return {
    ...rest,
    has_options,
    options_summary,
  };
}

/**
 * 메뉴 목록 전용 — `options_json` 미포함, `has_options`·`options_summary` 만.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const decoded = decodeURIComponent(slug || "").trim();
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "missing_slug" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({
      ok: true,
      products: [],
      meta: { source: "supabase_unconfigured" as const, canSell: false },
    });
  }

  try {
    const storeRes = await getApprovedStoreBySlug(sb, decoded, STORE_SELECT_ID_SLUG_GATE);
    if (storeRes.ok === false) {
      if (storeRes.reason === "db_error") {
        console.error("[api/stores/slug/menus] store", storeRes.message);
        return NextResponse.json({ ok: false, error: storeRes.message }, { status: 500 });
      }
      return NextResponse.json(
        { ok: true, products: [], meta: { source: "supabase" as const, canSell: false } },
        { status: 404 }
      );
    }

    const store = storeRes.store;
    const storeId = String(store.id ?? "");
    const viewerId = await getRouteUserId();
    const meta = await loadStoreCommerceMeta(sb, storeId, viewerId);

    let products: unknown[] = [];
    if (meta.canSell) {
      const { data: prods, error: pErr } = await sb
        .from("store_products")
        .select(
          "id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory, min_order_qty, max_order_qty, product_status, thumbnail_url, pickup_available, local_delivery_available, shipping_available, category_id, menu_section_id, item_type, is_featured, sort_order, options_json, store_menu_sections ( id, name, sort_order, is_hidden ), store_product_categories ( name, slug )"
        )
        .eq("store_id", storeId)
        .in("product_status", ["active", "sold_out"])
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(80);

      if (pErr) console.error("[api/stores/slug/menus] products", pErr);
      else {
        const raw = (prods ?? []) as Record<string, unknown>[];
        const filtered = raw.filter((row) => {
          const sec = row.store_menu_sections;
          const o = Array.isArray(sec) ? sec[0] : sec;
          if (!o || typeof o !== "object") return true;
          return (o as { is_hidden?: boolean }).is_hidden !== true;
        });
        products = filtered.map((r) => buildMenuProductRow(r));
      }
    }

    return NextResponse.json({
      ok: true,
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
    console.error("[api/stores/slug/menus]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
