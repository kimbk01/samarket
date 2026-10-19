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
  };
  if (!body.userId?.trim()) {
    return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
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
    } as const;
    const execution = await executePointRewardServer(gate.sb, input);
    await appendAdminRouteAudit(gate.sb, req, {
      actorId: gate.actor.userId,
      targetType: "user",
      targetId: input.userId,
      action: "point_execution.reward",
      after: {
        input: { ...input },
        execution: (execution ?? null) as unknown as Record<string, unknown> | null,
      },
    });
    return NextResponse.json({ ok: true, execution });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
