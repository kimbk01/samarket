import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";
import {
  listFeedAdProducts,
  updateFeedAdProduct,
  type FeedAdProductPatch,
} from "@/lib/ads/feed-ad-products";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/feed-ad-products — all products (incl. inactive). */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const products = await listFeedAdProducts(sb, { activeOnly: false });
  return NextResponse.json({ ok: true, products });
}

/**
 * PATCH /api/admin/feed-ad-products — update duration/price/active/sort/titles.
 * 광고 감사 A-1: `ads` 권한 · 사유 필수 · `expectedUpdatedAt` 이 다르면 409 (덮어쓰기 없음).
 */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdminPermission("ads");
  if (!gate.ok) return gate.response;
  const admin = { userId: gate.actor.userId };

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: FeedAdProductPatch & { id?: string; expectedUpdatedAt?: string; reason?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  const reason = parseAdminReason(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
  }

  const beforeProducts = await listFeedAdProducts(sb, { activeOnly: false }).catch(() => []);
  const beforeProduct = beforeProducts.find((p) => p.id === id) ?? null;

  const result = await updateFeedAdProduct(sb, id, {
    durationDays: body.durationDays,
    pointCost: body.pointCost,
    titleKo: body.titleKo,
    titleEn: body.titleEn,
    isActive: body.isActive,
    sortOrder: body.sortOrder,
  }, String(body.expectedUpdatedAt ?? ""));
  if (!result.ok) {
    const status =
      result.error === "not_found" ? 404 : result.error === "stale_updated_at" ? 409 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  // Refetch from DB — never trust client-only state as persisted.
  const products = await listFeedAdProducts(sb, { activeOnly: false });
  const persisted = products.find((p) => p.id === id) ?? result.product;
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "feed_ad_product",
    targetId: id,
    action: "feed_ad_product.update",
    before: (beforeProduct as unknown as Record<string, unknown> | null) ?? null,
    after: persisted ? { ...(persisted as unknown as Record<string, unknown>), reason } : null,
  });
  return NextResponse.json({ ok: true, product: persisted, products });
}
