import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { chargePointsOnTradePostAdActivation } from "@/lib/trade-ads/charge-trade-post-ad-points";
import { releaseHeldPointsForTradePostAd } from "@/lib/trade-ads/trade-post-ad-point-flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `select('*')` 지양 — 응답·DB 대역 최소화 (스키마: trade_post_ads 마이그레이션) */
const TRADE_POST_ADS_ROW =
  "id, post_id, user_id, ad_product_id, apply_status, point_cost, priority, start_at, end_at, admin_memo, approved_by, approved_at, rejected_by, rejected_at, created_at, updated_at";

type Body = {
  action?: "verify" | "activate" | "reject" | "cancel" | "end";
  apply_status?: string;
  start_at?: string | null;
  end_at?: string | null;
  admin_memo?: string | null;
  /** 활성화 시 포인트 차감 (기본 true) */
  charge_points?: boolean;
};

function resolveNextStatus(prevStatus: string, body: Body): { nextStatus: string; actionMode: string } {
  const action = body.action?.trim();
  if (action === "verify") {
    if (prevStatus !== "pending") {
      throw new Error("확인 완료는 신청 대기(pending) 상태에서만 가능합니다.");
    }
    return { nextStatus: "approved", actionMode: "verify" };
  }
  if (action === "activate") {
    if (prevStatus !== "approved") {
      throw new Error("활성화는 확인 완료(approved) 상태에서만 가능합니다.");
    }
    return { nextStatus: "active", actionMode: "activate" };
  }
  if (action === "reject") {
    if (prevStatus !== "pending" && prevStatus !== "approved") {
      throw new Error("반려는 신청/확인 단계에서만 가능합니다.");
    }
    return { nextStatus: "rejected", actionMode: "reject" };
  }
  if (action === "cancel") {
    return { nextStatus: "cancelled", actionMode: "cancel" };
  }
  if (action === "end") {
    if (prevStatus !== "active") {
      throw new Error("종료는 노출중(active) 상태에서만 가능합니다.");
    }
    return { nextStatus: "ended", actionMode: "end" };
  }
  return {
    nextStatus: body.apply_status?.trim() ?? prevStatus,
    actionMode: "legacy",
  };
}

/**
 * PATCH /api/admin/trade-post-ads/[id]
 * - 신청 확인(verify): pending -> approved
 * - 심사 집행(activate): approved -> active (+포인트 확정/차감)
 * - 반려(reject): pending|approved -> rejected (+hold 해제)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const id = (await params).id?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "Supabase 서비스 클라이언트가 없습니다." }, { status: 503 });
  }

  const { data: row, error: re } = await sb
    .from("trade_post_ads")
    .select(TRADE_POST_ADS_ROW)
    .eq("id", id)
    .maybeSingle();
  if (re || !row || typeof row !== "object") {
    return NextResponse.json({ ok: false, error: re?.message ?? "행 없음" }, { status: 404 });
  }

  const prev = row as Record<string, unknown>;
  const prevStatus = String(prev.apply_status ?? "");
  let nextStatus = prevStatus;
  let actionMode = "legacy";
  try {
    const resolved = resolveNextStatus(prevStatus, body);
    nextStatus = resolved.nextStatus;
    actionMode = resolved.actionMode;
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "상태 전이 오류" },
      { status: 400 }
    );
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.apply_status != null) patch.apply_status = nextStatus;
  if (body.start_at !== undefined) patch.start_at = body.start_at;
  if (body.end_at !== undefined) patch.end_at = body.end_at;
  if (body.admin_memo !== undefined) patch.admin_memo = body.admin_memo;

  if (body.action && body.apply_status == null) {
    patch.apply_status = nextStatus;
  }

  const activating = nextStatus === "active" && prevStatus !== "active";
  const chargePoints = body.charge_points !== false;
  const releasing =
    (nextStatus === "rejected" || nextStatus === "cancelled") && prevStatus !== nextStatus;

  if (releasing) {
    const rel = await releaseHeldPointsForTradePostAd(sb, { tradePostAdId: id });
    if (!rel.ok) {
      return NextResponse.json({ ok: false, error: rel.error }, { status: 400 });
    }
    if (nextStatus === "rejected") {
      patch.rejected_at = new Date().toISOString();
      patch.rejected_by = admin.userId;
    }
  }

  if (actionMode === "verify") {
    patch.approved_at = patch.approved_at ?? new Date().toISOString();
    patch.approved_by = admin.userId;
  }

  if (activating && chargePoints) {
    if ((body.start_at == null || body.start_at === "") && (prev.start_at == null || prev.start_at === "")) {
      patch.start_at = new Date().toISOString();
    }
    if ((body.end_at == null || body.end_at === "") && (prev.end_at == null || prev.end_at === "")) {
      const adProductId = String(prev.ad_product_id ?? "").trim();
      let days = 3;
      if (adProductId) {
        const { data: product } = await sb
          .from("ad_products")
          .select("duration_days")
          .eq("id", adProductId)
          .maybeSingle();
        days = Math.max(1, Math.floor(Number((product as { duration_days?: number } | null)?.duration_days ?? 3)));
      }
      const baseStart = new Date(String(patch.start_at ?? prev.start_at ?? new Date().toISOString()));
      patch.end_at = new Date(baseStart.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    }
    const cost = Math.max(0, Math.floor(Number(prev.point_cost ?? 0)));
    const uid = String(prev.user_id ?? "");
    if (!uid) {
      return NextResponse.json({ ok: false, error: "user_id 없음" }, { status: 400 });
    }
    const ch = await chargePointsOnTradePostAdActivation(sb, {
      tradePostAdId: id,
      advertiserUserId: uid,
      pointCost: cost,
    });
    if (!ch.ok) {
      return NextResponse.json({ ok: false, error: ch.error }, { status: 400 });
    }
    patch.approved_at = patch.approved_at ?? new Date().toISOString();
    patch.approved_by = admin.userId;
  }

  const { data: updated, error: ue } = await sb
    .from("trade_post_ads")
    .update(patch)
    .eq("id", id)
    .select(TRADE_POST_ADS_ROW)
    .maybeSingle();

  if (ue) {
    return NextResponse.json({ ok: false, error: ue.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, row: updated });
}
