import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { isCommunityMessengerCallForceEndReasonCode } from "@/lib/admin-community-messenger/call-force-end-reasons";
import { runAdminCommunityMessengerCallSessionAction } from "@/lib/admin-community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CallAction = "force_end";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { action?: CallAction; adminNote?: string; reasonCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.action !== "force_end") {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  if (!body.adminNote?.trim()) {
    return NextResponse.json({ ok: false, error: "admin_note_required" }, { status: 400 });
  }

  if (!isCommunityMessengerCallForceEndReasonCode(body.reasonCode)) {
    return NextResponse.json({ ok: false, error: "reason_code_required" }, { status: 400 });
  }

  const { sessionId } = await params;
  const result = await runAdminCommunityMessengerCallSessionAction({
    sessionId,
    adminUserId: admin.userId,
    action: body.action,
    reasonCode: body.reasonCode,
    adminNote: body.adminNote,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
