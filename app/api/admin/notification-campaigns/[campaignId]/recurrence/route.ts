import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { readAuditRequestIp } from "@/lib/admin/notification-campaigns/campaign-audit-log";
import { changeRecurringSchedule } from "@/lib/admin/notification-campaigns/campaign-recurrence-change";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — 「반복 설정」(시안 v3): 진행 중·일시정지 반복의 주기·요일·시각·기간 변경.
 * 반복은 실제 발송을 만든다 → `manage` 키(다시 보내기·재개와 같은 가드).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const gate = await requireAdminPermission("manage");
  if (!gate.ok) return gate.response;
  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await changeRecurringSchedule(
    svc,
    id,
    gate.actor.userId,
    {
      recurrence_kind: body.recurrence_kind,
      recurrence_time: body.recurrence_time,
      recurrence_weekday: body.recurrence_weekday,
      recurrence_start_at: body.recurrence_start_at,
      recurrence_end_at: body.recurrence_end_at,
    },
    readAuditRequestIp(req.headers)
  );
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, id: result.campaignId, status: result.status });
}
