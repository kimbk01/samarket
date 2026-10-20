import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { isAdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { listDeliveryAdAdminActionQueue } from "@/lib/stores/advertising/delivery-ad-operations-action-queue";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/delivery-ads/action-queue
 * CUT 3-D — Admin Action Queue read model (WAITING_ADMIN cases). No UI.
 * R7 — `limit`(최대 100)·`offset` 서버 페이지, `total` = 결제 확인된 WAITING_ADMIN 전체 건수 (DB RPC).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const productKindRaw = url.searchParams.get("productKind") ?? url.searchParams.get("product_kind");
  const productKind = isAdminDeliveryAdProduct(productKindRaw) ? productKindRaw : undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;
  const offsetRaw = Number(url.searchParams.get("offset") ?? "");
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;

  const result = await listDeliveryAdAdminActionQueue(sb, { productKind, limit, offset });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    items: result.items,
    total: result.total,
    limit: limit ?? null,
    offset,
  });
}
