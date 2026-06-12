import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { getPointCostForPromotion } from "@/lib/points/promotion-point-cost";
import {
  assertPromotionTargetOwned,
  hasActivePromotionOrderOnTarget,
  mapPointPromotionOrderRow,
} from "@/lib/points/point-promotion-orders-db";
import { creditUserPoints, readUserPointBalance, spendUserPoints } from "@/lib/points/user-point-ledger";
import { isMissingPointsTable } from "@/lib/points/admin-user-points-shared";
import type { PointPromotionPlacement, PointPromotionTargetType } from "@/lib/types/point";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: true, orders: [] });

  const { data, error } = await sb
    .from("point_promotion_orders")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_promotion_orders")) {
      return NextResponse.json({ ok: true, orders: [] });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    orders: (data ?? []).map((r) => mapPointPromotionOrderRow(r as Record<string, unknown>)),
  });
}

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
    placement?: PointPromotionPlacement;
    durationDays?: number;
    userNickname?: string;
  };

  const targetId = body.targetId?.trim() ?? "";
  const targetType = body.targetType ?? "product";
  const placement = body.placement ?? "home_top";
  const durationDays = Math.max(1, Math.min(90, Math.floor(Number(body.durationDays) || 7)));
  const pointCost = getPointCostForPromotion(placement, durationDays);

  if (!targetId) {
    return NextResponse.json({ ok: false, error: "targetId_required" }, { status: 400 });
  }

  const owned = await assertPromotionTargetOwned(sb, auth.userId, targetType, targetId);
  if (!owned.ok) {
    const status =
      owned.error === "forbidden"
        ? 403
        : owned.error === "target_not_found"
          ? 404
          : 400;
    return NextResponse.json({ ok: false, error: owned.error }, { status });
  }

  if (await hasActivePromotionOrderOnTarget(sb, targetType, targetId, placement)) {
    return NextResponse.json({ ok: false, error: "already_active_promotion" }, { status: 409 });
  }

  const balance = await readUserPointBalance(sb, auth.userId);
  if (balance < pointCost) {
    return NextResponse.json(
      { ok: false, error: "insufficient_balance", code: "insufficient_balance" },
      { status: 400 }
    );
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("nickname")
    .eq("id", auth.userId)
    .maybeSingle();
  const userNickname = body.userNickname?.trim() || String(profile?.nickname ?? "");
  const targetTitle = body.targetTitle?.trim() || owned.targetTitle || "";

  const orderId = randomUUID();
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationDays * 86400000);

  const spend = await spendUserPoints(sb, {
    userId: auth.userId,
    amount: pointCost,
    entryType: "spend",
    relatedType: "promotion_order",
    relatedId: orderId,
    description: `프로모션 주문 (${placement}, ${durationDays}일)`,
    actorType: "user",
  });

  if (!spend.ok) {
    const status = spend.code === "insufficient_balance" ? 400 : 500;
    return NextResponse.json({ ok: false, error: spend.error, code: spend.code }, { status });
  }

  const { data: orderRow, error: orderErr } = await sb
    .from("point_promotion_orders")
    .insert({
      id: orderId,
      user_id: auth.userId,
      user_nickname: userNickname,
      target_type: targetType,
      target_id: targetId,
      target_title: targetTitle,
      placement,
      duration_days: durationDays,
      point_cost: pointCost,
      order_status: "active",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
    })
    .select("*")
    .single();

  if (orderErr) {
    await creditUserPoints(sb, {
      userId: auth.userId,
      amount: pointCost,
      entryType: "refund",
      relatedType: "promotion_order",
      relatedId: orderId,
      description: `프로모션 주문 생성 실패 환불 (${placement})`,
      actorType: "system",
    });
    if (isMissingPointsTable(orderErr.message ?? "", "point_promotion_orders")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: orderErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    order: mapPointPromotionOrderRow(orderRow as Record<string, unknown>),
    balanceAfter: spend.balanceAfter,
  });
}
