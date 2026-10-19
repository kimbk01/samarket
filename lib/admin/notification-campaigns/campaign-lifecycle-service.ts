import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-content-snapshot";
import {
  campaignAuditSnapshot,
  isMissingRelationError,
} from "@/lib/admin/notification-campaigns/campaign-audit-log";
import type { CampaignAuditAction } from "@/lib/admin/notification-campaigns/campaign-audit-log";
import {
  createCampaignDispatchOccurrence,
  type CampaignScheduleInput,
} from "@/lib/admin/notification-campaigns/campaign-create-service";
import type { CampaignWriteFields } from "@/lib/admin/notification-campaigns/campaign-input";
import {
  audiencePreviewToSnapshot,
  getNextOccurrenceSequenceNumber,
  newOccurrenceIdempotencyKey,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import { previewCampaignAudience } from "@/lib/admin/notification-campaigns/campaign-audience-preview";
import { refreshOccurrenceMetrics } from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";
import { ensureCampaignTargetsForSelectedUsers } from "@/lib/admin/notification-campaigns/run-campaign-send-batch";
import {
  normalizeSelectedUserIds,
  readSelectedUserIdsFromPayload,
} from "@/lib/admin/notification-campaigns/selected-user-ids";
import {
  canTransitionCampaignStatus,
  evaluateCampaignAction,
  type CampaignAction,
  type CampaignActionContext,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";
import type { CampaignChannel } from "@/lib/admin/notification-campaigns/campaign-types";

/**
 * ADM-03 / ADM-04 / archive / duplicate — campaign lifecycle mutations.
 * Every status change goes through `evaluateCampaignAction` + the transition table and is applied
 * with an optimistic `.eq("status", from)` guard. Callers (routes) write the audit log from the
 * returned outcome.
 */

export type CampaignOccurrenceFact = {
  id: string;
  status: string;
  trigger_type: string;
  scheduled_for: string | null;
  sequence_number: number;
  target_member_count: number;
};

export type LoadedCampaign = {
  row: Record<string, unknown>;
  occurrences: CampaignOccurrenceFact[];
  ctx: CampaignActionContext;
};

export type LifecycleOutcome =
  | {
      ok: true;
      action: CampaignAuditAction;
      campaignId: string;
      fromStatus: string | null;
      toStatus: string | null;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      targetCount: number | null;
      extra?: Record<string, unknown>;
    }
  | { ok: false; status: number; error: string };

const DISPATCHED_OCCURRENCE = new Set(["sending", "sent", "partially_failed"]);

export function buildCampaignActionContext(
  row: Record<string, unknown>,
  occurrences: CampaignOccurrenceFact[]
): CampaignActionContext {
  const real = occurrences.filter((o) => o.trigger_type !== "test");
  return {
    status: String(row.status ?? ""),
    sendMode: typeof row.send_mode === "string" ? row.send_mode : null,
    archived: typeof row.archived_at === "string" && row.archived_at.length > 0,
    isQa: row.is_qa === true,
    channel: typeof row.channel === "string" ? row.channel : null,
    hasDispatchedOccurrence: real.some((o) => DISPATCHED_OCCURRENCE.has(o.status)),
    hasFailedOccurrence: real.some((o) => o.status === "failed"),
  };
}

export async function loadCampaignForAction(
  svc: SupabaseClient,
  campaignId: string
): Promise<{ ok: true; loaded: LoadedCampaign } | { ok: false; status: number; error: string }> {
  const { data, error } = await svc
    .from("admin_notification_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message ?? "campaign_lookup_failed" };
  if (!data) return { ok: false, status: 404, error: "not_found" };
  const { data: occ, error: occErr } = await svc
    .from("admin_notification_campaign_occurrences")
    .select("id, status, trigger_type, scheduled_for, sequence_number, target_member_count")
    .eq("campaign_id", campaignId)
    .order("sequence_number", { ascending: false })
    .limit(100);
  if (occErr) return { ok: false, status: 503, error: "occurrence_lookup_failed" };
  const occurrences = ((occ ?? []) as Array<Record<string, unknown>>).map((o) => ({
    id: String(o.id ?? ""),
    status: String(o.status ?? ""),
    trigger_type: String(o.trigger_type ?? ""),
    scheduled_for: typeof o.scheduled_for === "string" ? o.scheduled_for : null,
    sequence_number: Number(o.sequence_number ?? 0),
    target_member_count: Number(o.target_member_count ?? 0),
  }));
  const row = data as Record<string, unknown>;
  return { ok: true, loaded: { row, occurrences, ctx: buildCampaignActionContext(row, occurrences) } };
}

function latestTargetCount(loaded: LoadedCampaign): number | null {
  const real = loaded.occurrences.find((o) => o.trigger_type !== "test");
  if (real) return real.target_member_count;
  const n = Number(loaded.row.target_count ?? NaN);
  return Number.isFinite(n) ? n : null;
}

function gate(action: CampaignAction, loaded: LoadedCampaign): { ok: true } | { ok: false; status: number; error: string } {
  const verdict = evaluateCampaignAction(action, loaded.ctx);
  if (!verdict.ok) return { ok: false, status: 409, error: verdict.error };
  return { ok: true };
}

/** Optimistic status change; 0 rows → concurrent change (409). */
async function updateCampaignStatus(
  svc: SupabaseClient,
  campaignId: string,
  from: string,
  to: string,
  extra: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!canTransitionCampaignStatus(from, to)) {
    return { ok: false, status: 409, error: "illegal_status_transition" };
  }
  const { data, error } = await svc
    .from("admin_notification_campaigns")
    .update({ status: to, updated_at: new Date().toISOString(), ...extra })
    .eq("id", campaignId)
    .eq("status", from)
    .select("id");
  if (error) return { ok: false, status: 500, error: error.message ?? "update_failed" };
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, status: 409, error: "campaign_status_changed" };
  }
  return { ok: true };
}

