/**
 * 「캐시 삭제」 키 레지스트리 — 단일 기준 (최종 설계 S17).
 *
 * 이 파일에 **등록된 키만** 지운다. 등록되지 않은 키는 지우지 않는다(정규식·전체 삭제 금지).
 * 지우는 것 = 다시 받을 수 있는 목록·화면 임시 데이터(서버 재조회로 복구됨) + 브라우저 Cache Storage.
 *
 * 반드시 보존(등록 금지):
 * - 로그인·세션(Supabase `sb-*-auth-token`, `supabase-profile-cache`, `profile-setup-defer`, `samarket:post_logout_guard` 등)
 * - 기기 권한 안내 상태(`dibay.permission.session.*`)
 * - 작성 중 초안: 거래 글쓰기(`samarket:trade-write-form*` — AGENTS「거래 글쓰기 임시저장·이어쓰기」),
 *   매장 신청(`samarket:business-apply-form-draft:v1`), 거래·구인 약속 장소 스테이징
 * - 주소 흐름 컨텍스트(`member-address-caller-context`, `samarket:address-mgmt-exit`, `dibay.address.platform.v2.draft`,
 *   주소 편집 초안 `dibay.address.edit.draft.v3:*`)
 * - 언어·동의·기기 설정
 */

/** localStorage — 정확히 이 키만 삭제 */
export const CLEARABLE_LOCAL_STORAGE_KEYS: readonly string[] = [];

/** localStorage — 구버전 임시 캐시 접두(현행 코드는 쓰지 않음, 남은 값 정리용) */
export const CLEARABLE_LOCAL_STORAGE_PREFIXES: readonly string[] = ["cache_", "temp_"];

/** sessionStorage — 정확히 이 키만 삭제 */
export const CLEARABLE_SESSION_STORAGE_KEYS: readonly string[] = [
  /** 내 주소 목록 캐시(서버 재조회) — `address-list-client-cache.ts` 는 sessionStorage 사용 */
  "samarket:me-addresses-list-cache:v1",
  "samarket:me-addresses-list-cache:updated-at:v1",
];

/** sessionStorage — 이 접두로 시작하는 키만 삭제(목록·요약·스크롤 스냅샷, 서버 재조회로 복구) */
export const CLEARABLE_SESSION_STORAGE_PREFIXES: readonly string[] = [
  /** 내정보 홈 요약 스냅샷 */
  "dibay:mypage-summary:",
  /** 내정보 홈·하위 목록 스크롤 복원 */
  "dibay:mypage-hub-scroll",
  "dibay:mypage-list:",
  /** 배달·매장 목록 시드·피드 캐시 */
  "samarket:stores-home-feed:v2:",
  "dibay:store-detail-list-seed:",
  "dibay:store-commerce-checkout-seed:",
  "samarket:soddseed:v1:",
  "dibay:delivery-list-scroll:",
  /** 거래 마켓 목록 스크롤 복원 */
  "samarket:trade-market-list-scroll:v1:",
];

export function isClearableLocalStorageKey(key: string): boolean {
  if (CLEARABLE_LOCAL_STORAGE_KEYS.includes(key)) return true;
  return CLEARABLE_LOCAL_STORAGE_PREFIXES.some((p) => key.startsWith(p));
}

export function isClearableSessionStorageKey(key: string): boolean {
  if (CLEARABLE_SESSION_STORAGE_KEYS.includes(key)) return true;
  return CLEARABLE_SESSION_STORAGE_PREFIXES.some((p) => key.startsWith(p));
}
