import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { findPromotionPurchaseReplay } from "@/lib/promotion/promotion-purchase-replay";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { isTradeBoostOrderOngoing } from "@/lib/promotion/trade-boost-order-state";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import type { MemberPromotionDomain } from "@/lib/points/promotion-products";
import {
  getMemberPromotionProductLive,
  loadMemberPromotionProducts,
  memberPromotionPriceMatches,
  type MemberPromotionProductLive,
} from "@/lib/points/member-promotion-products-server";
import {
  mapPointPromotionOrderRow,
} from "@/lib/points/point-promotion-orders-db";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import type { PointPromotionTargetType } from "@/lib/types/point";
import {
  applyCommunityPaidExposureImmediate,
  applyCommunityPaidExposurePending,
} from "@/lib/promotion/apply-community-paid-exposure";
import { applyTradePaidExposurePending } from "@/lib/promotion/apply-trade-paid-exposure";
import { readUserPointBalance } from "@/lib/points/user-point-ledger";
import { resolvePointHistoryPeriod } from "@/lib/points/point-period-history";
import {
  loadPromotionOrdersPage,
  parsePromotionOrderPageParams,
} from "@/lib/points/promotion-order-history";
import { invalidPeriodResponse } from "@/lib/stores/commission/period-input-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/points/promotion-orders
 * — my entitlements + optional ?catalog=1 for product SSOT
 * 쪽 모드 (C-5 · 신청 내역 화면): `offset=&limit=` + `period=&from=&to=` (PHT 날짜, 신청일 기준) · `summary=0`(합계 생략)
 *   → `{ orders, total, offset, limit, period, periodSummary }` — 50건 잘림 없음, 합계는 기간 전체.
 * `offset` 이 없으면 예전 응답(최근 50건 · `targetId` 거르기) 그대로 — 광고 시트·내 상품 등 호출처 유지.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const wantCatalog = req.nextUrl.searchParams.get("catalog") === "1";
  const targetIdFilter = (req.nextUrl.searchParams.get("targetId") ?? "").trim();
  const domainParam = (req.nextUrl.searchParams.get("domain") ?? "").trim() as
    | MemberPromotionDomain
    | "";
  const catalogDomain: MemberPromotionDomain | undefined =
    domainParam === "trade" || domainParam === "community" ? domainParam : undefined;
  const sb = tryCreateSupabaseServiceClient();
  /** 가격·기간·사용 여부 = DB `member_promotion_products` (표가 없으면 코드 처음 값) */
  const catalogProducts =
    wantCatalog && sb
      ? await loadMemberPromotionProducts(sb, { domain: catalogDomain }).catch(() => null)
      : null;
  if (wantCatalog && sb && !catalogProducts) {
    return NextResponse.json({ ok: false, error: "catalog_load_failed" }, { status: 500 });
  }
  const catalog = catalogProducts
    ? catalogProducts.map((p) => ({
        id: p.id,
        revision: p.revision,
        domain: p.domain,
        durationDays: p.durationDays,
        pointCost: p.pointCost,
        priceAsset: p.priceAsset,
        requiresAdminApproval: p.requiresAdminApproval,
        titleKey: p.titleKey,
        descriptionKey: p.descriptionKey,
        fallbackTitleKo: p.fallbackTitleKo,
        fallbackTitleEn: p.fallbackTitleEn,
        fallbackDescKo: p.fallbackDescKo,
        fallbackDescEn: p.fallbackDescEn,
      }))
    : undefined;

  if (!sb) {
    return NextResponse.json({ ok: true, orders: [], catalog, activeForTarget: null });
  }

  const pageParams = parsePromotionOrderPageParams(req.nextUrl.searchParams);
  if (pageParams) {
    const badPeriod = invalidPeriodResponse(req.nextUrl.searchParams);
    if (badPeriod) return badPeriod;
    const period = resolvePointHistoryPeriod(req.nextUrl.searchParams);
    const pageRes = await loadPromotionOrdersPage(sb, {
      userId: auth.userId,
      fromIso: period.fromIso,
      toIso: period.toIso,
      offset: pageParams.offset,
      limit: pageParams.limit,
      withSummary: req.nextUrl.searchParams.get("summary") !== "0",
    });
    if (!pageRes.ok) {
      if (isMissingPointsTable(pageRes.error, "point_promotion_orders")) {
        return NextResponse.json({
          ok: true,
          orders: [],
          total: 0,
          offset: pageParams.offset,
          limit: pageParams.limit,
          period,
          periodSummary: null,
          catalog,
        });
      }
      return NextResponse.json({ ok: false, error: pageRes.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, ...pageRes.page, period, catalog });
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
  /** 판정 1곳 (재감사 B-1): DB 결제 함수 E-15 와 같음 — 일시정지는 종료일과 관계없이 진행 중 */
  const activeForTarget =
    targetIdFilter
      ? orders.find((o) => o.targetId === targetIdFilter && isTradeBoostOrderOngoing(o, now)) ?? null
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
    /** 화면에 보였던 금액·기간 — 지금 값과 다르면 결제하지 않고 409 price_changed */
    expectedPointCost?: number;
    expectedDurationDays?: number;
  };

  const targetId = body.targetId?.trim() ?? "";
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "targetId_required" }, { status: 400 });
  }

  let product: MemberPromotionProductLive | null = null;
  try {
    product = body.productId ? await getMemberPromotionProductLive(sb, body.productId) : null;
  } catch {
    return NextResponse.json({ ok: false, error: "catalog_load_failed" }, { status: 500 });
  }
  /** 거래 J PR-1 (2026-10-28): 상품 id 를 보냈는데 카탈로그에 없으면 결제하지 않는다(예전에는 7일 상품으로 바꿔 결제) */
  if (body.productId && !product) {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }
  if (!product && body.placement && body.durationDays) {
    const days = Math.max(1, Math.min(90, Math.floor(Number(body.durationDays) || 7)));
    const mapped =
      days >= 14 ? "trade_promote_14" : "trade_promote_7";
    product = await getMemberPromotionProductLive(sb, mapped).catch(() => null);
  }
  if (!product && !body.productId) {
    product = await getMemberPromotionProductLive(sb, "trade_promote_7").catch(() => null);
  }
  if (!product || product.priceAsset !== "D_POINT") {
    return NextResponse.json({ ok: false, error: "invalid_product" }, { status: 400 });
  }
  // 재감사 R-04 (P0): 같은 요청 키 재전송은 가격 비교보다 먼저 처음 결과를 돌려준다 (추가 차감 없음).
  const replayKey = (req.headers.get("idempotency-key") ?? body.idempotencyKey ?? "").trim();
  if (replayKey) {
    const replay = await findPromotionPurchaseReplay(sb, auth.userId, replayKey);
    if (replay) {
      const { data: replayRow } = await sb
        .from("point_promotion_orders")
        .select("*")
        .eq("id", replay.orderId)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        idempotent: true,
        extended: replay.extended,
        order: replayRow ? mapPointPromotionOrderRow(replayRow as Record<string, unknown>) : null,
        balanceAfter: await readUserPointBalance(sb, auth.userId),
        pendingReview: replay.status === "pending_review",
        status: replay.status,
        productId: replay.productId ?? product.id,
        pointCost: replay.pointCost ?? product.pointCost,
        startAt: replay.startAt ?? undefined,
        endAt: replay.endAt ?? undefined,
      });
    }
  }
  if (
    !memberPromotionPriceMatches(product, {
      pointCost: body.expectedPointCost,
      durationDays: body.expectedDurationDays,
    })
  ) {
    return priceChangedResponse(product);
  }

  const targetType: PointPromotionTargetType =
    body.targetType ??
    (product.domain === "community" ? "community_post" : "product");

  if (product.domain === "trade" && targetType !== "product") {
    return NextResponse.json(
      { ok: false, error: "unsupported_target_type", hint: "trade_product_only" },
      { status: 400 }
    );
  }
  if (product.domain === "community" && targetType !== "community_post") {
    return NextResponse.json(
      { ok: false, error: "unsupported_target_type", hint: "community_post_only" },
      { status: 400 }
    );
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

  if (product.domain === "community") {
    const applied = product.requiresAdminApproval
      ? await applyCommunityPaidExposurePending(sb, {
          userId: auth.userId,
          postId: targetId,
          productId: product.id,
          product,
          targetTitle,
          userNickname,
          idempotencyKey,
        })
      : await applyCommunityPaidExposureImmediate(sb, {
          userId: auth.userId,
          postId: targetId,
          productId: product.id,
          product,
          targetTitle,
          userNickname,
          idempotencyKey,
        });
    if (!applied.ok) {
      const status =
        applied.error === "insufficient_balance"
          ? 400
          : applied.error === "already_active_promotion"
            ? 409
            : applied.error === "forbidden"
              ? 403
              : applied.error === "target_not_found"
                ? 404
                : applied.error === "target_unavailable"
                  ? 400
                  : applied.error === "rpc_unavailable"
                    ? 503
                    : 400;
      return NextResponse.json(
        { ok: false, error: applied.error, code: applied.error },
        { status }
      );
    }
    const { data: orderRow } = await sb
      .from("point_promotion_orders")
      .select("*")
      .eq("id", applied.orderId)
      .maybeSingle();
    const order = orderRow
      ? mapPointPromotionOrderRow(orderRow as Record<string, unknown>)
      : null;
    const balanceAfter = await readUserPointBalance(sb, auth.userId);
    const pendingReview = applied.status === "pending_review";
    return NextResponse.json({
      ok: true,
      order,
      balanceAfter,
      pendingReview,
      productId: product.id,
      pointCost: product.pointCost,
      endAt: applied.endAt,
      startAt: applied.startAt,
      status: applied.status,
      /** 재감사 R2: 광고 중인 글에 다시 결제 → 같은 주문 연장 */
      extended: applied.extended === true,
      /** 재감사 R-03: 같은 결제 재전송 — 거래 응답과 같은 칸 (화면이 「이미 처리된 결제예요」를 보여 준다) */
      idempotent: applied.idempotent === true,
    });
  }

  if (product.requiresAdminApproval) {
    const applied = await applyTradePaidExposurePending(sb, {
      userId: auth.userId,
      postId: targetId,
      productId: product.id,
      product,
      targetTitle,
      userNickname,
      idempotencyKey,
    });
    if (!applied.ok) {
      const status =
        applied.error === "insufficient_balance"
          ? 400
          : applied.error === "already_active_promotion"
            ? 409
            : applied.error === "forbidden"
              ? 403
              : applied.error === "target_not_found"
                ? 404
                : applied.error === "target_unavailable"
                  ? 400
                  : 400;
      return NextResponse.json(
        { ok: false, error: applied.error, code: applied.error },
        { status }
      );
    }
    const { data: orderRow } = await sb
      .from("point_promotion_orders")
      .select("*")
      .eq("id", applied.orderId)
      .maybeSingle();
    const order = orderRow
      ? mapPointPromotionOrderRow(orderRow as Record<string, unknown>)
      : null;
    const balanceAfter = await readUserPointBalance(sb, auth.userId);
    return NextResponse.json({
      ok: true,
      order,
      balanceAfter,
      pendingReview: applied.status === "pending_review",
      productId: product.id,
      pointCost: product.pointCost,
      endAt: applied.endAt,
      status: applied.status,
    });
  }

  const { data: rpcRaw, error: rpcErr } = await purchaseTradePromotion(sb, {
    product,
    userId: auth.userId,
    targetId,
    idempotencyKey,
    userNickname,
    targetTitle,
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
    duration_days?: number;
    product_id?: string;
    /** 재감사 R2: 광고 중인 같은 글 주문을 늘렸음 */
    extended?: boolean;
  };

  if (!rpc.ok) {
    const err = rpc.error ?? "purchase_failed";
    /** 결제 순간 어드민이 가격을 바꿨으면 결제·차감 없이 새 값 돌려줌 */
    if (err === "price_changed") {
      return priceChangedResponse({
        id: product.id,
        pointCost: Number(rpc.point_cost ?? product.pointCost),
        durationDays: Number(rpc.duration_days ?? product.durationDays),
      });
    }
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
    extended: rpc.extended === true,
  });
}