/** Cancels non-test occurrences in the given statuses; returns the ids that were cancelled. */
export async function cancelCampaignOccurrences(
  svc: SupabaseClient,
  campaignId: string,
  input: { statuses: string[]; actorId: string | null; reason: string; dueBefore?: string; onlyIds?: string[] }
): Promise<string[]> {
  const now = new Date().toISOString();
  let q = svc
    .from("admin_notification_campaign_occurrences")
    .update({
      status: "cancelled",
      cancelled_at: now,
      cancelled_by: input.actorId,
      last_error: input.reason,
      send_claim_token: null,
      send_lease_expires_at: null,
      updated_at: now,
    })
    .eq("campaign_id", campaignId)
    .neq("trigger_type", "test")
    .in("status", input.statuses);
  if (input.dueBefore) q = q.lt("scheduled_for", input.dueBefore);
  if (input.onlyIds?.length) q = q.in("id", input.onlyIds);
  const { data } = await q.select("id");
  return ((data ?? []) as Array<{ id?: string }>).map((r) => String(r.id ?? "")).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Cancel / stop / pause / resume / stop recurring                     */
/* ------------------------------------------------------------------ */

/**
 * ADM-03 「예약 취소」: queued reservation → occurrence `cancelled`, one-shot campaign → `cancelled`
 * (취소됨 — never reverted to draft). With `occurrenceId` on a recurring campaign only that slot is
 * skipped and the series stays active.
 */
export async function cancelCampaignReservation(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string,
  opts?: { occurrenceId?: string }
): Promise<LifecycleOutcome> {
  const campaignId = String(loaded.row.id);
  const from = loaded.ctx.status;
  const recurring = loaded.ctx.sendMode === "recurring";
  if (loaded.ctx.archived) return { ok: false, status: 409, error: "campaign_archived" };

  if (opts?.occurrenceId) {
    const occ = loaded.occurrences.find((o) => o.id === opts.occurrenceId);
    if (!occ || occ.status !== "queued" || occ.trigger_type === "test") {
      return { ok: false, status: 409, error: "occurrence_not_cancellable" };
    }
    if (from === "sending") return { ok: false, status: 409, error: "use_stop_sending" };
    if (recurring) {
      const ids = await cancelCampaignOccurrences(svc, campaignId, {
        statuses: ["queued"],
        actorId,
        reason: "cancelled_by_admin",
        onlyIds: [occ.id],
      });
      if (!ids.length) return { ok: false, status: 409, error: "occurrence_not_cancellable" };
      return {
        ok: true,
        action: "cancel",
        campaignId,
        fromStatus: from,
        toStatus: from,
        before: { occurrence_id: occ.id, occurrence_status: "queued", scheduled_for: occ.scheduled_for },
        after: { occurrence_id: occ.id, occurrence_status: "cancelled" },
        targetCount: occ.target_member_count,
        extra: { occurrence_ids: ids },
      };
    }
  }

  const g = gate("cancel", loaded);
  if (!g.ok) return g;
  const ids = await cancelCampaignOccurrences(svc, campaignId, {
    statuses: ["queued"],
    actorId,
    reason: "cancelled_by_admin",
    ...(opts?.occurrenceId ? { onlyIds: [opts.occurrenceId] } : {}),
  });
  if (opts?.occurrenceId && !ids.length) return { ok: false, status: 409, error: "occurrence_not_cancellable" };
  const upd = await updateCampaignStatus(svc, campaignId, from, "cancelled", { cancelled_by: actorId });
  if (!upd.ok) return upd;
  return {
    ok: true,
    action: "cancel",
    campaignId,
    fromStatus: from,
    toStatus: "cancelled",
    before: campaignAuditSnapshot(loaded.row),
    after: { status: "cancelled", cancelled_occurrence_ids: ids },
    targetCount: latestTargetCount(loaded),
    extra: { occurrence_ids: ids },
  };
}

/** ADM-03 「발송 중지」: sending → cancelled; in-flight batches stop at the next batch boundary. */
export async function stopSendingCampaign(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string
): Promise<LifecycleOutcome> {
  const g = gate("stop_sending", loaded);
  if (!g.ok) return g;
  const campaignId = String(loaded.row.id);
  // Campaign first: the batch runner halts on campaign status even before the occurrence update lands.
  const upd = await updateCampaignStatus(svc, campaignId, "sending", "cancelled", { cancelled_by: actorId });
  if (!upd.ok) return upd;
  const ids = await cancelCampaignOccurrences(svc, campaignId, {
    statuses: ["queued", "sending"],
    actorId,
    reason: "stopped_by_admin",
  });
  for (const id of ids) await refreshOccurrenceMetrics(svc, id);
  return {
    ok: true,
    action: "stop_sending",
    campaignId,
    fromStatus: "sending",
    toStatus: "cancelled",
    before: campaignAuditSnapshot(loaded.row),
    after: { status: "cancelled", cancelled_occurrence_ids: ids },
    targetCount: latestTargetCount(loaded),
    extra: { occurrence_ids: ids },
  };
}

export async function pauseRecurringCampaign(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string
): Promise<LifecycleOutcome> {
  const g = gate("pause", loaded);
  if (!g.ok) return g;
  const campaignId = String(loaded.row.id);
  const upd = await updateCampaignStatus(svc, campaignId, "active", "paused", { updated_by: actorId });
  if (!upd.ok) return upd;
  return {
    ok: true,
    action: "pause",
    campaignId,
    fromStatus: "active",
    toStatus: "paused",
    before: campaignAuditSnapshot(loaded.row),
    after: { status: "paused" },
    targetCount: latestTargetCount(loaded),
  };
}

/** Resume: overdue queued slots (missed while paused) are cancelled so the cron re-plans the next slot. */
export async function resumeRecurringCampaign(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string
): Promise<LifecycleOutcome> {
  const g = gate("resume", loaded);
  if (!g.ok) return g;
  const campaignId = String(loaded.row.id);
  const now = new Date().toISOString();
  const skipped = await cancelCampaignOccurrences(svc, campaignId, {
    statuses: ["queued"],
    actorId,
    reason: "skipped_while_paused",
    dueBefore: now,
  });
  const upd = await updateCampaignStatus(svc, campaignId, "paused", "active", { updated_by: actorId });
  if (!upd.ok) return upd;
  return {
    ok: true,
    action: "resume",
    campaignId,
    fromStatus: "paused",
    toStatus: "active",
    before: campaignAuditSnapshot(loaded.row),
    after: { status: "active", skipped_overdue_occurrence_ids: skipped },
    targetCount: latestTargetCount(loaded),
  };
}

/** ADM-03 「반복 중지」: active|paused → ended; queued slots cancelled, in-flight halts (CAMPAIGN_HALTED_STATUSES). */
export async function stopRecurringCampaign(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string
): Promise<LifecycleOutcome> {
  const g = gate("stop_recurring", loaded);
  if (!g.ok) return g;
  const campaignId = String(loaded.row.id);
  const from = loaded.ctx.status;
  const upd = await updateCampaignStatus(svc, campaignId, from, "ended", { cancelled_by: actorId });
  if (!upd.ok) return upd;
  const ids = await cancelCampaignOccurrences(svc, campaignId, {
    statuses: ["queued", "sending"],
    actorId,
    reason: "series_stopped",
  });
  for (const id of ids) await refreshOccurrenceMetrics(svc, id);
  return {
    ok: true,
    action: "stop_recurring",
    campaignId,
    fromStatus: from,
    toStatus: "ended",
    before: campaignAuditSnapshot(loaded.row),
    after: { status: "ended", cancelled_occurrence_ids: ids },
    targetCount: latestTargetCount(loaded),
    extra: { occurrence_ids: ids },
  };
}

/* ------------------------------------------------------------------ */
/* Archive / duplicate                                                 */
/* ------------------------------------------------------------------ */

export async function setCampaignArchived(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string,
  archive: boolean
): Promise<LifecycleOutcome> {
  const action: CampaignAction = archive ? "archive" : "unarchive";
  const g = gate(action, loaded);
  if (!g.ok) return g;
  const campaignId = String(loaded.row.id);
  const now = new Date().toISOString();
  let q = svc
    .from("admin_notification_campaigns")
    .update(
      archive
        ? { archived_at: now, archived_by: actorId, updated_at: now }
        : { archived_at: null, archived_by: null, updated_at: now }
    )
    .eq("id", campaignId)
    .eq("status", loaded.ctx.status);
  q = archive ? q.is("archived_at", null) : q.not("archived_at", "is", null);
  const { data, error } = await q.select("id");
  if (error) {
    if (isMissingRelationError(error)) return { ok: false, status: 503, error: "archive_migration_pending" };
    return { ok: false, status: 500, error: error.message ?? "update_failed" };
  }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, status: 409, error: "campaign_status_changed" };
  return {
    ok: true,
    action,
    campaignId,
    fromStatus: loaded.ctx.status,
    toStatus: loaded.ctx.status,
    before: { archived_at: loaded.row.archived_at ?? null },
    after: { archived_at: archive ? now : null },
    targetCount: latestTargetCount(loaded),
  };
}

