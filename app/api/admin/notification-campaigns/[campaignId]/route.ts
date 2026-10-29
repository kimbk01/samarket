import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import {
  isCampaignEditSendAffecting,
  isCampaignSendCausingAction,
} from "@/lib/admin/notification-campaigns/campaign-send-permission";
import { listCampaignOccurrences } from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  mergeCampaignPatchOverRow,
  parseCampaignWriteInput,
  type CampaignWriteBody,
} from "@/lib/admin/notification-campaigns/campaign-input";
import {
  buildCampaignActionContext,
  campaignActionForStatusChange,
  editCampaign,
  loadCampaignForAction,
  runCampaignLifecycleAction,
  writeLifecycleAudit,
} from "@/lib/admin/notification-campaigns/campaign-lifecycle-service";
import {
  CAMPAIGN_AUDIT_TABLE,
  isMissingRelationError,
  readAuditRequestIp,
} from "@/lib/admin/notification-campaigns/campaign-audit-log";
import {
  authorDisplayName,
  loadOpenedCountsByOccurrence,
} from "@/lib/admin/notification-campaigns/campaign-list-service";
import {
  allowedCampaignActions,
  resolveEffectiveCampaignStatus,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
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

  const { data: camp, error } = await svc.from("admin_notification_campaigns").select("*").eq("id", id).maybeSingle();
  if (error || !camp) {
    return NextResponse.json({ ok: false, error: error?.message ?? "not_found" }, { status: error ? 500 : 404 });
  }

  const occurrences = await listCampaignOccurrences(svc, id, 50);
  const latest = occurrences[0] ?? null;

  const occurrenceId = latest?.id;
  let deviceDeliveryLog: Array<Record<string, unknown>> = [];
  if (occurrenceId) {
    const { data: deliveries } = await svc
      .from("notification_campaign_deliveries")
      .select("user_id, device_id, channel, status, skip_reason, provider_message_id, sent_at, opened_at, updated_at")
      .eq("occurrence_id", occurrenceId)
      .order("created_at", { ascending: false })
      .limit(100);
    deviceDeliveryLog = (deliveries ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        userId: String(row.user_id ?? ""),
        deviceId: row.device_id ?? null,
        channel: String(row.channel ?? ""),
        status: String(row.status ?? ""),
        skipReason: row.skip_reason ?? null,
        providerMessageId: row.provider_message_id ?? null,
        sentAt: row.sent_at ?? null,
        openedAt: row.opened_at ?? null,
        updatedAt: row.updated_at ?? null,
      };
    });
  }

  const summary = latest
    ? {
        occurrence_id: latest.id,
        status: latest.status,
        target_member_count: latest.target_member_count,
        push_eligible_member_count: latest.push_eligible_member_count,
        push_device_count: latest.push_device_count,
        in_app_member_count: latest.in_app_member_count,
        push_sent: latest.push_sent,
        push_skipped: latest.push_skipped,
        push_failed: latest.push_failed,
        in_app_sent: latest.in_app_sent,
        in_app_skipped: latest.in_app_skipped,
        in_app_failed: latest.in_app_failed,
        scheduled_for: latest.scheduled_for,
        started_at: latest.started_at,
        completed_at: latest.completed_at,
      }
    : null;

  const campRow = camp as Record<string, unknown>;
  const occurrenceFacts = occurrences.map((o) => ({
    id: String(o.id),
    status: String(o.status ?? ""),
    trigger_type: String(o.trigger_type ?? ""),
    scheduled_for: o.scheduled_for ?? null,
    sequence_number: Number(o.sequence_number ?? 0),
    target_member_count: Number(o.target_member_count ?? 0),
  }));
  const actionCtx = buildCampaignActionContext(campRow, occurrenceFacts);
  const latestReal = occurrenceFacts.find((o) => o.trigger_type !== "test");

  const [openedByOcc, authorRes, auditRes] = await Promise.all([
    loadOpenedCountsByOccurrence(
      svc,
      occurrences.map((o) => String(o.id))
    ),
    campRow.created_by
      ? svc
          .from("profiles")
          .select("id, display_name, nickname, username")
          .eq("id", String(campRow.created_by))
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    svc
      .from(CAMPAIGN_AUDIT_TABLE)
      .select("id, actor_id, action, from_status, to_status, target_count, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if (auditRes.error && !isMissingRelationError(auditRes.error)) {
    console.warn("[campaign detail] audit read", auditRes.error.message);
  }

  return NextResponse.json({
    ok: true,
    campaign: camp,
    effective_status: resolveEffectiveCampaignStatus(String(campRow.status ?? ""), latestReal?.status ?? null),
    author_name: authorDisplayName((authorRes.data as Record<string, unknown> | null) ?? undefined),
    allowed_actions: allowedCampaignActions(actionCtx),
    archive_supported: Object.prototype.hasOwnProperty.call(campRow, "archived_at"),
    summary: summary
      ? { ...summary, opened: openedByOcc.get(String(summary.occurrence_id)) ?? null }
      : null,
    occurrences: occurrences.map((o) => ({ ...o, opened: openedByOcc.get(String(o.id)) ?? null })),
    deviceDeliveryLog,
    audit_logs: auditRes.error ? [] : (auditRes.data ?? []),
    audit_supported: !auditRes.error,
  });
}

/**
 * PATCH — ADM-04 edit (draft · scheduled · paused). The stored row is the base; body keys override
 * and run through the same parser as create (ADM-01 link validation + official source authority).
 * `status` is accepted only when the transition table allows it and is executed as the matching
 * lifecycle action (pause / resume / schedule / stop_recurring / cancel / stop_sending).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: CampaignWriteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const loadedRes = await loadCampaignForAction(svc, id);
  if (!loadedRes.ok) {
    return NextResponse.json({ ok: false, error: loadedRes.error }, { status: loadedRes.status });
  }
  let loaded = loadedRes.loaded;
  const ip = readAuditRequestIp(req.headers);

  const requestedStatus = typeof body.status === "string" ? body.status.trim() : "";
  const statusChange = requestedStatus && requestedStatus !== loaded.ctx.status ? requestedStatus : "";
  let statusAction: ReturnType<typeof campaignActionForStatusChange> = null;
  if (statusChange) {
    statusAction = campaignActionForStatusChange(loaded.ctx.status, statusChange);
    if (!statusAction) {
      return NextResponse.json(
        { ok: false, error: "illegal_status_transition", from: loaded.ctx.status, to: statusChange },
        { status: 409 }
      );
    }
  }

  const contentKeys = Object.keys(body).filter((k) => k !== "status");
  // IA-01: 실제 발송을 시작·재개하거나(schedule·resume) 대기 중인 발송(예약·일시정지)의 내용을 바꾸면 `manage` 키.
  // 초안 수정·취소·중지는 기존 가드.
  if (
    isCampaignSendCausingAction(statusAction) ||
    (contentKeys.length > 0 && isCampaignEditSendAffecting(loaded.ctx.status))
  ) {
    const sendGate = await requireAdminPermission("manage");
    if (!sendGate.ok) return sendGate.response;
  }
  let edited: Awaited<ReturnType<typeof editCampaign>> | null = null;
  if (contentKeys.length > 0) {
    const merged = mergeCampaignPatchOverRow(loaded.row, body);
    const parsed = parseCampaignWriteInput(merged.body, { hasOwnTargetPayload: merged.hasOwnTargetPayload });
    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: parsed.error, ...(parsed.message ? { message: parsed.message } : {}) },
        { status: parsed.status }
      );
    }
    edited = await editCampaign(svc, loaded, admin.userId, parsed.fields);
    if (!edited.ok) {
      return NextResponse.json({ ok: false, error: edited.error }, { status: edited.status });
    }
    await writeLifecycleAudit(svc, edited, admin.userId, ip);
  } else if (!statusAction) {
    return NextResponse.json({ ok: false, error: "no_fields" }, { status: 400 });
  }

  let transitioned: Awaited<ReturnType<typeof runCampaignLifecycleAction>> | null = null;
  if (statusAction) {
    if (edited) {
      const reloaded = await loadCampaignForAction(svc, id);
      if (!reloaded.ok) {
        return NextResponse.json({ ok: false, error: reloaded.error }, { status: reloaded.status });
      }
      loaded = reloaded.loaded;
    }
    transitioned = await runCampaignLifecycleAction(svc, loaded, admin.userId, statusAction);
    if (!transitioned.ok) {
      return NextResponse.json(
        { ok: false, error: transitioned.error, edited: Boolean(edited) },
        { status: transitioned.status }
      );
    }
    await writeLifecycleAudit(svc, transitioned, admin.userId, ip);
  }

  return NextResponse.json({
    ok: true,
    status: transitioned?.ok ? transitioned.toStatus : loaded.ctx.status,
    ...(edited?.ok ? { edit: edited.extra ?? {} } : {}),
    ...(transitioned?.ok ? { action: transitioned.action, result: transitioned.extra ?? {} } : {}),
  });
}
