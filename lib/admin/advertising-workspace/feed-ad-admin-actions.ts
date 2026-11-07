/**
 * 피드 배너 관리자 조치 단일 구현 (설계 §6 · FB-A05/A06/A07 · AD-110/111/206/207 · AL-09 · AL-10 · D-5 · D-6 · 2026-11-04).
 *
 * 공통 광고 화면(`POST /api/admin/advertising-workspace/action`)과 도메인 화면(`PATCH /api/admin/feed-ad-requests/[id]`)이
 * **같은 함수**를 부른다 → 같은 사유 규칙 · 같은 감사 이름 · before/after 가 같다.
 *
 * - 승인 = `feed_ad_request.approve` · 정지/재개/종료 = `feed_ad_request.pause|resume|end` ·
 *   보상 연장 = `feed_ad_request.extend_compensation` (AD-206 · 허브도 같은 이름).
 * - 감사 대상 유형: 회원 신청이 있으면 `feed_ad_request`(신청 id), 신청 없는 운영자 등록 캠페인이면 `feed_ad_campaign`(캠페인 id) (AL-10).
 * - 정지·재개·종료는 담당 F 의 DB 함수 래퍼 `lib/ads/admin-feed-ad-lifecycle.ts` 만 부른다 (D-5 · 정지 시간 연장 · 귀책 비례 환급).
 *   D-14 (2026-11-07): 정지·재개·종료 감사는 **DB 함수가 1행만** 쓴다(화면 이름 p_screen 전달). 여기서 추가 감사를 쓰지 않는다
 *   (예전에는 1번 조치에 감사 2행). 승인·보상 연장은 DB 함수가 감사를 쓰지 않으므로 여기서 쓴다.
 * - 정지·재개·종료·연장 모두 공개 사유 필수(2자 · 120자) · 내부 메모 선택 (FB-A05 · D-6). 빈 사유를 코드값으로 바꿔 저장하지 않는다.
 * 서버 전용.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_REASON_REQUIRED_CODE } from "@/lib/admin/operator-ux/admin-reason";
import {
  adsClientSafeErrorCode,
  appendAdsAdminActionAudit,
  type AdsAdminActionScreen,
} from "@/lib/admin/advertising-workspace/ads-admin-action-audit";
import {
  adminEndFeedAd,
  adminPauseFeedAd,
  adminResumeFeedAd,
  type AdminFeedAdLifecycleResult,
} from "@/lib/ads/admin-feed-ad-lifecycle";
import { approveFeedAdRequest } from "@/lib/ads/approve-feed-ad-request";
import { adminCompensateExtendFeedAdCampaign } from "@/lib/ads/admin-compensate-extend-feed-ad-campaign";

export type FeedAdAdminAction = "approve" | "pause" | "resume" | "end" | "extend_compensation";
export type FeedAdEndFaultInput = "operator" | "member" | "none";

export const FEED_AD_ADMIN_AUDIT_ACTIONS: Record<FeedAdAdminAction, string> = {
  approve: "feed_ad_request.approve",
  pause: "feed_ad_request.pause",
  resume: "feed_ad_request.resume",
  end: "feed_ad_request.end",
  extend_compensation: "feed_ad_request.extend_compensation",
};

export type FeedAdAdminActionOutcome = {
  ok: boolean;
  httpStatus: number;
  body: Record<string, unknown>;
};

type CampaignSnapshot = {
  id: string;
  status: string | null;
  start_at: string | null;
  end_at: string | null;
  source: string | null;
  request_id: string | null;
  paused_by?: string | null;
  public_reason?: string | null;
};

export type FeedAdTarget = {
  requestId: string | null;
  campaignId: string | null;
  requestStatus: string | null;
};

/**
 * 허브 행 id 는 회원 신청 id 또는 운영자 등록 캠페인 id 가 섞여 있다 (CM-P1-04 · AL-09).
 * 신청이 있으면 신청 → 캠페인 id, 없으면 그 id 를 캠페인 id 로 본다.
 */