/** Columns copied by 「복제」 — content only; status/schedule/counters start fresh as a draft. */
export const CAMPAIGN_DUPLICATE_COLUMNS = [
  "title",
  "body",
  "type",
  "target_type",
  "channel",
  "target_url",
  "image_url",
  "deeplink_url",
  "web_url",
  "push_image_url",
  "in_app_image_url",
  "segment_region_code",
  "target_payload",
  "priority",
  "visibility_policy",
  "is_qa",
] as const;

export function buildDuplicateCampaignRow(
  source: Record<string, unknown>,
  actorId: string,
  now = new Date().toISOString()
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const k of CAMPAIGN_DUPLICATE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(source, k)) row[k] = source[k];
  }
  const selected = readSelectedUserIdsFromPayload(source.target_payload);
  return {
    ...row,
    target_payload:
      source.target_payload && typeof source.target_payload === "object" && !Array.isArray(source.target_payload)
        ? source.target_payload
        : {},
    status: "draft",
    send_mode: "immediate",
    scheduled_at: null,
    recurrence_kind: "none",
    send_progress_offset: 0,
    target_count: String(source.target_type ?? "") === "selected_users" ? selected.length : 0,
    sent_count: 0,
    skipped_count: 0,
    failed_count: 0,
    created_by: actorId,
    updated_by: actorId,
    updated_at: now,
  };
}

