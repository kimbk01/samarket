import { NextResponse } from "next/server";
import {
  getApprovedStoreBySlug,
  loadStoreCommerceMeta,
  STORE_SELECT_MENUS_STORE,
} from "@/lib/stores/get-approved-store-by-slug";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { queryStorePopularMenuStats } from "@/lib/stores/query-store-popular-menu-stats";
import {
  buildRecommendedStripProductIds,
  groupStoreProductsByMenuSectionModel,
  parseStoreDetailProducts,
  RECOMMENDED_MENU_STRIP_MAX,
  slicePopularMenuProducts,
  sortStoreDetailProductCardsForDisplay,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 목록용 — `parseProductOptionsJson` 전체 파싱 없이 옵션 유무만(행 수·페이로드 절약) */
function menuRowHasOptions(optionsJson: unknown): boolean {
  if (optionsJson == null) return false;
  if (Array.isArray(optionsJson)) return optionsJson.length > 0;
  if (typeof optionsJson === "string") {
    const t = optionsJson.trim();
    return t.length > 0 && t !== "[]" && t !== "null";
  }
  if (typeof optionsJson === "object") {
    return Object.keys(optionsJson as object).length > 0;
  }
  return false;
}

function buildMenuProductRow(row: Record<string, unknown>): Record<string, unknown> {
  const has_options = menuRowHasOptions(row.options_json);
  const options_summary = has_options ? "옵션 있음" : "";
  const { options_json: _omit, ...rest } = row;
  return {
    ...rest,
    has_options,
    options_summary,
  };
}

function serializeMenuProductCard(card: StoreDetailProductCard, popularRank: number | null) {
  return {
    id: card.id,
    title: card.title,
    summary: card.summary,
    price: card.price,
    discount_price: card.discount_price,
    discount_percent: card.discount_percent,
    thumbnail_url: card.thumbnail_url,
    product_status: card.product_status,
    track_inventory: card.track_inventory,
    stock_qty: card.stock_qty,
    is_owner_recommended: card.is_owner_recommended,
    is_representative: card.is_representative,
    has_options: card.has_options,
    sort_order: card.sort_order,
    menu_section_id: card.menu_section_id,
    popular_rank: popularRank,
  };
}

/**
 * 메뉴 목록 전용 — `options_json` 응답 제외, `has_options`·`options_summary` 만.
 * `recommendedProductIds` / `popularProductIds` 는 `products` 와 동일 id 참조(행 중복 없음).
 * 확장: `store`, `recommendedProducts`, `popularProducts`, `categories` (동일 id 재사용).
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
      store: null,
      products: [],
      recommendedProductIds: [],
      popularProductIds: [],
      recommendedProducts: [],
      popularProducts: [],
      categories: [],
      meta: { source: "supabase_unconfigured" as const, canSell: false, menu_sold_out_bottom: false },
    });
  }

  try {
    const storeRes = await getApprovedStoreBySlug(sb, decoded, STORE_SELECT_MENUS_STORE);
    if (storeRes.ok === false) {
      if (storeRes.reason === "db_error") {
        console.error("[api/stores/slug/menus] store", storeRes.message);
        return NextResponse.json({ ok: false, error: storeRes.message }, { status: 500 });
      }
      return NextResponse.json(
        {
          ok: true,
          store: null,
          products: [],
          recommendedProductIds: [],
          popularProductIds: [],
          recommendedProducts: [],
          popularProducts: [],
          categories: [],
          meta: { source: "supabase" as const, canSell: false, menu_sold_out_bottom: false },
        },
        { status: 404 }
      );
    }

    const store = storeRes.store;
    const storeId = String(store.id ?? "");
    const menuSoldOutBottom = store.menu_sold_out_bottom === true;
    const publicStore = {
      id: storeId,
      slug: String(store.slug ?? ""),
      store_name: String(store.store_name ?? ""),
      menu_sold_out_bottom: menuSoldOutBottom,
    };

    const viewerId = await getRouteUserId();
    const [meta, commerce] = await Promise.all([
      loadStoreCommerceMeta(sb, storeId, viewerId),
      loadCommerceSettings(sb),
    ]);

    let products: unknown[] = [];
    let recommendedProductIds: string[] = [];
    let popularProductIds: string[] = [];
    let recommendedProducts: ReturnType<typeof serializeMenuProductCard>[] = [];
    let popularProducts: ReturnType<typeof serializeMenuProductCard>[] = [];
    let categories: {
      id: string | null;
      name: string;
      display_order: number;
      products: ReturnType<typeof serializeMenuProductCard>[];
    }[] = [];

    if (meta.canSell) {
      const { data: prods, error: pErr } = await sb
        .from("store_products")
        .select(
          "id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory, min_order_qty, max_order_qty, product_status, thumbnail_url, pickup_available, local_delivery_available, shipping_available, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, options_json, store_menu_sections ( id, name, sort_order, is_hidden ), store_product_categories ( name, slug )"
        )
        .eq("store_id", storeId)
        .in("product_status", ["active", "sold_out"])
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(120);

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

        const cards = sortStoreDetailProductCardsForDisplay(parseStoreDetailProducts(products));
        const popularStats = await queryStorePopularMenuStats(
          sb,
          storeId,
          commerce.popularMenuWindowDays,
          commerce.popularMenuTopN
        );
        const popularCards = slicePopularMenuProducts(cards, popularStats, commerce.popularMenuMinQty);
        popularProductIds = popularCards.map((c) => c.id);
        const popularRankById = new Map(popularCards.map((c, i) => [c.id, i + 1]));

        const stripCap = Math.min(
          RECOMMENDED_MENU_STRIP_MAX,
          Math.max(1, Math.floor(commerce.popularMenuRecommendedMax) || RECOMMENDED_MENU_STRIP_MAX)
        );
        recommendedProductIds = buildRecommendedStripProductIds(popularProductIds, cards, stripCap);

        const byId = new Map(cards.map((c) => [c.id, c]));
        recommendedProducts = recommendedProductIds
          .map((id) => byId.get(id))
          .filter(Boolean)
          .map((c) => serializeMenuProductCard(c!, popularRankById.get(c!.id) ?? null));

        popularProducts = popularCards.map((c, i) => serializeMenuProductCard(c, i + 1));

        const sections = groupStoreProductsByMenuSectionModel(cards, menuSoldOutBottom);
        categories = sections.map((s) => ({
          id: s.sectionId ?? null,
          name: s.heading,
          display_order: s.displayOrder ?? 0,
          products: s.items.map((c) =>
            serializeMenuProductCard(c, popularRankById.get(c.id) ?? null)
          ),
        }));
      }
    }

    return NextResponse.json({
      ok: true,
      store: publicStore,
      products,
      recommendedProductIds,
      popularProductIds,
      recommendedProducts,
      popularProducts,
      categories,
      meta: {
        canSell: meta.canSell,
        source: "supabase",
        favorite_count: meta.favoriteCount,
        recent_order_count: meta.recentOrderCount,
        viewer_favorited: meta.viewerFavorited,
        menu_sold_out_bottom: menuSoldOutBottom,
        popular_menu: {
          window_days: commerce.popularMenuWindowDays,
          min_qty: commerce.popularMenuMinQty,
          top_n: commerce.popularMenuTopN,
          recommended_max: commerce.popularMenuRecommendedMax,
        },
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
