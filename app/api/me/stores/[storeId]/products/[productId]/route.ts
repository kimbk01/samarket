import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { guardOwnerCatalogWrite } from "@/lib/stores/owner-catalog-write-guard";
import {
  loadProductForOwner,
  patchStoreProductCore,
} from "@/lib/stores/owner-catalog/products-core.server";
import { ownerCatalogActor } from "@/lib/stores/owner-catalog/store-catalog-actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ storeId: string; productId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, productId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const pid = typeof productId === "string" ? productId.trim() : "";
  if (!sid || !pid) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const res = await loadProductForOwner(sb, userId, sid, pid);
  if (res.error === "no_sb") {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  if (res.error === "gate" && res.gate) {
    return NextResponse.json({ ok: false, error: res.gate.error }, { status: res.gate.status });
  }
  if (res.error === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, product: res.product });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ storeId: string; productId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { storeId, productId } = await context.params;
  const sid = typeof storeId === "string" ? storeId.trim() : "";
  const pid = typeof productId === "string" ? productId.trim() : "";
  if (!sid || !pid) {
    return NextResponse.json({ ok: false, error: "missing_param" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  // PRD-15 — 세션 · 소유 · 1-B 운영 게이트 (POST 와 같은 가드). 정지 매장은 403 store_suspended.
  const guard = await guardOwnerCatalogWrite(sb, userId, sid);
  if (!guard.ok) return guard.response;
  // 3-C §9-3 — 저장 코어 공용 (관리자 샘플 라우트와 같은 함수)
  return patchStoreProductCore(sb, sid, pid, ownerCatalogActor(userId), guard.store, req);
}
