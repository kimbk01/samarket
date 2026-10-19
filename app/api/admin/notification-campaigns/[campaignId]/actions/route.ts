import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { readAuditRequestIp } from "@/lib/admin/notification-campaigns/campaign-audit-log";
import {
  loadCampaignForAction,
  runCampaignLifecycleAction,
  writeLifecycleAudit,
} from "@/lib/admin/notification-campaigns/campaign-lifecycle-service";
import { isCampaignAction } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Actions served here; send/resend use POST .../send, edit uses PATCH. */
const LIFECYCLE_ROUTE_ACTIONS = new Set([
  "schedule",
  "cancel",
  "stop_sending",
  "pause",
  "resume",
  "stop_recurring",
  "archive",
  "unarchive",
  "duplicate",
]);

/**
 * POST — campaign lifecycle action `{ action }` (ADM-03 cancel/stop, ADM-04 schedule, archive,
 * duplicate). Gated by the status machine; every success writes an audit row.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: { action?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const action = typeof body?.action === "string" ? body.action.trim() : "";
  if (!isCampaignAction(action) || !LIFECYCLE_ROUTE_ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const loaded = await loadCampaignForAction(svc, id);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
  }

  const outcome = await runCampaignLifecycleAction(svc, loaded.loaded, admin.userId, action);
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: outcome.status });
  }
  await writeLifecycleAudit(svc, outcome, admin.userId, readAuditRequestIp(req.headers));

  return NextResponse.json({
    ok: true,
    action: outcome.action,
    campaign_id: outcome.campaignId,
    from_status: outcome.fromStatus,
    to_status: outcome.toStatus,
    ...(outcome.extra ?? {}),
  });
}
