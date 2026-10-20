import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { executePointRewardServer } from "@/lib/point-executions/execute-point-reward-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 실제 포인트 지급 — 최고관리자만
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;
  const body = (await req.json().catch(() => ({}))) as {
    boardKey?: string;
    actionType?: "write" | "comment";
    targetId?: string;
    targetType?: "post" | "comment";
    userId?: string;
    userNickname?: string;
    userType?: "free" | "premium";
    /** V3-07: 실지급 사유 (2자 이상 필수) */
    reason?: string;
    /** V3-07: 확인창에서 다시 입력한 지급 포인트 — 실제 계산액이 넘으면 지급하지 않음 */
    confirmedPoint?: number;
  };
  if (!body.userId?.trim()) {
    return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 2) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }
  const confirmedPoint =
    body.confirmedPoint == null ? undefined : Math.trunc(Number(body.confirmedPoint));
  if (confirmedPoint !== undefined && (!Number.isFinite(confirmedPoint) || confirmedPoint < 0)) {
    return NextResponse.json({ ok: false, error: "invalid_confirmed_point" }, { status: 400 });
  }
  try {
    const input = {
      boardKey: body.boardKey?.trim() || "general",
      actionType: body.actionType ?? "write",
      targetId: body.targetId?.trim() || `post-test-${Date.now()}`,
      targetType: body.targetType ?? "post",
      userId: body.userId.trim(),
      userNickname: body.userNickname?.trim() || "",
      userType: body.userType ?? "free",
      reason: reason.slice(0, 300),
      confirmedMaxPoint: confirmedPoint,
    } as const;
    const execution = await executePointRewardServer(gate.sb, input);
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "user",
      targetId: input.userId,
      action: "point_execution.reward",
      after: {
        reason: input.reason,
        input: { ...input },
        execution: (execution ?? null) as unknown as Record<string, unknown> | null,
      },
    });
    return NextResponse.json({ ok: true, execution });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