export async function duplicateCampaign(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string
): Promise<LifecycleOutcome> {
  const g = gate("duplicate", loaded);
  if (!g.ok) return g;
  const { data, error } = await svc
    .from("admin_notification_campaigns")
    .insert(buildDuplicateCampaignRow(loaded.row, actorId))
    .select("id")
    .maybeSingle();
  const newId = String((data as { id?: string } | null)?.id ?? "");
  if (error || !newId) return { ok: false, status: 500, error: error?.message ?? "duplicate_failed" };
  return {
    ok: true,
    action: "duplicate",
    campaignId: newId,
    fromStatus: null,
    toStatus: "draft",
    before: { source_campaign_id: String(loaded.row.id) },
    after: campaignAuditSnapshot({ ...loaded.row, status: "draft", send_mode: "immediate" }),
    targetCount: null,
    extra: { id: newId, source_campaign_id: String(loaded.row.id) },
  };
}

/* ------------------------------------------------------------------ */
/* ADM-04 edit + schedule                                              */
/* ------------------------------------------------------------------ */

export function campaignRowPatchFromFields(
  fields: CampaignWriteFields,
  actorId: string,
  now = new Date().toISOString()
): Record<string, unknown> {
  const selectedUserIds =
    fields.target_type === "selected_users" ? normalizeSelectedUserIds(fields.target_user_ids) : [];
  const targetPayload: Record<string, unknown> = { ...(fields.target_payload ?? {}) };
  if (fields.target_type === "selected_users") {
    if (selectedUserIds.length) targetPayload.selected_user_ids = selectedUserIds;
    else delete targetPayload.selected_user_ids;
  } else {
    delete targetPayload.selected_user_ids;
  }
  return {
    title: fields.title,
    body: fields.body,
    type: fields.type,
    target_type: fields.target_type,
    channel: fields.channel,
    target_url: fields.deeplink_url,
    image_url: fields.in_app_image_url ?? fields.push_image_url,
    deeplink_url: fields.deeplink_url,
    web_url: fields.web_url,
    push_image_url: fields.push_image_url,
    in_app_image_url: fields.in_app_image_url,
    segment_region_code: fields.target_type === "region" ? fields.segment_region_code : null,
    send_mode: fields.send_mode,
    scheduled_at: fields.send_mode === "scheduled" ? fields.scheduled_at : null,
    recurrence_kind: fields.send_mode === "recurring" ? fields.recurrence_kind ?? "weekly" : "none",
    recurrence_time: fields.recurrence_time ?? "09:00",
    recurrence_timezone: fields.recurrence_timezone ?? "Asia/Seoul",
    recurrence_start_at: fields.recurrence_start_at ?? fields.scheduled_at ?? now,
    recurrence_end_at: fields.recurrence_end_at ?? null,
    recurrence_max_count: fields.recurrence_max_count ?? null,
    recurrence_weekday: fields.recurrence_weekday ?? null,
    target_payload: targetPayload,
    ...(fields.target_type === "selected_users" ? { target_count: selectedUserIds.length } : {}),
    updated_by: actorId,
    updated_at: now,
  };
}

