import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import { invalidateStoreMenusSnapshotCacheByStoreId } from "@/lib/stores/store-menus-snapshot-invalidate-by-store-id";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { bumpStorePublicSharedCacheGeneration } from "@/lib/stores/store-public-shared-cache-generation";
import {
  buildAdminStoreProductPatch,
  adminStoreProductMemoMissing,
  isAdminStoreProductAction,
} from "@/lib/stores/admin-store-product-ops";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  action?: string;
  reason?: string;
  memo?: string;
  name?: string;
  price?: number;
};

/**
 * Admin product ops on store_products SSOT.
 * block / hide / activate / sold_out / approve_review / reject_review /
 * correct_name / correct_price / archive(=hidden)
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ productId: string }> }
) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const { productId } = await context.params;
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const actionRaw = String(body.action ?? "").trim();
  if (!isAdminStoreProductAction(actionRaw)) {
    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 400 });
  }
  const memo = String(body.memo ?? "").trim() || null;
  if (adminStoreProductMemoMissing(actionRaw, memo)) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  // R2 — 확인창 사유(L2)는 감사 after.reason 에 남긴다. 검수 승인(approve L2)도 사유 필수.
  const reason = parseAdminReason(body.reason ?? body.memo);
  if (actionRaw === "approve_review" && !reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error: findErr } = await sb
    .from("store_products")
    .select("id, store_id, product_status, admin_review_status, title, price")
    .eq("id", id)
    .maybeSingle();

  if (findErr || !row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const built = buildAdminStoreProductPatch({
    action: actionRaw,
    memo,
    name: body.name,
    price: body.price,
  });
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
  }
  const patch = built.patch;
  const before = {
    product_status: row.product_status,
    admin_review_status: (row as { admin_review_status?: string }).admin_review_status,
    title: (row as { title?: string }).title,
    price: (row as { price?: number }).price,
  };

  // 상태 조건부 — 화면을 연 뒤 사장님·다른 관리자가 상태를 바꿨으면 409 (덮어쓰지 않음).
  const prevStatus = String((row as { product_status?: unknown }).product_status ?? "");
  const { data: updatedRows, error: upErr } = await sb
    .from("store_products")
    .update(patch)
    .eq("id", id)
    .eq("product_status", prevStatus)
    .select("id");
  if (upErr) {
    console.error("[admin/store-products PATCH]", upErr);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ ok: false, error: "status_changed" }, { status: 409 });
  }

  const storeId = String((row as { store_id?: string }).store_id ?? "").trim();
  try {
    if (storeId) invalidateStoreMenusSnapshotCacheByStoreId(storeId);
    clearStoreHomeFeedServerCache();
    bumpStorePublicSharedCacheGeneration(`admin_store_product.${actionRaw}`); // DEF-64 인스턴스 공통
  } catch (e) {
    console.error("[admin/store-products PATCH] cache invalidate", e);
  }

  await appendAdminRouteAudit(sb, req, {
    actorId: gate.actor.userId,
    targetType: "store_product",
    targetId: id,
    action: `store_product.${actionRaw}`,
    before,
    after: { ...patch, memo, reason, store_id: (row as { store_id?: string }).store_id },
  });

  return NextResponse.json({ ok: true });
}
