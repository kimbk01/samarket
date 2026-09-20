import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
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
export async function POST(_req: NextRequest, ctx: Ctx): Promise<NextResponse> {
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
