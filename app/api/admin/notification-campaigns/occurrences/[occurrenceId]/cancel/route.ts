import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { cancelQueuedOccurrence } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — cancel a queued scheduled occurrence */
export async function POST(req: NextRequest, ctx: { params: Promise<{ occurrenceId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { occurrenceId } = await ctx.params;
  const id = typeof occurrenceId === "string" ? occurrenceId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const result = await cancelQueuedOccurrence(svc, id, admin.userId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }

  const { data: occ } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("campaign_id")
    .eq("id", id)
    .maybeSingle();

  if (occ?.campaign_id) {
    await svc
      .from("admin_notification_campaigns")
      .update({
        status: "draft",
        cancelled_by: admin.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", occ.campaign_id)
      .eq("status", "scheduled");
  }

  return NextResponse.json({ ok: true, occurrence_id: id });
}