/** ADM-04 status-specific edit rules (beyond `evaluateCampaignAction("edit")`). */
export function validateCampaignEditFields(
  status: string,
  fields: Pick<CampaignWriteFields, "send_mode" | "scheduled_at" | "recurrence_kind">,
  nowMs = Date.now()
): { ok: true } | { ok: false; error: string } {
  if (status === "scheduled") {
    if (fields.send_mode !== "scheduled") return { ok: false, error: "send_mode_locked" };
    const when = fields.scheduled_at ? Date.parse(fields.scheduled_at) : NaN;
    if (!Number.isFinite(when) || when <= nowMs) return { ok: false, error: "scheduled_at_must_be_future" };
  }
  if (status === "paused" && fields.send_mode !== "recurring") return { ok: false, error: "send_mode_locked" };
  if (fields.send_mode === "recurring" && fields.recurrence_kind === "none") {
    return { ok: false, error: "recurrence_kind_required" };
  }
  return { ok: true };
}

function snapshotFromPatch(patch: Record<string, unknown>) {
  return buildCampaignContentSnapshot({
    title: String(patch.title ?? ""),
    body: String(patch.body ?? ""),
    type: patch.type as "notice" | "marketing" | "system",
    channel: patch.channel as CampaignChannel,
    target_type: String(patch.target_type ?? "all"),
    deeplink_url: (patch.deeplink_url as string | null) ?? null,
    web_url: (patch.web_url as string | null) ?? null,
    push_image_url: (patch.push_image_url as string | null) ?? null,
    in_app_image_url: (patch.in_app_image_url as string | null) ?? null,
    target_payload: (patch.target_payload as Record<string, unknown>) ?? null,
  });
}

