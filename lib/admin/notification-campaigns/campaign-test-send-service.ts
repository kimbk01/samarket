/**
 * 관리자 테스트 발송 (서버 전용).
 *
 * - `runAdminCampaignTestSend` — 캠페인 1건을 지정 회원에게만 QA 회차로 발송 (기존 `[campaignId]/test-send` 본문).
 * - `upsertAdminTestSandboxCampaign` — v3 「내 폰으로 테스트」: 관리자마다 QA 캠페인 1건(sandbox)만 두고
 *   내용을 덮어써 재사용한다. 테스트할 때마다 캠페인이 쌓이지 않는다 (2026-10-30 운영 QA 캠페인 85건).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { writeCampaignAuditLog } from "@/lib/admin/notification-campaigns/campaign-audit-log";
import { buildCampaignContentSnapshot } from "@/lib/admin/notification-campaigns/campaign-content-snapshot";
import { createAdminNotificationCampaign } from "@/lib/admin/notification-campaigns/campaign-create-service";
import type { CampaignWriteFields } from "@/lib/admin/notification-campaigns/campaign-input";
import {
  ensureCampaignOccurrence,
  getNextOccurrenceSequenceNumber,
  newOccurrenceIdempotencyKey,
} from "@/lib/admin/notification-campaigns/campaign-occurrence-service";
import { evaluateOfficialCampaignSendEligibility } from "@/lib/admin/notification-campaigns/campaign-source-authority";
import { runNotificationCampaignTestSend } from "@/lib/admin/notification-campaigns/run-campaign-send-batch";

export const TEST_SANDBOX_PAYLOAD_KEY = "test_sandbox";

export type TestSendResult = { status: number; body: Record<string, unknown> };

/** 관리자별 테스트 sandbox 캠페인을 찾아 현재 입력으로 덮어쓰거나, 없으면 1건 만든다. */
export async function upsertAdminTestSandboxCampaign(
  svc: SupabaseClient,
  adminUserId: string,
  fields: CampaignWriteFields
): Promise<{ ok: true; campaignId: string } | { ok: false; error: string; status: number }> {
  const targetPayload = { ...fields.target_payload, [TEST_SANDBOX_PAYLOAD_KEY]: true };
  const { data: existing, error: findErr } = await svc
    .from("admin_notification_campaigns")
    .select("id")
    .eq("created_by", adminUserId)
    .eq("is_qa", true)
    .eq(`target_payload->>${TEST_SANDBOX_PAYLOAD_KEY}`, "true")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) return { ok: false, error: "campaign_lookup_failed", status: 503 };

  const existingId = existing ? String((existing as { id?: string }).id ?? "") : "";
  if (existingId) {
    const { error: upErr } = await svc
      .from("admin_notification_campaigns")
      .update({
        title: fields.title,
        body: fields.body,
        type: fields.type,
        channel: fields.channel,
        target_type: fields.target_type,
        deeplink_url: fields.deeplink_url,
        target_url: fields.deeplink_url,
        web_url: fields.web_url,
        push_image_url: fields.push_image_url,
        in_app_image_url: fields.in_app_image_url,
        image_url: fields.in_app_image_url ?? fields.push_image_url,
        target_payload: targetPayload,
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingId);
    if (upErr) return { ok: false, error: "update_failed", status: 500 };
    return { ok: true, campaignId: existingId };
  }

  const created = await createAdminNotificationCampaign(svc, adminUserId, {
    ...fields,
    send_mode: "immediate",
    target_payload: targetPayload,
    is_qa: true,
    save_as_draft: true,
    create_request_id: null,
  });
  if (!created.ok) return { ok: false, error: created.error, status: created.status ?? 500 };
  return { ok: true, campaignId: created.campaignId };
}

