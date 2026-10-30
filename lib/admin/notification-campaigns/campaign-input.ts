import { CAMPAIGN_CHANNELS, type CampaignChannel } from "@/lib/admin/notification-campaigns/campaign-types";
import {
  CAMPAIGN_SEND_MODES,
  type CampaignSendMode,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { resolveCampaignTargetPayload } from "@/lib/admin/notification-campaigns/resolve-campaign-target-payload";
import { validateOfficialCampaignSource } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { validateCampaignLinkInput } from "@/lib/admin/notification-campaigns/campaign-link-target";
import { readSelectedUserIdsFromPayload } from "@/lib/admin/notification-campaigns/selected-user-ids";

/**
 * ADM-04: one request parser for create (POST) and edit (PATCH) — same field rules, same
 * ADM-01 link validation, same official source authority.
 */

export const CAMPAIGN_INPUT_TYPES = new Set(["notice", "marketing", "system"]);
export const CAMPAIGN_INPUT_TARGETS = new Set(["all", "selected_users", "marketing_opt_in", "active_users", "region"]);

export type CampaignWriteBody = {
  title?: unknown;
  body?: unknown;
  type?: unknown;
  target_type?: unknown;
  channel?: unknown;
  target_url?: unknown;
  deeplink_url?: unknown;
  web_url?: unknown;
  image_url?: unknown;
  push_image_url?: unknown;
  in_app_image_url?: unknown;
  scheduled_at?: unknown;
  segment_region_code?: unknown;
  status?: unknown;
  send_mode?: unknown;
  save_as_draft?: unknown;
  is_qa?: unknown;
  target_user_ids?: unknown;
  create_request_id?: unknown;
  recurrence_kind?: unknown;
  recurrence_time?: unknown;
  recurrence_timezone?: unknown;
  recurrence_start_at?: unknown;
  recurrence_end_at?: unknown;
  recurrence_max_count?: unknown;
  recurrence_weekday?: unknown;
  app_notice_id?: unknown;
  target_payload?: unknown;
};

export type CampaignWriteFields = {
  title: string;
  body: string;
  type: "notice" | "marketing" | "system";
  target_type: string;
  channel: CampaignChannel;
  deeplink_url: string | null;
  web_url: string | null;
  push_image_url: string | null;
  in_app_image_url: string | null;
  segment_region_code: string | null;
  target_payload: Record<string, unknown>;
  send_mode: CampaignSendMode;
  scheduled_at: string | null;
  recurrence_kind?: string;
  recurrence_time: string | null;
  recurrence_timezone?: string;
  recurrence_start_at: string | null;
  recurrence_end_at: string | null;
  recurrence_max_count: number | null;
  recurrence_weekday: number | null;
  target_user_ids?: string[];
};

export type CampaignInputError = { ok: false; status: number; error: string; message?: string };

export function optionalCampaignUrl(v: unknown, max = 2000): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export function parseCampaignWriteInput(
  body: CampaignWriteBody,
  opts?: { hasOwnTargetPayload?: boolean }
): { ok: true; fields: CampaignWriteFields } | CampaignInputError {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.body === "string" ? body.body.trim() : "";
  const typ = typeof body.type === "string" ? body.type.trim() : "";
  const targetType = typeof body.target_type === "string" ? body.target_type.trim() : "all";
  const channelRaw = typeof body.channel === "string" ? body.channel.trim() : "push_and_in_app";
  const channel = (CAMPAIGN_CHANNELS as readonly string[]).includes(channelRaw)
    ? (channelRaw as CampaignChannel)
    : "push_and_in_app";

  const sendModeRaw = typeof body.send_mode === "string" ? body.send_mode.trim() : "immediate";
  const send_mode = (CAMPAIGN_SEND_MODES as readonly string[]).includes(sendModeRaw)
    ? (sendModeRaw as CampaignSendMode)
    : "immediate";

  if (!title || !content || !CAMPAIGN_INPUT_TYPES.has(typ)) {
    return { ok: false, status: 400, error: "invalid_fields" };
  }
  if (targetType === "segment") {
    return {
      ok: false,
      status: 400,
      error: "segment_unsupported",
      message: "Segment targeting is not supported yet. Choose another audience.",
    };
  }
  if (!CAMPAIGN_INPUT_TARGETS.has(targetType)) {
    return { ok: false, status: 400, error: "invalid_target_type" };
  }

  const deeplink_url = optionalCampaignUrl(body.deeplink_url) ?? optionalCampaignUrl(body.target_url);
  const web_url = optionalCampaignUrl(body.web_url);
  // ADM-01: external hosts must be https + allowlisted; never silently rewritten to an in-app path.
  for (const link of [deeplink_url, web_url]) {
    const linkCheck = validateCampaignLinkInput(link);
    if (!linkCheck.ok) {
      return { ok: false, status: 400, error: linkCheck.error };
    }
  }
  const source = validateOfficialCampaignSource({
    campaign_type: typ,
    app_notice_id: body.app_notice_id,
    target_payload: body.target_payload,
    deeplink_url,
    web_url,
    target_url: optionalCampaignUrl(body.target_url),
  });
  if (!source.ok) {
    return { ok: false, status: 400, error: source.error };
  }

  const resolvedPayload = resolveCampaignTargetPayload({
    app_notice_id: source.mode === "content_bound" ? source.content_id : body.app_notice_id,
    target_payload:
      source.mode === "content_bound" || source.mode === "platform_event" || source.mode === "inbox_detail"
        ? source.target_payload
        : body.target_payload,
    targetPayloadKeyPresent:
      source.mode === "content_bound" ||
      source.mode === "platform_event" ||
      source.mode === "inbox_detail" ||
      opts?.hasOwnTargetPayload === true,
    campaign_type: typ,
  });
  if (!resolvedPayload.ok) {
    return { ok: false, status: 400, error: resolvedPayload.error };
  }

  const scheduled_at =
    typeof body.scheduled_at === "string" && body.scheduled_at.trim() ? body.scheduled_at.trim() : null;

  return {
    ok: true,
    fields: {
      title,
      body: content,
      type: typ as CampaignWriteFields["type"],
      target_type: targetType,
      channel,
      // inbox_detail: 목적지 = 알림 상세 → 내부 이동 경로를 남기지 않는다 (탭 = /notifications/{eventId}).
      deeplink_url:
        source.mode === "approved_landing" || source.mode === "platform_event"
          ? source.approved_landing ?? source.canonical_route
          : source.mode === "inbox_detail"
            ? null
            : deeplink_url,
      web_url: source.mode === "inbox_detail" ? null : web_url,
      push_image_url: optionalCampaignUrl(body.push_image_url) ?? optionalCampaignUrl(body.image_url),
      in_app_image_url: optionalCampaignUrl(body.in_app_image_url) ?? optionalCampaignUrl(body.image_url),
      segment_region_code:
        typeof body.segment_region_code === "string" && body.segment_region_code.trim()
          ? body.segment_region_code.trim().slice(0, 32)
          : null,
      target_payload: resolvedPayload.target_payload,
      send_mode,
      scheduled_at,
      recurrence_kind: typeof body.recurrence_kind === "string" ? body.recurrence_kind : undefined,
      recurrence_time: typeof body.recurrence_time === "string" ? body.recurrence_time : null,
      recurrence_timezone: typeof body.recurrence_timezone === "string" ? body.recurrence_timezone : undefined,
      recurrence_start_at: typeof body.recurrence_start_at === "string" ? body.recurrence_start_at : null,
      recurrence_end_at: typeof body.recurrence_end_at === "string" ? body.recurrence_end_at : null,
      recurrence_max_count: typeof body.recurrence_max_count === "number" ? body.recurrence_max_count : null,
      recurrence_weekday: typeof body.recurrence_weekday === "number" ? body.recurrence_weekday : null,
      target_user_ids: Array.isArray(body.target_user_ids)
        ? body.target_user_ids.map((x) => String(x).trim()).filter(Boolean)
        : undefined,
    },
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Content id bound on a stored campaign row (appNoticeId / content_id in target_payload). */
export function readCampaignRowContentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  return str(p.appNoticeId)?.trim() ?? str(p.content_id)?.trim() ?? null;
}

/**
 * ADM-04 PATCH: the stored row is the base; any key present on the request body overrides it.
 * The merged body then runs through `parseCampaignWriteInput` (same rules as create).
 */
export function mergeCampaignPatchOverRow(
  row: Record<string, unknown>,
  patch: CampaignWriteBody
): { body: CampaignWriteBody; hasOwnTargetPayload: boolean } {
  const has = (k: keyof CampaignWriteBody) => Object.prototype.hasOwnProperty.call(patch, k);
  const payload =
    row.target_payload && typeof row.target_payload === "object" && !Array.isArray(row.target_payload)
      ? (row.target_payload as Record<string, unknown>)
      : {};
  const storedContentId = readCampaignRowContentId(payload);
  const recurrenceTime = typeof row.recurrence_time === "string" ? row.recurrence_time.slice(0, 5) : null;
  const base: CampaignWriteBody = {
    title: row.title,
    body: row.body,
    type: row.type,
    target_type: row.target_type,
    channel: row.channel,
    deeplink_url: row.deeplink_url ?? row.target_url ?? null,
    web_url: row.web_url ?? null,
    push_image_url: row.push_image_url ?? null,
    in_app_image_url: row.in_app_image_url ?? null,
    segment_region_code: row.segment_region_code ?? null,
    send_mode: row.send_mode ?? "immediate",
    scheduled_at: row.scheduled_at ?? null,
    recurrence_kind: row.recurrence_kind ?? undefined,
    recurrence_time: recurrenceTime,
    recurrence_timezone: row.recurrence_timezone ?? undefined,
    recurrence_start_at: row.recurrence_start_at ?? null,
    recurrence_end_at: row.recurrence_end_at ?? null,
    recurrence_max_count: row.recurrence_max_count ?? null,
    recurrence_weekday: row.recurrence_weekday ?? null,
    app_notice_id: storedContentId,
    target_payload: payload,
    target_user_ids: readSelectedUserIdsFromPayload(payload),
  };
  const merged: CampaignWriteBody = { ...base };
  for (const k of Object.keys(patch) as Array<keyof CampaignWriteBody>) {
    if (k === "status" || k === "save_as_draft" || k === "create_request_id" || k === "is_qa") continue;
    merged[k] = patch[k];
  }
  // Changing the bound content (or unbinding) must not keep the old bind payload.
  if (has("app_notice_id") && !has("target_payload")) {
    const nextId = typeof patch.app_notice_id === "string" ? patch.app_notice_id.trim() : "";
    if (nextId !== (storedContentId ?? "")) {
      const rest = { ...payload };
      delete rest.appNoticeId;
      delete rest.content_id;
      delete rest.content_type;
      delete rest.canonical_route;
      merged.target_payload = rest;
    }
  }
  if (has("target_url") && !has("deeplink_url")) merged.deeplink_url = patch.target_url;
  return { body: merged, hasOwnTargetPayload: has("target_payload") };
}