export async function resolveFeedAdTarget(
  sb: SupabaseClient,
  entityId: string,
  opts?: { campaignIdHint?: string | null }
): Promise<FeedAdTarget> {
  const id = entityId.trim();
  const { data: reqRow } = await sb
    .from("feed_ad_requests")
    .select("id, status, campaign_id")
    .eq("id", id)
    .maybeSingle();
  if (reqRow && (reqRow as { id?: string }).id) {
    const r = reqRow as { id: string; status?: string | null; campaign_id?: string | null };
    const hint = (opts?.campaignIdHint ?? "").trim();
    return {
      requestId: r.id,
      campaignId: (r.campaign_id ? String(r.campaign_id) : "") || hint || null,
      requestStatus: r.status != null ? String(r.status) : null,
    };
  }
  return { requestId: null, campaignId: id || null, requestStatus: null };
}

async function readCampaign(sb: SupabaseClient, campaignId: string | null): Promise<CampaignSnapshot | null> {
  if (!campaignId) return null;
  const { data } = await sb.from("feed_ad_campaigns").select("*").eq("id", campaignId).maybeSingle();
  if (!data) return null;
  const c = data as Record<string, unknown>;
  return {
    id: String(c.id ?? campaignId),
    status: c.status != null ? String(c.status) : null,
    start_at: c.start_at != null ? String(c.start_at) : null,
    end_at: c.end_at != null ? String(c.end_at) : null,
    source: c.source != null ? String(c.source) : null,
    request_id: c.request_id != null ? String(c.request_id) : null,
    paused_by: c.paused_by != null ? String(c.paused_by) : null,
    public_reason: c.public_reason != null ? String(c.public_reason) : null,
  };
}

function lifecycleHttpStatus(code: string): number {
  if (code === "not_found") return 404;
  if (code === "already_ended" || code === "not_active" || code === "not_paused") return 409;
  if (code === "rpc_failed") return 500;
  return 400;
}

