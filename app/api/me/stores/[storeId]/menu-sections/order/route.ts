import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  guardOwnerCatalogWrite,
  ownerCatalogDbErrorResponse,
} from "@/lib/stores/owner-catalog-write-guard";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import { parseMenuSectionOrderIds } from "@/lib/stores/menu-section-order";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 3-E PRD-11 — 매장 오너: 메뉴 카테고리 순서를 한 트랜잭션으로 저장.
 * 본문 `{ section_ids: uuid[] }` (표시 순서). RPC `reorder_store_menu_sections` 가 한 문장으로
 * sort_order = 배열 위치(0부터) 를 쓰고, 이 매장 소속이 아닌 id 가 하나라도 있으면 아무것도 바꾸지 않는다.
 * 기존 섹션별 PATCH(sort_order) 는 그대로 유지 (보존).
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ storeId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_store_id" }, { status: 400 });
  }

  let body: { section_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const ids = parseMenuSectionOrderIds(body.section_ids);
  if (!ids.ok) {
    return NextResponse.json({ ok: false, error: ids.error }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const guard = await guardOwnerCatalogWrite(sb, userId, sid);
  if (!guard.ok) return guard.response;

  const { data, error } = await sb.rpc("reorder_store_menu_sections", {
    p_store_id: sid,
    p_section_ids: ids.value,
  });

  if (error) {
    const msg = String(error.message ?? "");
    if (/section_not_in_store/.test(msg)) {
      return NextResponse.json({ ok: false, error: "invalid_section_ids" }, { status: 400 });
    }
    if (/could not find the function|reorder_store_menu_sections.*does not exist|PGRST202/i.test(msg) ||
        (error as { code?: string }).code === "PGRST202") {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    return ownerCatalogDbErrorResponse("[PUT menu-sections/order]", error);
  }

  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  invalidateOwnerProductsListCache(sid);
  bumpStorePublicSharedCacheGeneration("owner_store.menu_section_reorder"); // OPS-02
  const updated =
    data && typeof data === "object" && "updated" in (data as Record<string, unknown>)
      ? Number((data as Record<string, unknown>).updated) || 0
      : 0;
  return NextResponse.json({ ok: true, updated });
}
