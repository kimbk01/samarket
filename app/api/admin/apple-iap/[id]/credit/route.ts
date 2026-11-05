import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { appleIapIsUuid } from "@/lib/apple-iap/apple-iap-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/apple-iap/[id]/credit — 지급 재처리 (검증 완료 received 재시도 · 같은 준비 기록 재사용 검토 행 지급).
 * 지급·원장·credited 는 DB 함수 한 트랜잭션 (거래번호 1회).
 */
export async function POST(req: Request, ctx: Ctx) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  if (!appleIapIsUuid(id)) return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const note = String(body.note ?? "").trim();
  if (note.length < 2 || note.length > 500) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const { data, error } = await guard.sb.rpc("apple_iap_credit", {
    p_attempt_id: id,
    p_admin_user_id: guard.actor.userId,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return NextResponse.json({ ok: false, error: String(r.error ?? "credit_failed") }, { status: 409 });
  }
  if (r.idempotent !== true) {
    await appendAdminRouteAudit(guard.sb, req, {
      actorId: guard.actor.userId,
      targetType: "apple_iap_transaction",
      targetId: id,
      action: "apple_iap.credit",
      after: { ...r, note },
    });
  }
  return NextResponse.json({ ok: true, result: r });
}
