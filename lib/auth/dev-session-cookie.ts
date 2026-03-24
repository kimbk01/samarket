/**
 * /api/test-login 성공 시 설정되는 회원 UUID.
 * - HttpOnly: 기본
 * - `kasama_dev_uid_pub`: 비프로덕션만 — Route Handler `cookies()` 누락·탭 불일치 시 요청 Cookie 헤더로 보강
 */
export const KASAMA_DEV_UID_COOKIE = "kasama_dev_uid";

export const KASAMA_DEV_UID_PUB_COOKIE = "kasama_dev_uid_pub";
