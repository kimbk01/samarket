/**
 * Member Management FULL SSOT — machine-readable registry.
 * Authority: docs/member-admin/DIBAY_MEMBER_MANAGEMENT_FULL_SSOT.md
 * Owner FINAL directive supersedes deferred-R7 / REGRESSED-as-OK catalogs.
 *
 * Rows must not be deleted without Owner approval. Status may advance with evidence.
 */

export const MEMBER_ADMIN_FULL_SSOT_AUTHORITY = "OWNER_FULL_RESTORATION_2026_10" as const;

export type MemberAdminFullSsotKind = "PRESERVE" | "RESTORE" | "NEW" | "OWNER_GATE" | "DEFECT_FIX";

export type MemberAdminFullSsotEvidence =
  | "NOT_STARTED"
  | "L1_CODE"
  | "L2_CONTRACT"
  | "L3_UI_WIRED"
  | "L4_RUNTIME"
  | "L5_REGRESSION"
  | "PASS"
  | "BLOCKED"
  | "NOT_PROVEN";

export type MemberAdminFullSsotRow = {
  id: string;
  nameKo: string;
  kind: MemberAdminFullSsotKind;
  uiEntry: string;
  api: string;
  evidence: MemberAdminFullSsotEvidence;
};

export const MEMBER_ADMIN_FULL_SSOT_CATALOG = [
  { id: "MM-LIST-VIEW", nameKo: "회원 목록 조회", kind: "PRESERVE", uiEntry: "S01", api: "GET /api/admin/users", evidence: "L4_RUNTIME" },
  { id: "MM-LIST-SEARCH", nameKo: "검색", kind: "PRESERVE", uiEntry: "S01", api: "GET /api/admin/users?search=", evidence: "L4_RUNTIME" },
  { id: "MM-LIST-FILTER", nameKo: "다중 필터", kind: "PRESERVE", uiEntry: "S01", api: "GET status/verify/store/privilege/origin", evidence: "L4_RUNTIME" },
  { id: "MM-LIST-JOINED", nameKo: "가입 기간 필터", kind: "NEW", uiEntry: "S01", api: "GET joinedFrom/joinedTo", evidence: "L4_RUNTIME" },
  { id: "MM-LIST-SORT", nameKo: "목록 정렬", kind: "NEW", uiEntry: "S01", api: "GET sort", evidence: "L4_RUNTIME" },
  { id: "MM-PURGE-PREVIEW", nameKo: "영구삭제 영향 미리보기", kind: "NEW", uiEntry: "bulk/detail", api: "GET …/purge-preview", evidence: "L4_RUNTIME" },
  { id: "MM-LIST-PAGE", nameKo: "페이지 이동", kind: "PRESERVE", uiEntry: "S01", api: "page/pageSize", evidence: "L4_RUNTIME" },
  { id: "MM-LIST-PROVIDER-ICON", nameKo: "가입 방식 아이콘", kind: "RESTORE", uiEntry: "S01/S02", api: "authProvider display", evidence: "L4_RUNTIME" },
  { id: "MM-LIST-SELECT", nameKo: "체크박스 다중 선택", kind: "NEW", uiEntry: "S01", api: "client selection scope=page", evidence: "L4_RUNTIME" },
  { id: "MM-BULK-MODERATION", nameKo: "일괄 정지·차단·해제", kind: "NEW", uiEntry: "S01 bulk", api: "POST …/moderation (per id)", evidence: "L4_RUNTIME" },
  { id: "MM-BULK-DELETE", nameKo: "일괄 탈퇴·영구삭제", kind: "NEW", uiEntry: "S01 bulk", api: "POST …/delete (per id)", evidence: "L4_RUNTIME" },
  { id: "MM-DETAIL-EDIT", nameKo: "프로필 수정", kind: "PRESERVE", uiEntry: "S13", api: "PATCH /api/admin/users/:id", evidence: "L4_RUNTIME" },
  { id: "MM-DETAIL-PASSWORD", nameKo: "비밀번호 관리", kind: "PRESERVE", uiEntry: "S16", api: "PATCH …/auth", evidence: "L4_RUNTIME" },
  { id: "MM-DETAIL-PRIV", nameKo: "권한 부여·해제", kind: "PRESERVE", uiEntry: "S17", api: "POST …/privilege", evidence: "L4_RUNTIME" },
  { id: "MM-DETAIL-VERIFY", nameKo: "전화 인증 4상태", kind: "RESTORE", uiEntry: "S15", api: "PATCH …/phone-verification", evidence: "L4_RUNTIME" },
  { id: "MM-DETAIL-MODERATION", nameKo: "상세 제재 실행", kind: "RESTORE", uiEntry: "DangerZone", api: "POST …/moderation", evidence: "L4_RUNTIME" },
  { id: "MM-DETAIL-WITHDRAW-PURGE", nameKo: "상세 탈퇴·영구삭제", kind: "RESTORE", uiEntry: "DangerZone", api: "POST …/delete", evidence: "L4_RUNTIME" },
  { id: "MM-DETAIL-NOTE", nameKo: "쪽지 전송", kind: "RESTORE", uiEntry: "Ops", api: "GET /admin/support?search=:userId (Support SSOT; legacy POST /api/admin/member-notes = 410)", evidence: "L4_RUNTIME" },
  { id: "MM-OTP-MEMBER", nameKo: "회원 OTP", kind: "PRESERVE", uiEntry: "PhoneVerificationBox", api: "phone-otp-service", evidence: "NOT_PROVEN" },
  { id: "MM-VERIFY-FREEZE", nameKo: "인증 후 화면 갱신", kind: "DEFECT_FIX", uiEntry: "AdminUserDetailPage", api: "soft refresh", evidence: "L4_RUNTIME" },
  { id: "MM-ACCESS-POLICY", nameKo: "미인증 서비스 접근", kind: "OWNER_GATE", uiEntry: "—", api: "member-access", evidence: "L2_CONTRACT" },
  { id: "MM-HARD-LOCK", nameKo: "회귀 HARD LOCK", kind: "NEW", uiEntry: "CI", api: "verify:member-admin-full-ssot", evidence: "L2_CONTRACT" },
] as const satisfies readonly MemberAdminFullSsotRow[];

export const MEMBER_ADMIN_FULL_SSOT_IDS = MEMBER_ADMIN_FULL_SSOT_CATALOG.map((r) => r.id);

export function getMemberAdminFullSsot(id: string): MemberAdminFullSsotRow | undefined {
  return MEMBER_ADMIN_FULL_SSOT_CATALOG.find((r) => r.id === id);
}
