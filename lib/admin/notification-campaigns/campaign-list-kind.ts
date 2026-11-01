/**
 * 푸시·알림 발송 분류 · 결과 — 서버 목록 조건과 관리자 화면이 같은 규칙을 쓴다 (클라이언트 안전, 순수 함수).
 *
 * 분류 (Owner 결정 2026-11-02 「보낼 때 고른 분류」): `target_payload.notice_category` 가 있으면 그 값.
 * 없는 과거 발송은 이전 규칙 — 마케팅 중 누르면 이벤트로 가는 알림(platform_event_id) = 이벤트.
 * `type` 은 그대로 3종(notice·system·marketing)이고, 이벤트는 type=marketing 의 한 분류다.
 */

export const CAMPAIGN_NOTICE_CATEGORIES = ["notice", "system", "event", "marketing"] as const;
export type CampaignNoticeCategory = (typeof CAMPAIGN_NOTICE_CATEGORIES)[number];

export function isCampaignNoticeCategory(v: unknown): v is CampaignNoticeCategory {
  return typeof v === "string" && (CAMPAIGN_NOTICE_CATEGORIES as readonly string[]).includes(v);
}

/** 분류 → 저장 유형(type). 이벤트는 광고성이라 마케팅 유형. */
export function campaignTypeForNoticeCategory(cat: CampaignNoticeCategory): "notice" | "system" | "marketing" {
  return cat === "event" ? "marketing" : cat;
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
}

export function campaignListKindOf(row: { type?: unknown; target_payload?: unknown }): CampaignNoticeCategory {
  const type = typeof row.type === "string" ? row.type : "";
  const p = payloadRecord(row.target_payload);
  const stored = p?.notice_category;
  if (isCampaignNoticeCategory(stored) && campaignTypeForNoticeCategory(stored) === type) return stored;
  if (type === "marketing") {
    const ev = typeof p?.platform_event_id === "string" ? p.platform_event_id.trim() : "";
    return ev ? "event" : "marketing";
  }
  return type === "system" ? "system" : "notice";
}

/**
 * 저장할 때 목적지 정규화(`validateOfficialCampaignSource`)가 target_payload 를 새로 만들어도 남겨야 하는 키.
 * notice_category = 보낼 때 고른 분류 · resend_of = 다시 보내기 원본 알림 id.
 */
export function pickCampaignMetaKeys(
  payload: unknown,
  type: string
): { ok: true; meta: Record<string, string> } | { ok: false; error: "invalid_notice_category" } {
  const p = payloadRecord(payload);
  const meta: Record<string, string> = {};
  if (!p) return { ok: true, meta };
  if (p.notice_category !== undefined && p.notice_category !== null && p.notice_category !== "") {
    if (!isCampaignNoticeCategory(p.notice_category) || campaignTypeForNoticeCategory(p.notice_category) !== type) {
      return { ok: false, error: "invalid_notice_category" };
    }
    meta.notice_category = p.notice_category;
  }
  if (typeof p.resend_of === "string" && /^[0-9a-f-]{36}$/i.test(p.resend_of.trim())) {
    meta.resend_of = p.resend_of.trim();
  }
  return { ok: true, meta };
}

/** 받는 사람 거르기 값 (= target_type). */
export const CAMPAIGN_AUDIENCE_FILTERS = ["all", "selected_users", "marketing_opt_in", "active_users", "region"] as const;
export type CampaignAudienceFilter = (typeof CAMPAIGN_AUDIENCE_FILTERS)[number];

/** 결과 거르기 — 푸시 실패 있음 / 실패 없음 (회원 단위 숫자 기준). */
export const CAMPAIGN_RESULT_FILTERS = ["fail", "ok"] as const;
export type CampaignResultFilter = (typeof CAMPAIGN_RESULT_FILTERS)[number];

export type CampaignResultMemberStats = { push_fail: number; push_none: number } | null | undefined;

export type CampaignResultBadge =
  | "pending"
  | "repeating"
  | "fail"
  | "none"
  | "ok"
  | "status";

/**
 * 「결과」 열 (시안 v3) — 발송 중 = 결과 집계 중 · 반복 진행 = 반복 진행 중 · 실패 있음 · 푸시 없음 있음 · 전부 성공.
 * 아직 보내지 않은 알림(작성 중·예약·취소 등)은 상태 이름을 그대로 보여 준다(`status`).
 */
export function campaignResultBadge(input: {
  status: string;
  sendMode?: string | null;
  stats: CampaignResultMemberStats;
}): CampaignResultBadge {
  const s = input.status;
  if (s === "sending") return "pending";
  if (input.sendMode === "recurring" && (s === "active" || s === "paused")) return "repeating";
  if (s === "sent" || s === "partially_failed" || s === "failed") {
    if (!input.stats) return "pending";
    if (input.stats.push_fail > 0) return "fail";
    if (input.stats.push_none > 0) return "none";
    return "ok";
  }
  return "status";
}

export function matchesCampaignResultFilter(f: CampaignResultFilter, stats: CampaignResultMemberStats): boolean {
  if (!stats) return false;
  return f === "fail" ? stats.push_fail > 0 : stats.push_fail === 0;
}