/**
 * Refreshes queued (not yet dispatched) non-test occurrences after an edit: content snapshot,
 * audience snapshot, scheduled_for (scheduled campaigns) and selected_users pending targets.
 */
async function regenerateQueuedOccurrences(
  svc: SupabaseClient,
  campaignId: string,
  queued: CampaignOccurrenceFact[],
  patch: Record<string, unknown>,
  status: string
): Promise<string[]> {
  if (!queued.length) return [];
  const snapshot = snapshotFromPatch(patch);
  const selected = readSelectedUserIdsFromPayload(patch.target_payload);
  const preview = await previewCampaignAudience(svc, {
    type: patch.type as "notice" | "marketing" | "system",
    target_type: String(patch.target_type ?? "all"),
    channel: patch.channel as CampaignChannel,
    segment_region_code: (patch.segment_region_code as string | null) ?? null,
    target_user_ids: selected.length ? selected : undefined,
  });
  const audience = audiencePreviewToSnapshot(preview, new Date().toISOString());
  const now = new Date().toISOString();
  const ids: string[] = [];
  // Pending rows of a never-dispatched campaign belong to the queued occurrence(s) only; the
  // audience may have changed (users removed / target type switched), so re-arm from scratch.
  await svc
    .from("admin_notification_campaign_targets")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("status", "pending");
  for (const occ of queued) {
    const { data } = await svc
      .from("admin_notification_campaign_occurrences")
      .update({
        content_snapshot: snapshot,
        audience_snapshot: audience,
        target_member_count: audience.target_member_count,
        push_eligible_member_count: audience.push_eligible_member_count,
        push_device_count: audience.push_device_count,
        in_app_member_count: audience.in_app_member_count,
        ...(status === "scheduled" && typeof patch.scheduled_at === "string"
          ? { scheduled_for: patch.scheduled_at }
          : {}),
        updated_at: now,
      })
      .eq("id", occ.id)
      .eq("status", "queued")
      .select("id");
    if (!Array.isArray(data) || !data.length) continue;
    ids.push(occ.id);
    if (String(patch.target_type) === "selected_users" && selected.length) {
      await ensureCampaignTargetsForSelectedUsers(svc, campaignId, occ.id, selected);
    }
  }
  return ids;
}

