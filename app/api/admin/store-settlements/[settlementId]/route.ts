import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = {
  settlement_status?: string;
  hold_reason?: string | null;
};

/**
 * 관리자: 정산 지급 완료 / 보류
 * - paid: scheduled|processing → paid, paid_at 설정
 * - held: scheduled → held + hold_reason
 * - processing: scheduled → processing (지급 준비 중)
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ settlementId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { settlementId } = await context.params;
  const sid = typeof settlementId === "string" ? settlementId.trim() : "";
  if (!sid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const next = String(body.settlement_status ?? "").trim();
  if (next !== "paid" && next !== "held" && next !== "processing") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: preRow } = await sb
    .from("store_settlements")
    .select("settlement_status, order_id, store_id")
    .eq("id", sid)
    .maybeSingle();

  const logSettlement = async (after: Record<string, unknown>) => {
    const actorId = await getRouteUserId();
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: actorId,
      target_type: "store_settlement",
      target_id: sid,
      action: "store_settlement.update",
      before_json: preRow
        ? {
            settlement_status: preRow.settlement_status,
            order_id: preRow.order_id,
          }
        : null,
      after_json: after,
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
  };

  const now = new Date().toISOString();

  if (next === "paid") {
    const { data: updated, error } = await sb
      .from("store_settlements")
      .update({
        settlement_status: "paid",
        paid_at: now,
        hold_reason: null,
      })
      .eq("id", sid)
      .in("settlement_status", ["scheduled", "processing"])
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.message?.includes("does not exist")) {
        return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 409 });
    }
    await logSettlement({ settlement_status: "paid", paid_at: now });
    return NextResponse.json({ ok: true, settlement_status: "paid" });
  }

  if (next === "processing") {
    const { data: updated, error } = await sb
      .from("store_settlements")
      .update({ settlement_status: "processing" })
      .eq("id", sid)
      .eq("settlement_status", "scheduled")
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, settlement_status: "processing" });
  }

  const holdReason = String(body.hold_reason ?? "").trim().slice(0, 500);
  if (!holdReason) {
    return NextResponse.json({ ok: false, error: "hold_reason_required" }, { status: 400 });
  }

  const { data: updated, error } = await sb
    .from("store_settlements")
    .update({ settlement_status: "held", hold_reason: holdReason })
    .eq("id", sid)
    .eq("settlement_status", "scheduled")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ ok: false, error: "invalid_state" }, { status: 409 });
  }
  await logSettlement({ settlement_status: "held", hold_reason: holdReason });
  return NextResponse.json({ ok: true, settlement_status: "held" });
}
