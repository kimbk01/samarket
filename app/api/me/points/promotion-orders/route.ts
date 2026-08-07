import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  getMemberPromotionProduct,
  listActiveMemberPromotionProducts,
} from "@/lib/points/promotion-products";
import {
  mapPointPromotionOrderRow,
} from "@/lib/points/point-promotion-orders-db";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import type { PointPromotionTargetType } from "@/lib/types/point";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/points/promotion-orders
 * — my entitlements + optional ?catalog=1 for product SSOT
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const wantCatalog = req.nextUrl.searchParams.get("catalog") === "1";
  const targetIdFilter = (req.nextUrl.searchParams.get("targetId") ?? "").trim();
  const catalog = wantCatalog
    ? listActiveMemberPromotionProducts().map((p) => ({
        id: p.id,
        domain: p.domain,
        durationDays: p.durationDays,
        pointCost: p.pointCost,
        priceAsset: p.priceAsset,
        titleKey: p.titleKey,
        descriptionKey: p.descriptionKey,
        fallbackTitleKo: p.fallbackTitleKo,
        fallbackTitleEn: p.fallbackTitleEn,
        fallbackDescKo: p.fallbackDescKo,
        fallbackDescEn: p.fallbackDescEn,
      }))
    : undefined;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, orders: [], catalog, activeForTarget: null });
  }

  let query = sb
    .from("point_promotion_orders")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (targetIdFilter) {
    query = query.eq("target_id", targetIdFilter);
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_promotion_orders")) {
      return NextResponse.json({ ok: true, orders: [], catalog, activeForTarget: null });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const orders = (data ?? []).map((r) => mapPointPromotionOrderRow(r as Record<string, unknown>));
  const now = Date.now();
  const activeForTarget =
    targetIdFilter
      ? orders.find((o) => {
          if (o.targetId !== targetIdFilter) return false;
          if (String(o.orderStatus ?? "").toLowerCase() !== "active") return false;
          const end = Date.parse(String(o.endAt ?? ""));
          return Number.isFinite(end) ? end >= now : true;
        }) ?? null
      : null;
  return NextResponse.json({
    ok: true,
    orders,
    catalog,
    activeForTarget,
  });
}

/**
 * POST — atomic Member content promotion (AST-001 only).
 * Body: { targetId, productId, targetTitle?, idempotencyKey? }
 * Header: Idempotency-Key (preferred)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    targetType?: PointPromotionTargetType;
    targetId?: string;
    targetTitle?: string;
    productId?: string;
    /** @deprecated legacy — ignored for price; mapped to product when productId missing */
    placement?: string;
    durationDays?: number;
    userNickname?: string;
    idempotencyKey?: string;
  };

  const targetId = body.targetId?.trim() ?? "";
  const targetType = body.targetType ?? "product";
  if (targetType !== "product") {
    return NextResponse.json(
      { ok: false, error: "unsupported_target_type", hint: "member_post_only" },
      { status: 400 }
    );
  }
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "targetId_required" }, { status: 400 });
  }

  let product = body.productId ? getMemberPromotionProduct(body.productId) : null;
  if (!product && body.placement && body.durationDays) {
    const days = Math.max(1, Math.min(90, Math.floor(Number(body.durationDays) || 7)));
    const mapped =
      days >= 14 ? "trade_promote_14" : "trade_promote_7";
    product = getMemberPromotionProduct(mapped);
  }
  if (!product) {
    product = getMemberPromotionProduct("trade_promote_7");
  }
  if (!product || product.priceAsset !== "D_POINT") {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }

  const idempotencyKey =
    (req.headers.get("idempotency-key") ?? body.idempotencyKey ?? "").trim() ||
    randomUUID();

  const { data: profile } = await sb
    .from("profiles")
    .select("nickname")
    .eq("id", auth.userId)
    .maybeSingle();
  const userNickname = body.userNickname?.trim() || String(profile?.nickname ?? "");
  const targetTitle = body.targetTitle?.trim() ?? "";

  const { data: rpcRaw, error: rpcErr } = await sb.rpc("purchase_member_content_promotion", {
    p_user_id: auth.userId,
    p_target_id: targetId,
    p_product_id: product.id,
    p_point_cost: product.pointCost,
    p_duration_days: product.durationDays,
    p_placement: product.placementPolicy,
    p_domain: product.domain,
    p_idempotency_key: idempotencyKey,
    p_user_nickname: userNickname,
    p_target_title: targetTitle,
  });

  if (rpcErr) {
    if (
      rpcErr.message?.includes("purchase_member_content_promotion") ||
      rpcErr.message?.includes("Could not find the function")
    ) {
      return NextResponse.json(
        { ok: false, error: "rpc_unavailable", hint: "apply migration 20261023120000" },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: false, error: rpcErr.message }, { status: 500 });
  }

  const rpc = (rpcRaw && typeof rpcRaw === "object" ? rpcRaw : {}) as {
    ok?: boolean;
    error?: string;
    code?: string;
    order_id?: string;
    balance_after?: number;
    idempotent?: boolean;
    start_at?: string;
    end_at?: string;
    point_cost?: number;
    product_id?: string;
  };

  if (!rpc.ok) {
    const err = rpc.error ?? "purchase_failed";
    const status =
      err === "insufficient_balance"
        ? 400
        : err === "already_active_promotion"
          ? 409
          : err === "forbidden"
            ? 403
            : err === "target_not_found"
              ? 404
              : err === "target_unavailable"
                ? 400
                : 400;
    return NextResponse.json(
      { ok: false, error: err, code: rpc.code ?? err },
      { status }
    );
  }

  const orderId = String(rpc.order_id ?? "");
  let order = null;
  if (orderId) {
    const { data: orderRow } = await sb
      .from("point_promotion_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (orderRow) {
      order = mapPointPromotionOrderRow(orderRow as Record<string, unknown>);
    }
  }

  return NextResponse.json({
    ok: true,
    order,
    balanceAfter: Number(rpc.balance_after ?? 0),
    idempotent: rpc.idempotent === true,
    productId: product.id,
    pointCost: product.pointCost,
    endAt: rpc.end_at ?? order?.endAt,
  });
}
