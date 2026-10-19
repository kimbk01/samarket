/**
 * 커뮤니티 Admin 상태·유형 라벨 레지스트리 (설계 v2 §C-0-3) — 배달·채팅 라벨과 같은 규칙.
 * 신고 접수 ≠ 신고 인정 ≠ 콘텐츠 숨김 ≠ 커뮤니티 활동 제한 ≠ 계정 정지 — 서로 다른 라벨·색을 쓴다.
 * 미등록 값은 「알 수 없음」, 원시 값은 기술 정보에서만. Client-safe.
 */

import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";

export type AdminCommunityLabel = { ko: string; en: string; tone: AdminTone };
type Registry = Record<string, AdminCommunityLabel>;

/** 게시글·댓글 공개 상태 */
const CONTENT_STATUS: Registry = {
  active: { ko: "공개", en: "Public", tone: "success" },
  hidden: { ko: "관리자 숨김", en: "Hidden by admin", tone: "warning" },
  deleted: { ko: "삭제됨", en: "Deleted", tone: "danger" },
};

/** 피드 신고 상태 (community_reports) */
const REPORT_STATUS: Registry = {
  open: { ko: "접수", en: "Received", tone: "waiting" },
  reviewing: { ko: "검토 중", en: "Reviewing", tone: "progress" },
  resolved: { ko: "신고 인정", en: "Upheld", tone: "success" },
  dismissed: { ko: "신고 기각", en: "Dismissed", tone: "neutral" },
};

/** 모임 신고 상태 (meeting_reports) */
const MEETING_REPORT_STATUS: Registry = {
  pending: { ko: "접수", en: "Received", tone: "waiting" },
  reviewing: { ko: "검토 중", en: "Reviewing", tone: "progress" },
  resolved: { ko: "신고 인정", en: "Upheld", tone: "success" },
  rejected: { ko: "신고 기각", en: "Dismissed", tone: "neutral" },
};

/** 신고 대상 */
const REPORT_TARGET: Registry = {
  post: { ko: "게시글", en: "Post", tone: "neutral" },
  comment: { ko: "댓글", en: "Comment", tone: "neutral" },
  user: { ko: "회원", en: "Member", tone: "neutral" },
  meeting: { ko: "모임", en: "Meeting", tone: "neutral" },
  member: { ko: "모임 회원", en: "Meeting member", tone: "neutral" },
  feed_post: { ko: "모임 게시글", en: "Meeting post", tone: "neutral" },
  feed_comment: { ko: "모임 댓글", en: "Meeting comment", tone: "neutral" },
  chat_message: { ko: "모임 채팅", en: "Meeting chat", tone: "neutral" },
  album_item: { ko: "모임 앨범", en: "Meeting album", tone: "neutral" },
};

/** 신고 사유 (lib/reports/report-reason-code.ts 코드) */
const REPORT_REASON: Registry = {
  fraud: { ko: "사기", en: "Fraud", tone: "danger" },
  spam: { ko: "스팸·도배", en: "Spam", tone: "warning" },
  harassment: { ko: "욕설·비방", en: "Harassment", tone: "danger" },
  fake_listing: { ko: "허위 내용", en: "False content", tone: "warning" },
  inappropriate: { ko: "부적절한 내용", en: "Inappropriate", tone: "warning" },
  privacy: { ko: "개인정보 노출", en: "Privacy", tone: "danger" },
  promo: { ko: "광고·홍보", en: "Advertising", tone: "warning" },
  etc: { ko: "기타", en: "Other", tone: "neutral" },
  other: { ko: "기타", en: "Other", tone: "neutral" },
};

/** 제재 종류 (sanctions) */
const SANCTION_KIND: Registry = {
  warning: { ko: "경고", en: "Warning", tone: "warning" },
  community_restriction: { ko: "커뮤니티 활동 제한", en: "Community restriction", tone: "danger" },
  chat_ban: { ko: "채팅 제한", en: "Chat ban", tone: "danger" },
  temp_suspend: { ko: "계정 정지", en: "Account suspended", tone: "danger" },
  permanent_ban: { ko: "계정 차단", en: "Account banned", tone: "danger" },
};

/** 활동 제한 범위 */
const RESTRICTION_SCOPE: Registry = {
  post: { ko: "글쓰기 제한", en: "No posting", tone: "danger" },
  comment: { ko: "댓글 제한", en: "No commenting", tone: "danger" },
  all: { ko: "커뮤니티 전체 제한", en: "All community", tone: "danger" },
};

/** 활동 제한 진행 상태 (파생값) */
const RESTRICTION_STATE: Registry = {
  active: { ko: "제한 중", en: "Active", tone: "danger" },
  expired: { ko: "기간 만료", en: "Expired", tone: "neutral" },
  revoked: { ko: "해제됨", en: "Lifted", tone: "success" },
};

/** 계정 상태 (profiles.status) */
const ACCOUNT_STATUS: Registry = {
  active: { ko: "정상", en: "Active", tone: "success" },
  suspended: { ko: "계정 정지", en: "Suspended", tone: "danger" },
  blocked: { ko: "계정 차단", en: "Banned", tone: "danger" },
  withdrawn: { ko: "탈퇴", en: "Withdrawn", tone: "neutral" },
};

/** 작성 구분 (community_posts.origin_kind) */
const ORIGIN_KIND: Registry = {
  member: { ko: "회원 작성", en: "Member", tone: "neutral" },
  imported: { ko: "외부 수집", en: "Imported", tone: "progress" },
  admin: { ko: "운영팀", en: "DIBAY team", tone: "progress" },
};

/** 홍보 주문 상태 (point_promotion_orders) */
const PROMOTION_STATUS: Registry = {
  active: { ko: "노출 중", en: "Live", tone: "success" },
  paused: { ko: "노출 중지", en: "Paused", tone: "warning" },
  ended: { ko: "종료", en: "Ended", tone: "neutral" },
  expired: { ko: "기간 만료", en: "Expired", tone: "neutral" },
  rejected: { ko: "반려", en: "Rejected", tone: "neutral" },
  cancelled: { ko: "취소", en: "Cancelled", tone: "neutral" },
  pending_review: { ko: "심사 대기(이전 방식)", en: "Pending (legacy)", tone: "waiting" },
};

/** 홍보 종료 귀책 */
const PROMOTION_FAULT: Registry = {
  operator: { ko: "운영 사유 (환급)", en: "Operator (refund)", tone: "progress" },
  member: { ko: "회원 사유 (환급 없음)", en: "Member (no refund)", tone: "neutral" },
  none: { ko: "해당 없음", en: "None", tone: "neutral" },
};

/** 충전 신청 상태 */
const CHARGE_STATUS: Registry = {
  pending: { ko: "승인 대기", en: "Pending", tone: "waiting" },
  waiting_confirm: { ko: "입금 확인 대기", en: "Awaiting payment", tone: "waiting" },
  on_hold: { ko: "보류", en: "On hold", tone: "warning" },
  approved: { ko: "승인", en: "Approved", tone: "success" },
  rejected: { ko: "반려", en: "Rejected", tone: "neutral" },
  cancelled: { ko: "회원 취소", en: "Cancelled", tone: "neutral" },
};

/** 고정 범위 */
const PIN_SCOPE: Registry = {
  feed: { ko: "피드 전체 고정", en: "Pinned to feed", tone: "progress" },
  topic: { ko: "카테고리 고정", en: "Pinned to category", tone: "progress" },
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
  return { label: ko ? "알 수 없음" : "Unknown", tone: "neutral", known: false };
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
