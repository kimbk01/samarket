import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  loadStoreCashOrderGateMode,
  saveStoreCashOrderGateMode,
} from "@/lib/stores/commission/store-commission-writer";
import { STORE_CASH_ORDER_GATE_MODES, type StoreCashOrderGateMode } from "@/lib/stores/commission/store-commission-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 캐시 부족 매장 신규 주문 차단 정책 (DB 트리거와 같은 admin_settings 키). */
export async function PUT(req: NextRequest) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const { sb, actor } = gate;

  let body: { mode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const mode = (STORE_CASH_ORDER_GATE_MODES as readonly unknown[]).includes(body.mode)
    ? (body.mode as StoreCashOrderGateMode)
    : null;
  if (!mode) return NextResponse.json({ ok: false, error: "invalid_mode" }, { status: 400 });

  const before = await loadStoreCashOrderGateMode(sb);
  const saved = await saveStoreCashOrderGateMode(sb, mode);
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 500 });

  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actor.userId,
    target_type: "admin_setting",
    target_id: "store_cash_order_gate",
    action: "store_cash_order_gate.update",
    before_json: { mode: before },
    after_json: { mode },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, gateMode: mode });
}