/** 캠페인 1건을 지정 회원에게만 테스트 발송 (QA 회차 · 운영 상태 변경 없음). */
export async function runAdminCampaignTestSend(
  svc: SupabaseClient,
  input: { campaignId: string; adminUserId: string; userIds: string[]; idempotencyKey: string; ip: string | null }
): Promise<TestSendResult> {
  const { campaignId: id, adminUserId, userIds, idempotencyKey } = input;
  const { data: camp } = await svc
    .from("admin_notification_campaigns")
    .select(
      "id, title, body, type, channel, target_type, deeplink_url, web_url, target_url, target_payload, push_image_url, in_app_image_url, test_send_idempotency_key"
    )
    .eq("id", id)
    .maybeSingle();

  if (!camp) {
    return { status: 404, body: { ok: false, error: "not_found" } };
  }

  const sourceEligibility = await evaluateOfficialCampaignSendEligibility(
    {
      type: (camp as { type?: string }).type,
      target_payload: (camp as { target_payload?: unknown }).target_payload,
      deeplink_url: (camp as { deeplink_url?: string | null }).deeplink_url,
      web_url: (camp as { web_url?: string | null }).web_url,
      target_url: (camp as { target_url?: string | null }).target_url,
    },
    async (eventId) => {
      const { data } = await svc
        .from("platform_events")
        .select("status, starts_at, ends_at")
        .eq("id", eventId)
        .maybeSingle();
      if (!data) return null;
      const row = data as { status?: string | null; starts_at?: string | null; ends_at?: string | null };
      return { status: row.status, startsAt: row.starts_at, endsAt: row.ends_at };
    }
  );
  if (!sourceEligibility.ok) {
    const eventErrors = new Set([
      "event_source_missing",
      "event_source_unpublished",
      "event_source_unavailable",
    ]);
    return {
      status: 400,
      body: {
        ok: false,
        error: eventErrors.has(sourceEligibility.error) ? sourceEligibility.error : "campaign_source_required",
        message:
          sourceEligibility.error === "event_source_unpublished"
            ? "Event must be published before Push can be sent."
            : sourceEligibility.error === "event_source_missing"
              ? "Platform Event source was not found."
              : sourceEligibility.error === "event_source_unavailable"
                ? "Platform Event is not currently available as a Push destination."
                : "Official notice/system/marketing campaigns require content bind or approved landing.",
      },
    };
  }

  const prevKey = String((camp as { test_send_idempotency_key?: string | null }).test_send_idempotency_key ?? "");
  if (prevKey && prevKey === idempotencyKey) {
    return { status: 200, body: { ok: true, replay: true, sent: 0, skipped: 0, failed: 0 } };
  }

  await svc
    .from("admin_notification_campaigns")
    .update({ test_send_idempotency_key: idempotencyKey, is_qa: true, updated_at: new Date().toISOString() })
    .eq("id", id);

  const snapshot = buildCampaignContentSnapshot({
    title: String(camp.title ?? ""),
    body: String(camp.body ?? ""),
    type: camp.type as "notice" | "marketing" | "system",
    channel: camp.channel as "push_only" | "in_app_only" | "push_and_in_app" | "test_only",
    target_type: String(camp.target_type ?? "all"),
    deeplink_url: (camp.deeplink_url as string | null) ?? null,
    web_url: (camp.web_url as string | null) ?? null,
    push_image_url: (camp.push_image_url as string | null) ?? null,
    in_app_image_url: (camp.in_app_image_url as string | null) ?? null,
  });
  const sequenceNumber = await getNextOccurrenceSequenceNumber(svc, id);
  const ensured = await ensureCampaignOccurrence(svc, {
    campaignId: id,
    sequenceNumber,
    triggerType: "test",
    idempotencyKey: newOccurrenceIdempotencyKey(idempotencyKey),
    triggeredBy: adminUserId,
    campaign: snapshot,
  });

  if (!ensured.ok) {
    return { status: 500, body: { ok: false, error: ensured.error } };
  }

  const result = await runNotificationCampaignTestSend(svc, id, ensured.occurrence.id, userIds);
  if (!result.ok) {
    return { status: 500, body: { ok: false, error: result.error ?? "test_send_failed" } };
  }

  await writeCampaignAuditLog(svc, {
    actorId: adminUserId,
    campaignId: id,
    action: "test_send",
    after: {
      occurrence_id: ensured.occurrence.id,
      user_ids: userIds,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
    },
    targetCount: userIds.length,
    ip: input.ip,
  });

  return {
    status: 200,
    body: {
      ok: true,
      campaign_id: id,
      occurrence_id: ensured.occurrence.id,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
    },
  };
}
