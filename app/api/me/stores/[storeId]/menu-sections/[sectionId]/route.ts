import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { guardOwnerCatalogWrite } from "@/lib/stores/owner-catalog-write-guard";
import {
  deleteMenuSectionCore,
  patchMenuSectionCore,
  readMenuSectionMoveTo,
  type PatchMenuSectionBody,
} from "@/lib/stores/owner-catalog/menu-sections-core.server";

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

  let body: PatchMenuSectionBody;
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

  // 3-C §9-3 — 저장 코어 공용 (관리자 샘플 라우트와 같은 함수)
  return patchMenuSectionCore(sb, sid, secId, body);
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

  return deleteMenuSectionCore(sb, sid, secId, readMenuSectionMoveTo(req.url));
}
