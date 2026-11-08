/**
 * 커뮤니티 Admin 상태·유형 라벨 레지스트리 (설계 v2 §C-0-3) — 배달·채팅 라벨과 같은 규칙.
 * 신고 접수 ≠ 신고 인정 ≠ 콘텐츠 숨김 ≠ 커뮤니티 활동 제한 ≠ 계정 정지 — 서로 다른 라벨·색을 쓴다.
 * 미등록 값은 「알 수 없음」, 원시 값은 기술 정보에서만. Client-safe.
 */

import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export type AdminCommunityLabel = { ko: string; en: string; tone: AdminTone };
type Registry = Record<string, AdminCommunityLabel>;

/** 게시글·댓글 공개 상태 */
const CONTENT_STATUS: Registry = {
  active: { ...catalogPair("admin_chat_room_visibility_public"), tone: "success" },
  hidden: { ...catalogPair("admin_hidden_by_admin"), tone: "warning" },
  deleted: { ...catalogPair("admin_ads_history_filter_deleted"), tone: "danger" },
};

/** 피드 신고 상태 (community_reports) */
const REPORT_STATUS: Registry = {
  open: { ...catalogPair("admin_chat_reports_status_received"), tone: "waiting" },
  reviewing: { ...catalogPair("admin_chat_reports_status_reviewing"), tone: "progress" },
  resolved: { ...catalogPair("admin_upheld"), tone: "success" },
  dismissed: { ...catalogPair("admin_dismissed"), tone: "neutral" },
};

/** 모임 신고 상태 (meeting_reports) */
const MEETING_REPORT_STATUS: Registry = {
  pending: { ...catalogPair("admin_chat_reports_status_received"), tone: "waiting" },
  reviewing: { ...catalogPair("admin_chat_reports_status_reviewing"), tone: "progress" },
  resolved: { ...catalogPair("admin_upheld"), tone: "success" },
  rejected: { ...catalogPair("admin_dismissed"), tone: "neutral" },
};

/** 신고 대상 */
const REPORT_TARGET: Registry = {
  post: { ...catalogPair("admin_trade_post_ads_th_post"), tone: "neutral" },
  comment: { ...catalogPair("admin_community_comments_col_body"), tone: "neutral" },
  user: { ...catalogPair("admin_users_role_badge_member"), tone: "neutral" },
  meeting: { ...catalogPair("admin_meeting_reports_target_meeting"), tone: "neutral" },
  member: { ...catalogPair("admin_meeting_member"), tone: "neutral" },
  feed_post: { ...catalogPair("admin_meeting_post"), tone: "neutral" },
  feed_comment: { ...catalogPair("admin_meeting_comment"), tone: "neutral" },
  chat_message: { ...catalogPair("admin_meeting_chat"), tone: "neutral" },
  album_item: { ...catalogPair("admin_meeting_album"), tone: "neutral" },
};

/** 신고 사유 (lib/reports/report-reason-code.ts 코드) */
const REPORT_REASON: Registry = {
  fraud: { ...catalogPair("admin_report_reason_fraud"), tone: "danger" },
  spam: { ...catalogPair("admin_spam"), tone: "warning" },
  harassment: { ...catalogPair("admin_harassment"), tone: "danger" },
  fake_listing: { ...catalogPair("admin_false_content"), tone: "warning" },
  inappropriate: { ...catalogPair("admin_inappropriate"), tone: "warning" },
  privacy: { ...catalogPair("admin_privacy"), tone: "danger" },
  promo: { ...catalogPair("admin_advertising"), tone: "warning" },
  etc: { ...catalogPair("admin_menu_bottom_icon_cat_misc"), tone: "neutral" },
  other: { ...catalogPair("admin_menu_bottom_icon_cat_misc"), tone: "neutral" },
};

/** 제재 종류 (sanctions) */
const SANCTION_KIND: Registry = {
  warning: { ...catalogPair("admin_rec_mon_summary_warning"), tone: "warning" },
  community_restriction: { ...catalogPair("admin_community_restriction"), tone: "danger" },
  chat_ban: { ...catalogPair("admin_chat_ban_2"), tone: "danger" },
  temp_suspend: { ...catalogPair("admin_account_suspended"), tone: "danger" },
  permanent_ban: { ...catalogPair("admin_account_banned"), tone: "danger" },
};

/** 활동 제한 범위 */
const RESTRICTION_SCOPE: Registry = {
  post: { ...catalogPair("admin_no_posting"), tone: "danger" },
  comment: { ...catalogPair("admin_no_commenting"), tone: "danger" },
  all: { ...catalogPair("admin_all_community"), tone: "danger" },
};

/** 활동 제한 진행 상태 (파생값) */
const RESTRICTION_STATE: Registry = {
  active: { ...catalogPair("admin_active_3"), tone: "danger" },
  expired: { ...catalogPair("admin_expired"), tone: "neutral" },
  revoked: { ...catalogPair("admin_lifted"), tone: "success" },
};

