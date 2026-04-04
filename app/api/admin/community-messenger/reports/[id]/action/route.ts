import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runAdminCommunityMessengerReportAction } from "@/lib/admin-community-messenger/service";

type ReportAction =
  | "reviewing"
  | "resolved"
  | "rejected"
  | "sanction_message_hide"
  | "sanction_room_block";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  let body: { action?: ReportAction; adminNote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { id } = await params;
  const action = body.action;
  if (
    action !== "reviewing" &&
    action !== "resolved" &&
    action !== "rejected" &&
    action !== "sanction_message_hide" &&
    action !== "sanction_room_block"
  ) {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  const result = await runAdminCommunityMessengerReportAction({
    reportId: id,
    adminUserId: admin.userId,
    action,
    adminNote: body.adminNote,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
