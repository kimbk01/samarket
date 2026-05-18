import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  getApprovedStoreBySlug,
  loadStoreCommerceMeta,
  STORE_SELECT_SUMMARY,
} from "@/lib/stores/get-approved-store-by-slug";
import { resolveStoreOrderability } from "@/lib/stores/store-orderability-policy";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 매장 상단·배달 메타 전용 — 메뉴 행 없음 (`/menus` 분리).
 * Legacy `GET /api/stores/:slug` 와 동일 `meta` 산식.
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
      meta: { source: "supabase_unconfigured" as const },
    });
  }

  try {
    const storeRes = await getApprovedStoreBySlug(sb, decoded, STORE_SELECT_SUMMARY);
    if (storeRes.ok === false) {
      if (storeRes.reason === "db_error") {
        console.error("[api/stores/slug/summary] store", storeRes.message);
        return NextResponse.json({ ok: false, error: storeRes.message }, { status: 500 });
      }
      return NextResponse.json(
        { ok: true, store: null, meta: { source: "supabase" as const } },
        { status: 404 }
      );
    }

    const store = storeRes.store;
    const storeId = String(store.id ?? "");
    const viewerId = await getRouteUserId();
    const [meta, orderability] = await Promise.all([
      loadStoreCommerceMeta(sb, storeId, viewerId),
      resolveStoreOrderability(sb, viewerId, store.owner_user_id),
    ]);
    const publicStore = { ...store };
    delete (publicStore as { owner_user_id?: unknown }).owner_user_id;

    return NextResponse.json({
      ok: true,
      store: publicStore,
      meta: {
        canSell: meta.canSell,
        source: "supabase",
        favorite_count: meta.favoriteCount,
        recent_order_count: meta.recentOrderCount,
        viewer_favorited: meta.viewerFavorited,
        ...orderability,
      },
    });
  } catch (e) {
    console.error("[api/stores/slug/summary]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
