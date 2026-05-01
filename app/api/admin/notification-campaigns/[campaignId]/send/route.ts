import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { runNotificationCampaignSendBatch } from "@/lib/admin/notification-campaigns/run-campaign-send-batch";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — 배치 1회 발송 (프런트에서 done까지 반복 호출) */
export async function POST(_req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const result = await runNotificationCampaignSendBatch(svc, id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "batch_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    processed: result.processed,
    sent: result.sent,
    skipped: result.skipped,
    failed: result.failed,
    done: result.done,
  });
}
