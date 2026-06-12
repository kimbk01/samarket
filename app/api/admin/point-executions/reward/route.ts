import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { executePointRewardServer } from "@/lib/point-executions/execute-point-reward-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
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
    const execution = await executePointRewardServer(gate.sb, {
      boardKey: body.boardKey?.trim() || "general",
      actionType: body.actionType ?? "write",
      targetId: body.targetId?.trim() || `post-test-${Date.now()}`,
      targetType: body.targetType ?? "post",
      userId: body.userId.trim(),
      userNickname: body.userNickname?.trim() || "",
      userType: body.userType ?? "free",
    });
    return NextResponse.json({ ok: true, execution });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
