import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { listDistributionsForEvent } from "@/lib/platform-promotion-distribution/repository";
import { assertExplicitPushSendAllowed } from "@/lib/platform-promotion-distribution/save-event-distribution";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * POST — explicit Push SEND for Event distribution.
 * Requires Push toggle ON + configured campaign ref.
 * Does not run on Event publish or distribution save.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { eventId } = await ctx.params;
  const id = String(eventId ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const rows = await listDistributionsForEvent(sb, id);
  const pushRow = rows.find((r) => r.channel === "push");
  const gate = assertExplicitPushSendAllowed({
    pushEnabled: Boolean(pushRow?.enabled),
    distributionPushRefId: pushRow?.channelRefId ?? null,
  });
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: 400 });
  }

  const campaignId = String(pushRow?.channelRefId);
  // V3-10: 이벤트 Push 발송 요청 감사 — 연결 캠페인의 수신 대상 수와 함께 기록 (실제 발송 감사는 캠페인 send).
  const { data: campaignRow } = await sb
    .from("admin_notification_campaigns")
    .select("target_count")
    .eq("id", campaignId)
    .maybeSingle();
  const rawTargetCount = (campaignRow as { target_count?: unknown } | null)?.target_count;
  const recipientCount =
    rawTargetCount == null || !Number.isFinite(Number(rawTargetCount)) ? null : Number(rawTargetCount);
  await appendAdminRouteAudit(sb, req, {
    actorId: admin.userId,
    targetType: "platform_event",
    targetId: id,
    action: "platform_event.push_send",
    after: { campaign_id: campaignId, recipient_count: recipientCount },
  });
  // Hand off to existing Admin campaign send endpoint contract (no new sender).
  return NextResponse.json({
    ok: true,
    sendRequiredViaExistingEngine: true,
    campaignId,
    sendPath: `/api/admin/notification-campaigns/${encodeURIComponent(campaignId)}/send`,
    deeplink: gate.deeplink(id),
    note: "Use existing notification campaign SEND — Distribution does not invent a new Push sender.",
  });
}
