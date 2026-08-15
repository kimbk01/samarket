import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { createAdminNotificationCampaign } from "@/lib/admin/notification-campaigns/campaign-create-service";
import { CAMPAIGN_CHANNELS } from "@/lib/admin/notification-campaigns/campaign-types";
import { CAMPAIGN_SEND_MODES } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { resolveCampaignTargetPayload } from "@/lib/admin/notification-campaigns/resolve-campaign-target-payload";
import { validateOfficialCampaignSource } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["notice", "marketing", "system"]);
const TARGETS = new Set(["all", "selected_users", "marketing_opt_in", "active_users", "region"]);

function readCreateRequestId(req: NextRequest, bodyKey: unknown): string | null {
  const header = req.headers.get("idempotency-key")?.trim() || req.headers.get("Idempotency-Key")?.trim();
  if (header) return header.slice(0, 128);
  if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim().slice(0, 128);
  return null;
}

/** GET — list (production default excludes QA) */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const type = searchParams.get("type")?.trim();
  const qTitle = searchParams.get("q")?.trim();
  const audience = searchParams.get("audience")?.trim() ?? "ops";

  let query = svc.from("admin_notification_campaigns").select(
    "id, title, body, type, target_type, channel, status, send_mode, is_qa, scheduled_at, sent_at, created_by, created_at, updated_at, target_count, sent_count, skipped_count, failed_count, target_payload, push_image_url, in_app_image_url"
  );

  if (audience === "ops") {
    query = query.eq("is_qa", false);
  } else if (audience === "qa") {
    query = query.eq("is_qa", true);
  }

  if (status && status !== "all") {
    query = query.eq("status", status);
  }
  if (type && type !== "all") {
    query = query.eq("type", type);
  }
  if (qTitle) {
    query = query.ilike("title", `%${qTitle.slice(0, 80)}%`);
  }
  query = query.order("created_at", { ascending: false }).limit(200);

  const { data: campaigns, error } = await query;
  if (error) {
    if (error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: true, campaigns: [], table_missing: true });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const ids = (campaigns ?? []).map((c) => String((c as { id: string }).id));
  const latestOccurrences: Record<string, Record<string, unknown>> = {};
  if (ids.length) {
    const { data: occRows } = await svc
      .from("admin_notification_campaign_occurrences")
      .select(
        "id, campaign_id, sequence_number, status, scheduled_for, push_sent, push_skipped, push_failed, push_device_count, in_app_sent, in_app_member_count, target_member_count, completed_at"
      )
      .in("campaign_id", ids)
      .order("sequence_number", { ascending: false });

    for (const row of occRows ?? []) {
      const cid = String((row as { campaign_id: string }).campaign_id);
      if (!latestOccurrences[cid]) latestOccurrences[cid] = row as Record<string, unknown>;
    }
  }

  return NextResponse.json({
    ok: true,
    campaigns: (campaigns ?? []).map((c) => {
      const id = String((c as { id: string }).id);
      return { ...c, latest_occurrence: latestOccurrences[id] ?? null };
    }),
  });
}

