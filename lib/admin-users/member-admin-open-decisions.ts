/**
 * Owner-fixed Open Decisions for Corrective Member Management (pre-R1).
 * Implementation phases must not reopen these without Owner change.
 */
export const MEMBER_ADMIN_OPEN_DECISIONS = {
  "OD-01": { decision: "KEEP_POINTS_TRUST", summaryKo: "포인트/신뢰 탭 유지" },
  "OD-02": { decision: "VERIFY_FILTER_BINARY", summaryKo: "인증 필터는 인증 완료/미완료" },
  "OD-03": { decision: "SUPER_ADMIN_BADGE_UNDER_ADMIN", summaryKo: "최고관리자는 관리자 축 안 badge" },
  "OD-04": { decision: "STORE_UI_R5_ONE_TO_ONE", summaryKo: "매장 연결/변경 UI는 R5 1계정=1매장" },
  "OD-05": { decision: "TEST_CLEANUP_OWNER_GATE", summaryKo: "테스트 회원 정리는 별도 유지보수 권한" },
  "OD-06": { decision: "SUPPORT_PARAM_AFTER_R8_AUDIT", summaryKo: "쪽지는 R8 Support SSOT 감사 후 parameter" },
  "OD-07": { decision: "PURGE_TYPED_MEMBER_ID", summaryKo: "영구 삭제는 @회원 ID 직접 입력 확인" },
  "OD-08": { decision: "WARN_HISTORY_KEEP_ACTIVE", summaryKo: "경고는 ACTIVE 유지 + 운영/제재 이력" },
} as const;

export type MemberAdminOpenDecisionId = keyof typeof MEMBER_ADMIN_OPEN_DECISIONS;
