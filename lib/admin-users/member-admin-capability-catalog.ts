/**
 * R0 FINAL Operator Console — Capability Catalog (machine-readable).
 * Authority: `.tmp/admin-member-ssot/DIBAY_MEMBER_CORRECTIVE_R0_FINAL_OPERATOR_CONSOLE_SSOT.md`
 *
 * R1 materializes this fixture so R2–R9 cannot silently delete CAP rows.
 * Phases may only change `currentStatus`, not remove IDs.
 *
 * NOTE: Owner verbal brief said "37 CAP-*"; R0 locked table has 33 CAP-* rows.
 * R0 SSOT table is the HARD LOCK authority (count = 33).
 */

export const MEMBER_ADMIN_CAPABILITY_CATALOG_AUTHORITY = "R0_FINAL_OPERATOR_CONSOLE_SSOT" as const;

export type MemberAdminCapabilityCurrentStatus =
  | "YES"
  | "PARTIAL"
  | "NO"
  | "REGRESSED"
  | "DEAD"
  | "OWNER_GATE"
  | "BURIED";

export type MemberAdminCapabilityTargetPhase =
  | "R2"
  | "R3"
  | "R4"
  | "R5"
  | "R6"
  | "R7"
  | "R8"
  | "R9"
  | "R4_PRESERVE"
  | "R8_PRESERVE"
  | "R9_OD05";

export type MemberAdminCapabilityRow = {
  id: string;
  operatorActionKo: string;
  screen: string;
  ctaKo: string;
  targetPhase: MemberAdminCapabilityTargetPhase;
  /** Implementation readiness — may change per phase; ID must remain. */
  currentStatus: MemberAdminCapabilityCurrentStatus;
};

