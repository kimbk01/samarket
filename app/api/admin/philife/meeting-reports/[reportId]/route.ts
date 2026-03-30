import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { updateMeetingReportStatus } from "@/lib/neighborhood/admin-meeting-reports";
import type { MeetingReportStatus } from "@/lib/neighborhood/admin-meeting-reports";

interface Ctx {
  params: Promise<{ reportId: string }>;
}

const VALID_STATUSES = new Set<MeetingReportStatus>(["pending", "reviewing", "resolved", "rejected"]);

async function isAdminUser(userId: string): Promise<boolean> {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return false;
  }
  const { data } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .maybeSingle();
  return !!(data as { role?: string } | null)?.role;
}

/** PATCH /api/admin/philife/meeting-reports/[reportId] — 신고 상태 변경 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { reportId } = await ctx.params;
  if (!reportId?.trim()) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  if (!(await isAdminUser(auth.userId))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

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
    auth.userId,
    body.action_result?.trim() || undefined
  );

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
