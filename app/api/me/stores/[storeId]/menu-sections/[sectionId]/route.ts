import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  updateStoreMenuSection,
  type StoreMenuSectionWriteBody,
} from "@/lib/stores/catalog/store-menu-section-write";
import {
  guardOwnerCatalogWrite,
  ownerCatalogDbErrorResponse,
} from "@/lib/stores/owner-catalog-write-guard";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


/** 매장 오너: 카테고리(메뉴 구역) 이름·정렬 수정 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; sectionId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, sectionId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const secId = typeof sectionId === "string" ? sectionId.trim() : "";
  if (!sid || !secId) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  let body: StoreMenuSectionWriteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // PRD-15 — 세션 · 소유 · 1-B 운영 게이트
  const guard = await guardOwnerCatalogWrite(sb, userId, sid);
  if (!guard.ok) return guard.response;

  // S-5 — 검증·저장은 카탈로그 코어(오너·관리자 샘플 공용)
  const result = await updateStoreMenuSection(sb, sid, secId, body);
  if (result.status !== 200) return NextResponse.json(result.json, { status: result.status });

  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  invalidateOwnerProductsListCache(sid); // PRD-09 — 구역 숨김/이름이 오너 허브에 즉시 반영
  bumpStorePublicSharedCacheGeneration("owner_store.menu_section_update"); // OPS-02
  return NextResponse.json(result.json);
}

/**
 * 매장 오너: 카테고리 삭제.
 * PRD-13 — 소속 상품(삭제 제외)이 있으면 409 `section_has_products`(+count). 확인창에서 고른 이동 대상
 * `?moveTo=<sectionId>` 로 재요청하면 같은 요청에서 상품을 옮긴 뒤 삭제한다 (FK SET NULL 로 「기타 메뉴」
 * 에 조용히 떨어져 다음 수정 저장이 `menu_section_id_required` 로 실패하던 경로 차단). 빈 카테고리는 기존과 같다.
 */
export async function DELETE(
  req: Request,
  context: { params: Promise<{ storeId: string; sectionId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, sectionId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const secId = typeof sectionId === "string" ? sectionId.trim() : "";
  if (!sid || !secId) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // PRD-15 — 세션 · 소유 · 1-B 운영 게이트
  const guard = await guardOwnerCatalogWrite(sb, userId, sid);
  if (!guard.ok) return guard.response;

  let moveTo = "";
  try {
    moveTo = new URL(req.url).searchParams.get("moveTo")?.trim() ?? "";
  } catch {
    moveTo = "";
  }

  const { data: existing, error: findErr } = await sb
    .from("store_menu_sections")
    .select("id")
    .eq("id", secId)
    .eq("store_id", sid)
    .maybeSingle();
  if (findErr) {
    if (/column|does not exist|schema cache/i.test(String(findErr.message))) {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    return ownerCatalogDbErrorResponse("[DELETE menu-section] find", findErr);
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const { count: productCount, error: countErr } = await sb
    .from("store_products")
    .select("id", { count: "exact", head: true })
    .eq("store_id", sid)
    .eq("menu_section_id", secId)
    .not("product_status", "eq", "deleted");
  if (countErr) return ownerCatalogDbErrorResponse("[DELETE menu-section] count", countErr);
  const count = typeof productCount === "number" ? productCount : 0;

  if (count > 0) {
    if (!moveTo) {
      return NextResponse.json({ ok: false, error: "section_has_products", count }, { status: 409 });
    }
    if (moveTo === secId) {
      return NextResponse.json({ ok: false, error: "invalid_move_target" }, { status: 400 });
    }
    const { data: target, error: targetErr } = await sb
      .from("store_menu_sections")
      .select("id")
      .eq("id", moveTo)
      .eq("store_id", sid)
      .maybeSingle();
    if (targetErr) return ownerCatalogDbErrorResponse("[DELETE menu-section] target", targetErr);
    if (!target) {
      return NextResponse.json({ ok: false, error: "invalid_move_target" }, { status: 400 });
    }
    // 삭제(soft) 상품 포함 전부 이동 — FK SET NULL 로 남는 행이 없게
    const { error: moveErr } = await sb
      .from("store_products")
      .update({ menu_section_id: moveTo })
      .eq("store_id", sid)
      .eq("menu_section_id", secId);
    if (moveErr) return ownerCatalogDbErrorResponse("[DELETE menu-section] move", moveErr);
  }

  const { error: delErr } = await sb
    .from("store_menu_sections")
    .delete()
    .eq("id", secId)
    .eq("store_id", sid);

  if (delErr) {
    if (/column|does not exist|schema cache/i.test(String(delErr.message))) {
      return NextResponse.json({ ok: false, error: "migration_pending" }, { status: 503 });
    }
    // 이동은 반영됐을 수 있다 — 캐시는 맞춘다
    if (count > 0) {
      invalidateStoreMenusSnapshotCacheByStoreId(sid);
      invalidateOwnerProductsListCache(sid);
      bumpStorePublicSharedCacheGeneration("owner_store.menu_section_delete");
    }
    return ownerCatalogDbErrorResponse("[DELETE menu-section]", delErr);
  }

  invalidateStoreMenusSnapshotCacheByStoreId(sid);
  invalidateOwnerProductsListCache(sid); // PRD-09 — 삭제 구역 상품(menu_section_id NULL) 즉시 반영
  bumpStorePublicSharedCacheGeneration("owner_store.menu_section_delete"); // OPS-02
  return NextResponse.json({ ok: true, ...(count > 0 ? { moved: count, moved_to: moveTo } : {}) });
}