export const MEMBER_ADMIN_CAPABILITY_CATALOG = [
  { id: "CAP-LIST-VIEW", operatorActionKo: "목록 조회", screen: "S01", ctaKo: "—", targetPhase: "R2", currentStatus: "YES" },
  { id: "CAP-LIST-SEARCH", operatorActionKo: "검색", screen: "S01", ctaKo: "search", targetPhase: "R2", currentStatus: "YES" },
  { id: "CAP-LIST-FILTER-STATUS", operatorActionKo: "계정 상태 필터", screen: "S01", ctaKo: "filter", targetPhase: "R2", currentStatus: "YES" },
  { id: "CAP-LIST-FILTER-VERIFY", operatorActionKo: "인증 필터", screen: "S01", ctaKo: "filter", targetPhase: "R2", currentStatus: "YES" },
  { id: "CAP-LIST-FILTER-STORE", operatorActionKo: "매장 필터", screen: "S01", ctaKo: "filter", targetPhase: "R2", currentStatus: "YES" },
  { id: "CAP-LIST-FILTER-PRIV", operatorActionKo: "관리 권한 필터", screen: "S01", ctaKo: "filter", targetPhase: "R2", currentStatus: "YES" },
  { id: "CAP-LIST-FILTER-ORIGIN", operatorActionKo: "가입 방식 필터", screen: "S01", ctaKo: "filter", targetPhase: "R2", currentStatus: "YES" },
  { id: "CAP-CREATE", operatorActionKo: "회원 등록", screen: "S12", ctaKo: "회원 등록", targetPhase: "R4_PRESERVE", currentStatus: "YES" },
  { id: "CAP-DETAIL-VIEW", operatorActionKo: "상세 조회", screen: "S02", ctaKo: "상세", targetPhase: "R3", currentStatus: "YES" },
  { id: "CAP-PROFILE-EDIT", operatorActionKo: "정보 수정", screen: "S13", ctaKo: "정보 수정", targetPhase: "R4", currentStatus: "YES" },
  { id: "CAP-DIBAY-ID", operatorActionKo: "@회원 ID 변경", screen: "S14", ctaKo: "@회원 ID 변경", targetPhase: "R4", currentStatus: "BURIED" },
  { id: "CAP-VERIFY-VIEW", operatorActionKo: "인증 상태 보기", screen: "S03/S15", ctaKo: "—", targetPhase: "R4", currentStatus: "YES" },
  { id: "CAP-VERIFY-APPROVE", operatorActionKo: "인증 승인", screen: "S15", ctaKo: "인증 승인", targetPhase: "R4", currentStatus: "PARTIAL" },
  { id: "CAP-VERIFY-RESET", operatorActionKo: "인증 해제", screen: "S15", ctaKo: "인증 해제", targetPhase: "R4", currentStatus: "PARTIAL" },
  { id: "CAP-PHONE-CHANGE", operatorActionKo: "전화번호 변경", screen: "S13/S15", ctaKo: "저장", targetPhase: "R4", currentStatus: "YES" },
  { id: "CAP-PASSWORD", operatorActionKo: "임시 비밀번호 설정", screen: "S16", ctaKo: "비밀번호 관리", targetPhase: "R4_PRESERVE", currentStatus: "YES" },
  { id: "CAP-STORE-VIEW", operatorActionKo: "매장 보기", screen: "S04", ctaKo: "매장 상세", targetPhase: "R5", currentStatus: "PARTIAL" },
  { id: "CAP-STORE-REL", operatorActionKo: "매장 관계 관리", screen: "S27", ctaKo: "관계 관리", targetPhase: "R5", currentStatus: "PARTIAL" },
  { id: "CAP-PRIV-VIEW", operatorActionKo: "권한 보기", screen: "S02/S17", ctaKo: "—", targetPhase: "R6", currentStatus: "YES" },
  { id: "CAP-PRIV-PROMOTE", operatorActionKo: "관리자 승격", screen: "S17", ctaKo: "관리자로 지정", targetPhase: "R6", currentStatus: "REGRESSED" },
  { id: "CAP-PRIV-REVOKE", operatorActionKo: "관리 권한 해제", screen: "S17", ctaKo: "권한 해제", targetPhase: "R6", currentStatus: "REGRESSED" },
  { id: "CAP-WARN", operatorActionKo: "경고", screen: "S18", ctaKo: "경고", targetPhase: "R7", currentStatus: "REGRESSED" },
  { id: "CAP-SUSPEND", operatorActionKo: "이용 정지", screen: "S19", ctaKo: "이용 정지", targetPhase: "R7", currentStatus: "REGRESSED" },
  { id: "CAP-UNSUSPEND", operatorActionKo: "정지 해제", screen: "S20", ctaKo: "정지 해제", targetPhase: "R7", currentStatus: "REGRESSED" },
  { id: "CAP-BLOCK", operatorActionKo: "이용 차단", screen: "S21", ctaKo: "이용 차단", targetPhase: "R7", currentStatus: "REGRESSED" },
  { id: "CAP-UNBLOCK", operatorActionKo: "차단 해제", screen: "S22", ctaKo: "차단 해제", targetPhase: "R7", currentStatus: "REGRESSED" },
  { id: "CAP-WITHDRAW", operatorActionKo: "탈퇴 처리", screen: "S23", ctaKo: "탈퇴 처리", targetPhase: "R7", currentStatus: "REGRESSED" },
  { id: "CAP-PURGE", operatorActionKo: "영구 삭제", screen: "S24", ctaKo: "영구 삭제", targetPhase: "R7", currentStatus: "REGRESSED" },
  { id: "CAP-MSG-MESSENGER", operatorActionKo: "메신저 보기", screen: "S08", ctaKo: "메신저 보기", targetPhase: "R8_PRESERVE", currentStatus: "YES" },
  { id: "CAP-MSG-SUPPORT", operatorActionKo: "쪽지/지원 보내기", screen: "S25", ctaKo: "쪽지 보내기", targetPhase: "R8", currentStatus: "DEAD" },
  { id: "CAP-OPS-HISTORY", operatorActionKo: "운영 이력", screen: "S11", ctaKo: "운영 이력", targetPhase: "R9", currentStatus: "YES" },
  { id: "CAP-DEL-REQ", operatorActionKo: "삭제 요청 처리", screen: "S26", ctaKo: "승인/거절/처리", targetPhase: "R9", currentStatus: "REGRESSED" },
  { id: "CAP-TEST-MAINT", operatorActionKo: "테스트 회원 정리", screen: "S28", ctaKo: "maintenance", targetPhase: "R9_OD05", currentStatus: "OWNER_GATE" },
] as const satisfies readonly MemberAdminCapabilityRow[];

export const MEMBER_ADMIN_CAPABILITY_CATALOG_COUNT = MEMBER_ADMIN_CAPABILITY_CATALOG.length;

export const MEMBER_ADMIN_CAPABILITY_IDS = MEMBER_ADMIN_CAPABILITY_CATALOG.map((r) => r.id);

export function getMemberAdminCapability(id: string): MemberAdminCapabilityRow | undefined {
  return MEMBER_ADMIN_CAPABILITY_CATALOG.find((r) => r.id === id);
}

/** True when CURRENT status claims a capability is fully shipped as product. */
export function memberAdminCapabilityClaimsFinal(status: MemberAdminCapabilityCurrentStatus): boolean {
  return status === "YES";
}