export async function editCampaign(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string,
  fields: CampaignWriteFields
): Promise<LifecycleOutcome> {
  const g = gate("edit", loaded);
  if (!g.ok) return g;
  const status = loaded.ctx.status;
  const rules = validateCampaignEditFields(status, fields);
  if (!rules.ok) return { ok: false, status: 400, error: rules.error };

  const campaignId = String(loaded.row.id);
  const patch = campaignRowPatchFromFields(fields, actorId);
  if (status === "paused") {
    // Recurring send_mode / series identity stays; only content + recurrence settings change.
    patch.send_mode = "recurring";
  }
  const { data, error } = await svc
    .from("admin_notification_campaigns")
    .update(patch)
    .eq("id", campaignId)
    .eq("status", status)
    .select("id");
  if (error) return { ok: false, status: 500, error: error.message ?? "update_failed" };
  if (!Array.isArray(data) || data.length === 0) return { ok: false, status: 409, error: "campaign_status_changed" };

  const queued = loaded.occurrences.filter((o) => o.status === "queued" && o.trigger_type !== "test");
  let regenerated: string[] = [];
  let superseded: string[] = [];
  if (status === "paused") {
    // Paused series: drop the planned slot; the dispatcher plans the next one from the new settings on resume.
    superseded = await cancelCampaignOccurrences(svc, campaignId, {
      statuses: ["queued"],
      actorId,
      reason: "superseded_by_edit",
    });
  } else {
    regenerated = await regenerateQueuedOccurrences(svc, campaignId, queued, patch, status);
  }
  return {
    ok: true,
    action: "edit",
    campaignId,
    fromStatus: status,
    toStatus: status,
    before: campaignAuditSnapshot(loaded.row),
    after: campaignAuditSnapshot({ ...loaded.row, ...patch }),
    targetCount: Number(patch.target_count ?? NaN) || latestTargetCount(loaded),
    extra: { regenerated_occurrence_ids: regenerated, superseded_occurrence_ids: superseded },
  };
}

/**
 * ADM-04 draft → 예약(scheduled) / 반복 시작(active) using the campaign's stored schedule fields
 * (saved by PATCH first). A legacy queued immediate occurrence is superseded.
 */
export async function scheduleDraftCampaign(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string
): Promise<LifecycleOutcome> {
  const g = gate("schedule", loaded);
  if (!g.ok) return g;
  const row = loaded.row;
  const campaignId = String(row.id);
  const from = loaded.ctx.status;
  if (from !== "draft") return { ok: false, status: 409, error: "use_edit_to_reschedule" };
  const sendMode = String(row.send_mode ?? "immediate");
  if (sendMode !== "scheduled" && sendMode !== "recurring") {
    return { ok: false, status: 400, error: "send_mode_required" };
  }
  const schedule: CampaignScheduleInput = {
    send_mode: sendMode,
    scheduled_at: typeof row.scheduled_at === "string" ? row.scheduled_at : null,
    recurrence_kind: typeof row.recurrence_kind === "string" ? row.recurrence_kind : undefined,
    recurrence_time: typeof row.recurrence_time === "string" ? row.recurrence_time.slice(0, 5) : null,
    recurrence_timezone: typeof row.recurrence_timezone === "string" ? row.recurrence_timezone : undefined,
    recurrence_start_at: typeof row.recurrence_start_at === "string" ? row.recurrence_start_at : null,
    recurrence_end_at: typeof row.recurrence_end_at === "string" ? row.recurrence_end_at : null,
    recurrence_max_count: typeof row.recurrence_max_count === "number" ? row.recurrence_max_count : null,
    recurrence_weekday: typeof row.recurrence_weekday === "number" ? row.recurrence_weekday : null,
  };
  if (sendMode === "scheduled") {
    const when = schedule.scheduled_at ? Date.parse(schedule.scheduled_at) : NaN;
    if (!Number.isFinite(when) || when <= Date.now()) {
      return { ok: false, status: 400, error: "scheduled_at_must_be_future" };
    }
  } else if (!schedule.recurrence_kind || schedule.recurrence_kind === "none") {
    return { ok: false, status: 400, error: "recurrence_kind_required" };
  }
  const to = sendMode === "scheduled" ? "scheduled" : "active";
  const upd = await updateCampaignStatus(svc, campaignId, "draft", to, {
    scheduled_by: actorId,
    updated_by: actorId,
  });
  if (!upd.ok) return upd;

  const superseded = await cancelCampaignOccurrences(svc, campaignId, {
    statuses: ["queued"],
    actorId,
    reason: "superseded_by_schedule",
  });
  const selected =
    String(row.target_type ?? "") === "selected_users" ? readSelectedUserIdsFromPayload(row.target_payload) : [];
  const seq = await getNextOccurrenceSequenceNumber(svc, campaignId);
  const payload =
    row.target_payload && typeof row.target_payload === "object" && !Array.isArray(row.target_payload)
      ? (row.target_payload as Record<string, unknown>)
      : {};
  const created = await createCampaignDispatchOccurrence(svc, {
    campaignId,
    adminUserId: actorId,
    sequenceNumber: seq,
    idempotencyKey: newOccurrenceIdempotencyKey(`occ:${campaignId}:${seq}`),
    snapshot: snapshotFromPatch({ ...row, target_payload: payload }),
    audience: {
      type: row.type as "notice" | "marketing" | "system",
      target_type: String(row.target_type ?? "all"),
      channel: row.channel as CampaignChannel,
      segment_region_code: (row.segment_region_code as string | null) ?? null,
      target_user_ids: selected.length ? selected : undefined,
    },
    selectedUserIds: selected,
    schedule,
  });
  if (!created.ok || (sendMode === "scheduled" && !created.scheduledFor)) {
    // Roll back so the draft stays editable; the reservation never existed.
    await svc
      .from("admin_notification_campaigns")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", campaignId)
      .eq("status", to);
    return { ok: false, status: 500, error: created.ok ? "schedule_failed" : created.error };
  }
  return {
    ok: true,
    action: "schedule",
    campaignId,
    fromStatus: "draft",
    toStatus: to,
    before: campaignAuditSnapshot(row),
    after: {
      status: to,
      occurrence_id: created.occurrenceId,
      scheduled_for: created.scheduledFor,
      superseded_occurrence_ids: superseded,
    },
    targetCount: selected.length || latestTargetCount(loaded),
    extra: { occurrence_id: created.occurrenceId, scheduled_for: created.scheduledFor },
  };
}

