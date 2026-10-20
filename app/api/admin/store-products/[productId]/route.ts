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
import { invalidateOwnerProductsListCache } from "@/lib/stores/owner-products-list-snapshot";
import {
  isMissingStoreProductLockColumnError,
  stripStoreProductLockColumns,
} from "@/lib/stores/store-product-admin-lock";

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

  const ROW_SELECT_BASE = "id, store_id, product_status, admin_review_status, title, price, discount_price, discount_percent";
  let lockColumnsAvailable = true;
  let found = await sb
    .from("store_products")
    .select(`${ROW_SELECT_BASE}, admin_status_lock, sold_out_reason`)
    .eq("id", id)
    .maybeSingle();
  if (found.error && isMissingStoreProductLockColumnError(found.error)) {
    // 마이그레이션 20270602130000 적용 전 — 잠금·사유 없이 기존 동작.
    lockColumnsAvailable = false;
    found = await sb.from("store_products").select(ROW_SELECT_BASE).eq("id", id).maybeSingle();
  }
  const { data: row, error: findErr } = found;

  if (findErr || !row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const built = buildAdminStoreProductPatch({
    action: actionRaw,
    memo,
    name: body.name,
    price: body.price,
    current: {
      discount_price: (row as { discount_price?: unknown }).discount_price,
      discount_percent: (row as { discount_percent?: unknown }).discount_percent,
    },
  });
  if (!built.ok) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
  }
  const patch = lockColumnsAvailable ? built.patch : stripStoreProductLockColumns(built.patch);
  const before = {
    product_status: row.product_status,
    admin_review_status: (row as { admin_review_status?: string }).admin_review_status,
    title: (row as { title?: string }).title,
    price: (row as { price?: number }).price,
    discount_price: (row as { discount_price?: number | null }).discount_price ?? null,
    discount_percent: (row as { discount_percent?: number | null }).discount_percent ?? null,
    admin_status_lock: (row as { admin_status_lock?: string | null }).admin_status_lock ?? null,
    sold_out_reason: (row as { sold_out_reason?: string | null }).sold_out_reason ?? null,
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
    if (storeId) {
      invalidateStoreMenusSnapshotCacheByStoreId(storeId);
      invalidateOwnerProductsListCache(storeId); // PRD-09 — 오너 허브 즉시 반영
    }
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
