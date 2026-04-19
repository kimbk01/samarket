import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { updateMeetingReportStatus } from "@/lib/neighborhood/admin-meeting-reports";
import type { MeetingReportStatus } from "@/lib/neighborhood/admin-meeting-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ reportId: string }>;
}

const VALID_STATUSES = new Set<MeetingReportStatus>(["pending", "reviewing", "resolved", "rejected"]);

/** PATCH /api/admin/philife/meeting-reports/[reportId] — 신고 상태 변경 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { reportId } = await ctx.params;
  if (!reportId?.trim()) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { status?: string; action_result?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const newStatus = body.status as MeetingReportStatus;
  if (!VALID_STATUSES.has(newStatus)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const result = await updateMeetingReportStatus(
    reportId,
    newStatus,
    admin.userId,
    body.action_result?.trim() || undefined
  );

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
