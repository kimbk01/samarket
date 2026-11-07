/**
 * DIBAY 한국어·영어 용어집 — 단일 정의 (`docs/i18n-ssot.md` §4-2).
 * `check:i18n-quality` 의 `glossary` 규칙이 이 목록으로 검사한다. 표(문서)와 함께 바꾼다.
 *
 * - `koMatch`: 한국어 값이 이 패턴에 맞는 키만 검사한다.
 * - `koExclude`: 같은 단어라도 다른 뜻인 문맥(예: 모임 탈퇴 = Leave)을 뺀다.
 * - `forbiddenEn`: 영어 값에 있으면 위반. 정본 영어는 `en`.
 * - `forbiddenKoWithEn`: 한국어 단어 자체가 금지인 경우(영어 값이 이 패턴이면 한국어를 바꿔야 함).
 */
export type GlossaryEntry = {
  id: string;
  ko: string;
  en: string;
  koMatch: RegExp;
  koExclude?: RegExp;
  forbiddenEn: RegExp;
  note?: string;
};

export const DIBAY_GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "myinfo",
    ko: "내정보",
    en: "My page (하단 탭은 My)",
    koMatch: /내정보/,
    forbiddenEn: /\bmy\s*info\b|\bmy\s+profile\b|\bmy\s+account\b|\bmypage\b/i,
  },
  {
    id: "account-deletion",
    ko: "탈퇴(회원·계정)",
    en: "Delete account / account deletion",
    koMatch: /탈퇴/,
    koExclude: /모임|그룹|채팅방|방에서|방을|클럽|meeting/i,
    forbiddenEn: /\bwithdraw(al|n)?\b|\bleav(e|ing)\b/i,
    note: "모임·방 나가기의 Leave 는 별개 용어",
  },
  {
    id: "neighborhood",
    ko: "동네",
    en: "Neighborhood",
    koMatch: /동네/,
    forbiddenEn: /\b(area|region|local|town|district)s?\b/i,
  },
  {
    id: "favorites",
    ko: "관심목록·관심 상품",
    en: "Favorites",
    koMatch: /관심\s?(목록|상품)/,
    forbiddenEn: /\bwish\s?list\b|\bsaved\s+items?\b/i,
  },
  {
    id: "favorite-users",
    ko: "관심 사용자",
    en: "Favorite users",
    koMatch: /관심\s?사용자/,
    forbiddenEn: /\bstarred\b/i,
  },
  {
    id: "following-neighbors",
    ko: "관심이웃",
    en: "Following (neighbors you follow)",
    koMatch: /관심\s?이웃/,
    forbiddenEn: /\binterested\s+neighbou?rs?\b/i,
  },
  {
    id: "gift-certificate",
    ko: "상품권",
    en: "Gift certificate",
    koMatch: /상품권/,
    forbiddenEn: /\bgift\s?cards?\b|\bvouchers?\b/i,
  },
  {
    id: "store",
    ko: "매장",
    en: "Store",
    koMatch: /매장/,
    forbiddenEn: /\bshops?\b|\bmerchants?\b/i,
  },
  {
    id: "owner",
    ko: "사장님",
    en: "Owner",
    koMatch: /사장님/,
    forbiddenEn: /\bboss(es)?\b|\bmerchants?\b/i,
  },
  {
    id: "device-temporary-data",
    ko: "기기 임시 데이터 (한국어 「캐시」 금지 — 매장 화폐 Cash 와 같은 단어)",
    en: "Temporary data",
    koMatch: /캐시/,
    forbiddenEn: /\bcache[ds]?\b/i,
    note: "한국어 「캐시」는 매장 화폐(Cash)만. 기기 데이터는 「임시 데이터」 / Temporary data",
  },
];
