/**
 * 커뮤니티 운영 기록 표시 라벨 (설계 §C-20 · §E-7) — 조치·대상 유형을 한국어로, 대상 화면 링크로.
 * 원시 action·target_type 은 화면 1차 정보로 쓰지 않는다 (기술 정보에서만). Client-safe.
 */

/** 정확히 일치하는 조치 */
const ACTION_EXACT: Record<string, string> = {
  "community_post.status_hidden": "게시글 숨김",
  "community_post.status_active": "게시글 다시 공개",
  "community_post.status_deleted": "게시글 삭제",
  "community_post.hard_delete": "게시글 영구 삭제",
  "community_post.content_update": "게시글 관리자 수정",
  "community_post.image_delete": "게시글 이미지 삭제",
  "community_post.update": "게시글 정보 변경",
  "community_post.pin": "게시글 상단 고정",
  "community_post.unpin": "게시글 고정 해제",
  "community_comment.status_hidden": "댓글 숨김",
  "community_comment.status_active": "댓글 다시 공개",
  "community_comment.status_deleted": "댓글 삭제",
  "community_report.decision": "신고 결정",
  "community_sanction.apply_warning": "경고",
  "community_sanction.apply_community_restriction": "활동 제한",
  "community_sanction.revoke": "제한 해제",
  "community_promotion_order.pause": "홍보 노출 중지",
  "community_promotion_order.resume": "홍보 노출 재개",
  "community_promotion_order.end": "홍보 종료",
  "point_promotion_order.end": "홍보 종료",
  "point_promotion_order.pause": "홍보 노출 중지",
  "point_promotion_order.resume": "홍보 노출 재개",
  admin_point_credit: "포인트 지급",
  admin_point_debit: "포인트 회수",
  admin_point_reconcile: "포인트 잔액 정리",
  approve: "충전 승인",
  approved: "충전 승인",
  rejected: "충전 반려",
  on_hold: "충전 보류",
  admin_memo_update: "충전 메모 수정",
  "community_topic.create": "카테고리 추가",
  "community_topic.update": "카테고리 변경",
  "community_topic.delete": "카테고리 삭제",
  "community_section.create": "피드 섹션 추가",
  "community_section.update": "피드 섹션 변경",
  "community_section.delete": "피드 섹션 삭제",
  "community_settings.update": "운영 설정 변경",
  "community_settings.neighborhood_section_update": "운영 설정 변경",
  "community_settings.neighborhood_filter_update": "운영 설정 변경",
  "community_notice.create": "공지 게시",
  "community_notice.update": "공지 수정",
  "community_notice.end": "공지 종료",
  "community_import.job_create": "외부 글 수집 시작",
  "community_import.job_cancel": "외부 글 수집 취소",
  "community_import.job_retry_failed": "외부 글 수집 재시도",
  "community_import.inbox_status": "수집 글 상태 변경",
  "community_import.draft_save": "수집 글 편집",
  "community_import.rule_toggle": "수집 규칙 켜기/끄기",
};

/** 접두 일치 (위에서 못 찾을 때) */
const ACTION_PREFIX: [string, string][] = [
  ["community_topic.", "카테고리 변경"],
  ["community_section.", "피드 섹션 변경"],
  ["community_settings.", "운영 설정 변경"],
  ["community_import", "외부 글 가져오기 변경"],
  ["community_notice.", "공지 변경"],
  ["meeting", "모임 처리"],
  ["community_post.", "게시글 처리"],
  ["community_comment.", "댓글 처리"],
];

export function communityAuditActionLabel(action: string | null | undefined): string {
  const a = String(action ?? "").trim();
  if (!a) return "기타 조치";
  const hit = ACTION_EXACT[a];
  if (hit) return hit;
  for (const [p, label] of ACTION_PREFIX) if (a.startsWith(p)) return label;
  return "기타 조치";
}

/** 대상 유형 (필터 선택지 순서) */
export const COMMUNITY_AUDIT_TARGET_LABELS: { value: string; label: string }[] = [
  { value: "community_post", label: "게시글" },
  { value: "community_comment", label: "댓글" },
  { value: "community_report", label: "신고" },
  { value: "meeting_report", label: "모임 신고" },
  { value: "community_sanction", label: "경고·활동 제한" },
  { value: "sanction", label: "제재" },
  { value: "meeting", label: "모임" },
  { value: "community_topic", label: "카테고리" },
  { value: "community_section", label: "피드 섹션" },
  { value: "community_settings", label: "운영 설정" },
  { value: "community_notice", label: "공지" },
  { value: "community_promotion_order", label: "게시글 홍보" },
  { value: "point_promotion_order", label: "홍보 주문" },
  { value: "user_points", label: "회원 포인트" },
  { value: "point_charge_request", label: "충전 신청" },
];

export function communityAuditTargetLabel(t: string | null | undefined): string {
  const s = String(t ?? "");
  const hit = COMMUNITY_AUDIT_TARGET_LABELS.find((x) => x.value === s);
  if (hit) return hit.label;
  if (s.startsWith("community_import")) return "외부 글 가져오기";
  return "기타";
}

/** 대상 → Admin 화면 링크 (없으면 null) */
export function communityAuditTargetHref(type: string | null | undefined, id: string | null | undefined): string | null {
  const t = String(type ?? "");
  const raw = String(id ?? "").trim();
  const enc = encodeURIComponent(raw);
  switch (t) {
    case "community_post":
      return raw ? `/admin/community/posts/${enc}` : "/admin/community/posts";
    case "community_comment":
      return raw ? `/admin/community/comments?commentId=${enc}` : "/admin/community/comments";
    case "community_report":
      return raw ? `/admin/community/reports?reportId=${enc}` : "/admin/community/reports";
    case "meeting_report":
      return "/admin/philife/meeting-reports";
    case "community_sanction":
    case "sanction":
      return raw ? `/admin/community/restrictions?sanctionId=${enc}` : "/admin/community/restrictions";
    case "meeting":
      return "/admin/community/meetings";
    case "community_topic":
      return "/admin/community/topics";
    case "community_section":
      return "/admin/community/sections";
    case "community_settings":
      return "/admin/community/settings";
    case "community_notice":
      return "/admin/community/notices";
    case "community_promotion_order":
    case "point_promotion_order":
      return "/admin/community/promotions?tab=all";
    case "user_points":
      return raw ? `/admin/community/points?userId=${enc}` : "/admin/community/points";
    case "point_charge_request":
      return "/admin/community/point-charges?status=all";
    default:
      return t.startsWith("community_import") ? "/admin/community/external-import" : null;
  }
}

/** 전후 비교에서 보여 줄 필드 이름 (모르는 키는 그대로 기술 정보로) */
const FIELD_LABELS: Record<string, string> = {
  status: "상태",
  title: "제목",
  content: "본문",
  topic_id: "카테고리",
  is_reported: "신고 있음",
  reason: "사유",
  order_status: "홍보 상태",
  end_at: "종료 시각",
  start_at: "시작 시각",
  fault: "귀책",
  refund_points: "환급 포인트",
  amount: "포인트",
  request_status: "충전 상태",
  restriction: "제한 범위",
  sanction_type: "조치 종류",
  revoked_at: "해제 시각",
  name: "이름",
  is_active: "사용 여부",
  sort_order: "순서",
  pinned_scope: "고정 범위",
  decision: "결정",
};

export function communityAuditFieldLabel(key: string): string | null {
  return FIELD_LABELS[key] ?? null;
}
