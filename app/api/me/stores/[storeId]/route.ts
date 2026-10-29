import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { getStoreIfOwner } from "@/lib/stores/owner-product-gate";
import {
  patchStoreProfileCore,
  type StoreProfilePatchBody,
} from "@/lib/stores/owner-catalog/store-profile-core.server";
import { ownerCatalogActor } from "@/lib/stores/owner-catalog/store-catalog-actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOCKED_APPROVAL = new Set(["rejected", "suspended"]);

/**
 * 매장 오너: 공개 페이지(/stores/[slug])에 노출되는 프로필 필드 수정
 * 슬러그·승인 상태·오너는 변경하지 않음
 */
export async function PATCH(
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

  let body: StoreProfilePatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const gate = await getStoreIfOwner(sb, userId, sid);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  if (BLOCKED_APPROVAL.has(gate.store.approval_status)) {
    return NextResponse.json(
      { ok: false, error: "store_not_editable" },
      { status: 403 }
    );
  }

  // 3-C §9-3 — 저장 코어 공용 (관리자 샘플 라우트와 같은 함수)
  return patchStoreProfileCore({
    sb,
    sid,
    actor: ownerCatalogActor(userId),
    gateStore: gate.store,
    body,
    req,
  });
}