/** 계정 상태 (profiles.status) */
const ACCOUNT_STATUS: Registry = {
  active: { ...catalogPair("admin_users_lite_status_active"), tone: "success" },
  suspended: { ...catalogPair("admin_suspended"), tone: "danger" },
  blocked: { ...catalogPair("admin_banned"), tone: "danger" },
  withdrawn: { ...catalogPair("admin_withdrawn"), tone: "neutral" },
};

/** 작성 구분 (community_posts.origin_kind) */
const ORIGIN_KIND: Registry = {
  member: { ...catalogPair("admin_member_2"), tone: "neutral" },
  imported: { ...catalogPair("admin_imported"), tone: "progress" },
  admin: { ...catalogPair("admin_dibay_team"), tone: "progress" },
};

/** 홍보 주문 상태 (point_promotion_orders) */
const PROMOTION_STATUS: Registry = {
  active: { ...catalogPair("admin_live"), tone: "success" },
  paused: { ...catalogPair("admin_paused_2"), tone: "warning" },
  ended: { ...catalogPair("admin_ended"), tone: "neutral" },
  expired: { ...catalogPair("admin_expired"), tone: "neutral" },
  rejected: { ...catalogPair("admin_rejected"), tone: "neutral" },
  cancelled: { ...catalogPair("admin_cancelled_3"), tone: "neutral" },
  pending_review: { ...catalogPair("admin_pending_legacy"), tone: "waiting" },
};

/** 홍보 종료 귀책 */
const PROMOTION_FAULT: Registry = {
  operator: { ...catalogPair("admin_operator_refund"), tone: "progress" },
  member: { ...catalogPair("admin_ads_w3_promotion_fault_member"), tone: "neutral" },
  none: { ...catalogPair("admin_del_ops_queue_none"), tone: "neutral" },
};

/** 충전 신청 상태 */
const CHARGE_STATUS: Registry = {
  pending: { ...catalogPair("admin_pending_2"), tone: "waiting" },
  waiting_confirm: { ...catalogPair("admin_awaiting_payment"), tone: "waiting" },
  on_hold: { ...catalogPair("admin_on_hold"), tone: "warning" },
  approved: { ...catalogPair("admin_approved"), tone: "success" },
  rejected: { ...catalogPair("admin_rejected"), tone: "neutral" },
  cancelled: { ...catalogPair("admin_cancelled_4"), tone: "neutral" },
};

/** 고정 범위 */
const PIN_SCOPE: Registry = {
  feed: { ...catalogPair("admin_pinned_to_feed"), tone: "progress" },
  topic: { ...catalogPair("admin_pinned_to_category"), tone: "progress" },
};

const REGISTRIES = {
  content_status: CONTENT_STATUS,
  report_status: REPORT_STATUS,
  meeting_report_status: MEETING_REPORT_STATUS,
  report_target: REPORT_TARGET,
  report_reason: REPORT_REASON,
  sanction_kind: SANCTION_KIND,
  restriction_scope: RESTRICTION_SCOPE,
  restriction_state: RESTRICTION_STATE,
  account_status: ACCOUNT_STATUS,
  origin_kind: ORIGIN_KIND,
  promotion_status: PROMOTION_STATUS,
  promotion_fault: PROMOTION_FAULT,
  charge_status: CHARGE_STATUS,
  pin_scope: PIN_SCOPE,
} as const;

export type AdminCommunityLabelDomain = keyof typeof REGISTRIES;

export function adminCommunityLabel(
  domain: AdminCommunityLabelDomain,
  raw: string | null | undefined,
  ko: boolean
): { label: string; tone: AdminTone; known: boolean } {
  const key = String(raw ?? "").trim().toLowerCase();
  const hit = REGISTRIES[domain][key];
  if (hit) return { label: ko ? hit.ko : hit.en, tone: hit.tone, known: true };
  if (!key) return { label: "—", tone: "neutral", known: false };
  return { label: tx(ko, "admin_status_labels_unknown"), tone: "neutral", known: false };
}

export function adminCommunityLabelCodes(domain: AdminCommunityLabelDomain): string[] {
  return Object.keys(REGISTRIES[domain]);
}

/** 신고 사유 저장값 "code: 자유 입력" 분리 (app/api/community/reports 저장 형식) */
export function splitCommunityReportReason(raw: string | null | undefined): { code: string; text: string } {
  const s = String(raw ?? "").trim();
  const m = /^([a-z_]+):\s*([\s\S]*)$/.exec(s);
  if (m) return { code: m[1], text: m[2].trim() };
  return { code: "other", text: s };
}

/** 활동 제한 진행 상태 파생 */
export function communityRestrictionState(row: {
  revoked_at?: string | null;
  end_at?: string | null;
}): "active" | "expired" | "revoked" {
  if (row.revoked_at) return "revoked";
  if (row.end_at && Date.parse(row.end_at) <= Date.now()) return "expired";
  return "active";
}
