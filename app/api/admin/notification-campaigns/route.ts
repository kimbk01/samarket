import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { isCampaignCreateSendCausing } from "@/lib/admin/notification-campaigns/campaign-send-permission";
import { createAdminNotificationCampaign } from "@/lib/admin/notification-campaigns/campaign-create-service";
import {
  parseCampaignWriteInput,
  type CampaignWriteBody,
} from "@/lib/admin/notification-campaigns/campaign-input";
import {
  campaignAuditSnapshot,
  readAuditRequestIp,
  writeCampaignAuditLog,
} from "@/lib/admin/notification-campaigns/campaign-audit-log";
import { listAdminNotificationCampaigns } from "@/lib/admin/notification-campaigns/campaign-list-service";
import { parseCampaignListQuery } from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCreateRequestId(req: NextRequest, bodyKey: unknown): string | null {
  const header = req.headers.get("idempotency-key")?.trim() || req.headers.get("Idempotency-Key")?.trim();
  if (header) return header.slice(0, 128);
  if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim().slice(0, 128);
  return null;
}

/**
 * GET — ADM-05 list: tab (drafting · in_progress · completed · archived · qa), type, q, status,
 * page/page_size. Server pagination (count exact, created_at desc, id desc).
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const query = parseCampaignListQuery(searchParams);
  const result = await listAdminNotificationCampaigns(svc, query);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ...result, tab: query.tab });
}

/** POST — create campaign (idempotent) + optional first occurrence */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  let body: CampaignWriteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseCampaignWriteInput(body, {
    hasOwnTargetPayload: Object.prototype.hasOwnProperty.call(body, "target_payload"),
  });
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error, ...(parsed.message ? { message: parsed.message } : {}) },
      { status: parsed.status }
    );
  }
  const fields = parsed.fields;

  const save_as_draft =
    body.save_as_draft === true ||
    body.status === "draft" ||
    (typeof body.status === "string" && body.status.trim() === "draft");

  // IA-01: 예약·반복 모드로 바로 생성하면 실제 발송이 예약된다 → `manage` 키. 초안·즉시(초안 저장 후 발송)는 기존 가드.
  if (isCampaignCreateSendCausing({ saveAsDraft: save_as_draft, sendMode: fields.send_mode })) {
    const sendGate = await requireAdminPermission("manage");
    if (!sendGate.ok) return sendGate.response;
  }

  const result = await createAdminNotificationCampaign(svc, admin.userId, {
    ...fields,
    is_qa: body.is_qa === true || fields.channel === "test_only",
    create_request_id: readCreateRequestId(req, body.create_request_id),
    save_as_draft,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status ?? 500 });
  }

  if (!result.replay) {
    const toStatus = save_as_draft
      ? "draft"
      : fields.send_mode === "scheduled"
        ? "scheduled"
        : fields.send_mode === "recurring"
          ? "active"
          : "draft";
    await writeCampaignAuditLog(svc, {
      actorId: admin.userId,
      campaignId: result.campaignId,
      action: fields.send_mode === "immediate" || save_as_draft ? "create" : "schedule",
      fromStatus: null,
      toStatus,
      after: campaignAuditSnapshot({ ...fields, status: toStatus }),
      targetCount: fields.target_user_ids?.length ?? null,
      ip: readAuditRequestIp(req.headers),
    });
  }

  return NextResponse.json({
    ok: true,
    id: result.campaignId,
    occurrence_id: result.occurrenceId,
    replay: result.replay,
  });
}