function lifecycleFail(res: AdminFeedAdLifecycleResult): FeedAdAdminActionOutcome {
  const code = adsClientSafeErrorCode(res.error, "save_failed", "[feed-ad-admin-action]");
  return { ok: false, httpStatus: lifecycleHttpStatus(code), body: { ok: false, error: code } };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function runFeedAdAdminAction(
  sb: SupabaseClient,
  req: Request,
  input: {
    entityId: string;
    campaignIdHint?: string | null;
    action: FeedAdAdminAction;
    adminUserId: string;
    /** 공개 사유 (회원에게 보임 · 2자 이상 · 120자) — 라우트가 parseAdminPublicReason 으로 정리해 넘긴다 */
    publicReason: string | null;
    internalReason?: string | null;
    fault?: FeedAdEndFaultInput | null;
    preview?: boolean;
    requestedDays?: number;
    screen: AdsAdminActionScreen;
  }
): Promise<FeedAdAdminActionOutcome> {
  const isPreview = input.action === "end" && input.preview === true;
  if (!isPreview && !input.publicReason) {
    return { ok: false, httpStatus: 400, body: { ok: false, error: ADMIN_REASON_REQUIRED_CODE } };
  }
  const publicReason = input.publicReason;
  const internalReason = input.internalReason ?? null;
  const target = await resolveFeedAdTarget(sb, input.entityId, { campaignIdHint: input.campaignIdHint });
  const auditTargetType = target.requestId ? "feed_ad_request" : "feed_ad_campaign";
  const auditTargetId = target.requestId ?? target.campaignId ?? input.entityId;
  const auditAction = FEED_AD_ADMIN_AUDIT_ACTIONS[input.action];

  if (input.action === "approve") {
    if (!target.requestId) {
      return { ok: false, httpStatus: 400, body: { ok: false, error: "not_member_request" } };
    }
    const res = await approveFeedAdRequest(sb, { requestId: target.requestId, adminUserId: input.adminUserId });
    if (!res.ok) {
      const status = res.httpStatus ?? 500;
      return {
        ok: false,
        httpStatus: status,
        body: { ok: false, error: adsClientSafeErrorCode(res.error, "save_failed", "[feed-ad-approve]") },
      };
    }
    const after = await readCampaign(sb, res.campaignId);
    await appendAdsAdminActionAudit(sb, req, {
      actorId: input.adminUserId,
      targetType: "feed_ad_request",
      targetId: target.requestId,
      action: auditAction,
      screen: input.screen,
      before: { status: target.requestStatus ?? "pending_review" },
      after: { status: res.status, campaign_id: res.campaignId, campaign: after },
      reasonPublic: publicReason,
      reasonInternal: internalReason,
    });
    return { ok: true, httpStatus: 200, body: { ok: true, status: res.status, campaignId: res.campaignId } };
  }

  if (!target.campaignId) {
    return { ok: false, httpStatus: 400, body: { ok: false, error: "missing_campaign" } };
  }

  if (input.action === "extend_compensation") {
    const before = await readCampaign(sb, target.campaignId);
    const days = Number(input.requestedDays ?? 0);
    const ext = await adminCompensateExtendFeedAdCampaign(sb, {
      adminUserId: input.adminUserId,
      // AL-09: 캠페인 id 를 직접 넘긴다 (운영자 등록 캠페인 id 를 신청 id 로 넘겨 항상 400 이던 결함)
      campaignId: target.campaignId,
      requestId: target.requestId,
      requestedDays: Number.isInteger(days) ? days : 0,
      reason: publicReason ?? "",
    });
    if (!ext.ok) {
      return {
        ok: false,
        httpStatus: ext.httpStatus,
        body: { ok: false, error: adsClientSafeErrorCode(ext.error, "save_failed", "[feed-ad-extend]") },
      };
    }
    const after = await readCampaign(sb, target.campaignId);
    await appendAdsAdminActionAudit(sb, req, {
      actorId: input.adminUserId,
      targetType: auditTargetType,
      targetId: auditTargetId,
      action: auditAction,
      screen: input.screen,
      before: { campaign: before, old_end: ext.previousEndAt },
      after: {
        campaign: after,
        new_end: ext.newEndAt,
        extension_duration_days: ext.daysAdded,
        charge_policy: "ADMIN_FREE_COMPENSATION",
        campaign_id: target.campaignId,
      },
      reasonPublic: publicReason,
      reasonInternal: internalReason,
    });
    return { ok: true, httpStatus: 200, body: { ok: true, extension: ext } };
  }

  const reasons = {
    campaignId: target.campaignId,
    adminUserId: input.adminUserId,
    publicReason,
    internalReason,
    screen: input.screen,
  };

  if (input.action === "end") {
    const res = await adminEndFeedAd(sb, {
      ...reasons,
      fault: input.fault ?? null,
      preview: isPreview,
    });
    if (!res.ok) return lifecycleFail(res);
    const refundPoints = num(res.refund_points);
    const preview = {
      refundPoints,
      paidPoints: num(res.paid_points),
      remainingSeconds: num(res.remaining_seconds),
    };
    if (isPreview) {
      return { ok: true, httpStatus: 200, body: { ok: true, preview, refundPoints } };
    }
    // D-14: 감사는 admin_feed_ad_end 가 같은 트랜잭션에서 1행 기록
    const after = await readCampaign(sb, target.campaignId);
    return {
      ok: true,
      httpStatus: 200,
      body: {
        ok: true,
        status: after?.status ?? "ended",
        campaignId: target.campaignId,
        requestId: target.requestId,
        refundPoints,
        paidPoints: preview.paidPoints,
      },
    };
  }

  const res =
    input.action === "pause" ? await adminPauseFeedAd(sb, reasons) : await adminResumeFeedAd(sb, reasons);
  if (!res.ok) return lifecycleFail(res);
  // D-14: 감사는 admin_feed_ad_pause/resume 이 같은 트랜잭션에서 1행 기록
  const after = await readCampaign(sb, target.campaignId);
  return {
    ok: true,
    httpStatus: 200,
    body: {
      ok: true,
      status: after?.status ?? res.status ?? null,
      campaignId: target.campaignId,
      requestId: target.requestId,
      ...(input.action === "resume" ? { extendedSeconds: num(res.extended_seconds) } : {}),
    },
  };
}
