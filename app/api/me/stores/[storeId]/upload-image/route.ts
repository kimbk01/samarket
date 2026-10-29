import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { guardOwnerCatalogWrite } from "@/lib/stores/owner-catalog-write-guard";
import { uploadStoreImageCore } from "@/lib/stores/owner-catalog/upload-image-core.server";
import { ownerCatalogActor } from "@/lib/stores/owner-catalog/store-catalog-actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 매장 소유자 + 승인된 매장만. multipart file → 공개 URL (DB 미갱신). 512×512 이상 포함 고해상도 허용. */
export async function POST(
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

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  // PRD-15 — 세션 · 소유 · 1-B 게이트. 업로드는 매장 정보 편집과 같은 범위(승인·심사 중 허용, 반려·정지 차단).
  const guard = await guardOwnerCatalogWrite(sb, userId, sid, { scope: "profile" });
  if (!guard.ok) return guard.response;

  // 3-C §9-3 — 저장 코어 공용 (관리자 샘플 라우트와 같은 함수)
  return uploadStoreImageCore(sb, sid, ownerCatalogActor(userId), req);
}
