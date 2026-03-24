/**
 * 관리자 보안·백도어 점검 항목 (프로그래밍 참조용)
 * 상세 설명: web/docs/admin-security-ops.md
 */

export const ADMIN_SECURITY_CHECK_KEYS = [
  "auth_guard", // AdminGuard 실인증 연동
  "admin_email_env", // 관리자 이메일 env 기반 (하드코딩 없음)
  "no_bypass_flag", // 상시 통과 bypass 없음
  "no_debug_routes", // /admin 하위 디버그 공개 라우트 없음
  "mock_not_for_auth", // Mock ADMIN_ID는 인증에 미사용
  "secrets_not_in_code", // 비밀키 코드 하드코딩 없음
] as const;

export type AdminSecurityCheckKey = (typeof ADMIN_SECURITY_CHECK_KEYS)[number];