type CreateBody = {
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

function optionalUrl(v: unknown, max = 2000): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

/** POST — create campaign (idempotent) + optional first occurrence */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.body === "string" ? body.body.trim() : "";
  const typ = typeof body.type === "string" ? body.type.trim() : "";
  const targetType = typeof body.target_type === "string" ? body.target_type.trim() : "all";
  const channelRaw = typeof body.channel === "string" ? body.channel.trim() : "push_and_in_app";
  const channel = (CAMPAIGN_CHANNELS as readonly string[]).includes(channelRaw)
    ? (channelRaw as (typeof CAMPAIGN_CHANNELS)[number])
    : "push_and_in_app";

  const sendModeRaw = typeof body.send_mode === "string" ? body.send_mode.trim() : "immediate";
  const send_mode = (CAMPAIGN_SEND_MODES as readonly string[]).includes(sendModeRaw)
    ? (sendModeRaw as (typeof CAMPAIGN_SEND_MODES)[number])
    : "immediate";

  if (!title || !content || !TYPES.has(typ)) {
    return NextResponse.json({ ok: false, error: "invalid_fields" }, { status: 400 });
  }
  if (targetType === "segment") {
    return NextResponse.json(
      {
        ok: false,
        error: "segment_unsupported",
        message: "Segment targeting is not supported yet. Choose another audience.",
      },
      { status: 400 }
    );
  }
  if (!TARGETS.has(targetType)) {
    return NextResponse.json({ ok: false, error: "invalid_target_type" }, { status: 400 });
  }

  const deeplink_url = optionalUrl(body.deeplink_url) ?? optionalUrl(body.target_url);
  const web_url = optionalUrl(body.web_url);
  const source = validateOfficialCampaignSource({
    campaign_type: typ,
    app_notice_id: body.app_notice_id,
    target_payload: body.target_payload,
    deeplink_url,
    web_url,
    target_url: optionalUrl(body.target_url),
  });
  if (!source.ok) {
    return NextResponse.json({ ok: false, error: source.error }, { status: 400 });
  }

  const resolvedPayload = resolveCampaignTargetPayload({
    app_notice_id: source.mode === "content_bound" ? source.content_id : body.app_notice_id,
    target_payload:
      source.mode === "content_bound" ? source.target_payload : body.target_payload,
    targetPayloadKeyPresent:
      source.mode === "content_bound" ||
      Object.prototype.hasOwnProperty.call(body, "target_payload"),
    campaign_type: typ,
  });
  if (!resolvedPayload.ok) {
    return NextResponse.json({ ok: false, error: resolvedPayload.error }, { status: 400 });
  }

  const scheduled_at =
    typeof body.scheduled_at === "string" && body.scheduled_at.trim() ? body.scheduled_at.trim() : null;
  const save_as_draft =
    body.save_as_draft === true ||
    body.status === "draft" ||
    (typeof body.status === "string" && body.status.trim() === "draft");

  const result = await createAdminNotificationCampaign(svc, admin.userId, {
    title,
    body: content,
    type: typ as "notice" | "marketing" | "system",
    target_type: targetType,
    channel,
    deeplink_url:
      source.mode === "approved_landing" ? source.approved_landing : deeplink_url,
    web_url,
    push_image_url: optionalUrl(body.push_image_url) ?? optionalUrl(body.image_url),
    in_app_image_url: optionalUrl(body.in_app_image_url) ?? optionalUrl(body.image_url),
    segment_region_code:
      typeof body.segment_region_code === "string" && body.segment_region_code.trim()
        ? body.segment_region_code.trim().slice(0, 32)
        : null,
    target_payload: resolvedPayload.target_payload,
    send_mode,
    scheduled_at,
    is_qa: body.is_qa === true || channel === "test_only",
    recurrence_kind: typeof body.recurrence_kind === "string" ? body.recurrence_kind : undefined,
    recurrence_time: typeof body.recurrence_time === "string" ? body.recurrence_time : null,
    recurrence_timezone: typeof body.recurrence_timezone === "string" ? body.recurrence_timezone : undefined,
    recurrence_start_at: typeof body.recurrence_start_at === "string" ? body.recurrence_start_at : null,
    recurrence_end_at: typeof body.recurrence_end_at === "string" ? body.recurrence_end_at : null,
    recurrence_max_count:
      typeof body.recurrence_max_count === "number" ? body.recurrence_max_count : null,
    recurrence_weekday:
      typeof body.recurrence_weekday === "number" ? body.recurrence_weekday : null,
    target_user_ids: Array.isArray(body.target_user_ids)
      ? body.target_user_ids.map((x) => String(x).trim()).filter(Boolean)
      : undefined,
    create_request_id: readCreateRequestId(req, body.create_request_id),
    save_as_draft,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status ?? 500 });
  }

  return NextResponse.json({
    ok: true,
    id: result.campaignId,
    occurrence_id: result.occurrenceId,
    replay: result.replay,
  });
}