/** Dispatches a lifecycle action (actions route + PATCH status mapping). */
export async function runCampaignLifecycleAction(
  svc: SupabaseClient,
  loaded: LoadedCampaign,
  actorId: string,
  action: CampaignAction
): Promise<LifecycleOutcome> {
  switch (action) {
    case "cancel":
      return cancelCampaignReservation(svc, loaded, actorId);
    case "stop_sending":
      return stopSendingCampaign(svc, loaded, actorId);
    case "pause":
      return pauseRecurringCampaign(svc, loaded, actorId);
    case "resume":
      return resumeRecurringCampaign(svc, loaded, actorId);
    case "stop_recurring":
      return stopRecurringCampaign(svc, loaded, actorId);
    case "archive":
      return setCampaignArchived(svc, loaded, actorId, true);
    case "unarchive":
      return setCampaignArchived(svc, loaded, actorId, false);
    case "duplicate":
      return duplicateCampaign(svc, loaded, actorId);
    case "schedule":
      return scheduleDraftCampaign(svc, loaded, actorId);
    default:
      // send / resend go through POST .../send (claim + batch); edit goes through PATCH.
      return { ok: false, status: 400, error: "unsupported_action" };
  }
}

/** PATCH `status` → lifecycle action (anything else is rejected by the transition table). */
export function campaignActionForStatusChange(from: string, to: string): CampaignAction | null {
  if (!canTransitionCampaignStatus(from, to)) return null;
  if (to === "paused") return "pause";
  if (to === "active" && from === "paused") return "resume";
  if (to === "active" && from === "draft") return "schedule";
  if (to === "scheduled") return "schedule";
  if (to === "ended") return "stop_recurring";
  if (to === "cancelled") return from === "sending" ? "stop_sending" : "cancel";
  return null;
}

/** Audit row for a successful lifecycle outcome (never fails the action — see campaign-audit-log). */
export async function writeLifecycleAudit(
  svc: SupabaseClient,
  outcome: Extract<LifecycleOutcome, { ok: true }>,
  actorId: string,
  ip: string | null
): Promise<void> {
  const { writeCampaignAuditLog } = await import("@/lib/admin/notification-campaigns/campaign-audit-log");
  await writeCampaignAuditLog(svc, {
    actorId,
    campaignId: outcome.campaignId,
    action: outcome.action,
    fromStatus: outcome.fromStatus,
    toStatus: outcome.toStatus,
    before: outcome.before,
    after: outcome.after,
    targetCount: outcome.targetCount,
    ip,
  });
}
