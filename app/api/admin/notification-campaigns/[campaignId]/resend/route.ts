import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { createAdminNotificationCampaign } from "@/lib/admin/notification-campaigns/campaign-create-service";
import {
  mergeCampaignPatchOverRow,
  parseCampaignWriteInput,
  type CampaignWriteBody,
} from "@/lib/admin/notification-campaigns/campaign-input";
import {
  campaignAuditSnapshot,
  readAuditRequestIp,
  writeCampaignAuditLog,
} from "@/lib/admin/notification-campaigns/campaign-audit-log";
import {
  campaignResendUserIds,
  resolveCampaignOccurrenceForRecipients,
} from "@/lib/admin/notification-campaigns/campaign-recipients-service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = ["same", "failed", "unread"] as const;
const SEND_MODES = ["immediate", "scheduled", "recurring"] as const;

/**
 * POST — 다시 보내기 · 반복 설정 (Owner 구현 승인 2026-11-02 · 시안 v3).
 * 원본 알림을 그대로 복사해 새 알림을 만든다(수정 저장과 같은 병합·검증·생성 경로). 받는 사람만 바뀐다:
 * same = 처음과 같은 대상 · failed = 푸시 실패한 회원 · unread = 열지 않은 회원(같은 회원 단위 계산).
 * 즉시 발송은 화면이 돌려받은 id·회차로 기존 `/send` 를 부른다(만들기 → 보내기 2단계 = 알림 보내기와 같음).
 * 두 단계 모두 창마다 같은 멱등 키 — 다시 눌러도 같은 알림을 만들고(create_request_id replay) 같은 회차를 보낸다.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  const gate = await requireAdminPermission("manage");
  if (!gate.ok) return gate.response;
  const adminUserId = gate.actor.userId;

  const { campaignId } = await ctx.params;
  const id = typeof campaignId === "string" ? campaignId.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mode = (MODES as readonly string[]).includes(String(body.mode)) ? (String(body.mode) as (typeof MODES)[number]) : "same";
  const sendMode = (SEND_MODES as readonly string[]).includes(String(body.send_mode))
    ? (String(body.send_mode) as (typeof SEND_MODES)[number])
    : "immediate";

  const { data: row, error } = await svc.from("admin_notification_campaigns").select("*").eq("id", id).maybeSingle();
  if (error || !row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const r = row as Record<string, unknown>;
  if (typeof r.archived_at === "string" && r.archived_at) {
    return NextResponse.json({ ok: false, error: "campaign_archived" }, { status: 409 });
  }
  // 재감사 2026-11-02 A7 — 화면과 같은 조건을 서버도 지킨다: 아직 보내지 않은 알림(작성 중·예약)은 다시 보내기 대상이 아니다.
  if (["draft", "scheduled"].includes(String(r.status ?? ""))) {
    return NextResponse.json({ ok: false, error: "resend_requires_sent_campaign" }, { status: 409 });
  }
  if (String(r.channel ?? "") === "test_only") {
    return NextResponse.json({ ok: false, error: "test_only_use_test_send_endpoint" }, { status: 409 });
  }

  let userIds: string[] | null = null;
  if (mode !== "same") {
    const occ = await resolveCampaignOccurrenceForRecipients(svc, id, null);
    if (!occ) return NextResponse.json({ ok: false, error: "occurrence_not_found" }, { status: 409 });
    userIds = await campaignResendUserIds(svc, occ.id, mode);
    if (userIds.length === 0) return NextResponse.json({ ok: false, error: "no_recipients" }, { status: 409 });
  }

  const patch: CampaignWriteBody = {
    send_mode: sendMode,
    scheduled_at: sendMode === "scheduled" ? body.scheduled_at : null,
    ...(sendMode === "recurring"
      ? {
          recurrence_kind: body.recurrence_kind,
          recurrence_time: body.recurrence_time,
          recurrence_timezone: "Asia/Manila",
          recurrence_start_at: body.recurrence_start_at,
          recurrence_end_at: body.recurrence_end_at ?? null,
          recurrence_weekday: body.recurrence_weekday ?? null,
        }
      : {
          recurrence_kind: undefined,
          recurrence_time: null,
          recurrence_start_at: null,
          recurrence_end_at: null,
          recurrence_weekday: null,
        }),
    ...(userIds ? { target_type: "selected_users", target_user_ids: userIds } : {}),
  };
  const merged = mergeCampaignPatchOverRow(r, patch);
  if (userIds) {
    const payload = (merged.body.target_payload && typeof merged.body.target_payload === "object"
      ? { ...(merged.body.target_payload as Record<string, unknown>) }
      : {}) as Record<string, unknown>;
    payload.selected_user_ids = userIds;
    merged.body.target_payload = payload;
  } else if (String(r.target_type ?? "") === "selected_users") {
    const payload = r.target_payload && typeof r.target_payload === "object" ? (r.target_payload as Record<string, unknown>) : {};
    const ids = Array.isArray(payload.selected_user_ids) ? payload.selected_user_ids.map(String) : [];
    merged.body.target_user_ids = ids;
  }
  const parsed = parseCampaignWriteInput(merged.body, { hasOwnTargetPayload: true });
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, ...(parsed.message ? { message: parsed.message } : {}) }, { status: parsed.status });
  }

  const requestKey =
    req.headers.get("idempotency-key")?.trim() ||
    (typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "") ||
    null;
  const result = await createAdminNotificationCampaign(svc, adminUserId, {
    ...parsed.fields,
    is_qa: r.is_qa === true,
    create_request_id: requestKey ? requestKey.slice(0, 128) : null,
    save_as_draft: false,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status ?? 500 });

  if (!result.replay) {
    await writeCampaignAuditLog(svc, {
      actorId: adminUserId,
      campaignId: result.campaignId,
      action: sendMode === "immediate" ? "create" : "schedule",
      fromStatus: null,
      toStatus: sendMode === "scheduled" ? "scheduled" : sendMode === "recurring" ? "active" : "draft",
      before: { resend_of: id, mode },
      after: campaignAuditSnapshot({ ...parsed.fields, status: sendMode }),
      targetCount: userIds?.length ?? null,
      ip: readAuditRequestIp(req.headers),
    });
  }

  return NextResponse.json({
    ok: true,
    id: result.campaignId,
    occurrence_id: result.occurrenceId,
    recipients: userIds?.length ?? null,
    replay: result.replay,
  });
}