/** 409 — 화면 금액·기간이 지금 가격과 다름. 결제·차감 없음. 화면은 `product` 로 다시 그린다 */
function priceChangedResponse(product: { id: string; pointCost: number; durationDays: number }) {
  return NextResponse.json(
    {
      ok: false,
      error: "price_changed",
      code: "price_changed",
      product: { id: product.id, pointCost: product.pointCost, durationDays: product.durationDays },
    },
    { status: 409 }
  );
}

/**
 * 거래 상위노출 즉시 결제.
 * DB 가격표가 있으면 `purchase_member_content_promotion_v2` — 가격을 함수 안에서 다시 읽어(잠금) 다르면 price_changed,
 * 주문에 가격 버전(product_revision)을 남긴다. 표·함수가 아직 없으면(마이그레이션 적용 전) 기존 함수로 코드 처음 값 결제.
 */
async function purchaseTradePromotion(
  sb: NonNullable<ReturnType<typeof tryCreateSupabaseServiceClient>>,
  input: {
    product: MemberPromotionProductLive;
    userId: string;
    targetId: string;
    idempotencyKey: string;
    userNickname: string;
    targetTitle: string;
  }
) {
  const { product } = input;
  if (product.source === "db") {
    const v2 = await sb.rpc("purchase_member_content_promotion_v2", {
      p_user_id: input.userId,
      p_target_id: input.targetId,
      p_product_id: product.id,
      p_expected_point_cost: product.pointCost,
      p_expected_duration_days: product.durationDays,
      p_idempotency_key: input.idempotencyKey,
      p_user_nickname: input.userNickname,
      p_target_title: input.targetTitle,
    });
    const missing =
      v2.error &&
      (v2.error.message?.includes("purchase_member_content_promotion_v2") ||
        v2.error.message?.includes("Could not find the function"));
    if (!missing) return v2;
  }
  return sb.rpc("purchase_member_content_promotion", {
    p_user_id: input.userId,
    p_target_id: input.targetId,
    p_product_id: product.id,
    p_point_cost: product.pointCost,
    p_duration_days: product.durationDays,
    p_placement: product.placementPolicy,
    p_domain: product.domain,
    p_idempotency_key: input.idempotencyKey,
    p_user_nickname: input.userNickname,
    p_target_title: input.targetTitle,
  });
}
