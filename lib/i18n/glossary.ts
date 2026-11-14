/**
 * DIBAY 한국어·영어 용어집 — 단일 정의 (`docs/i18n-ssot.md` §4-2).
 * `check:i18n-quality` 의 `glossary` 규칙이 이 목록으로 검사한다. 표(문서)와 함께 바꾼다.
 *
 * - `koMatch`: 한국어 값이 이 패턴에 맞는 키만 검사한다.
 * - `koExclude`: 같은 단어라도 다른 뜻인 문맥(예: 모임 탈퇴 = Leave)을 뺀다.
 * - `forbiddenEn`: 영어 값에 있으면 위반. 정본 영어는 `en`.
 * - `requiredEn`: 있으면 「`forbiddenEn` 이 있고 **`requiredEn` 이 없을 때만**」 위반 — 한국어에 다른 단어가 함께 있을 때(예: 「지역·동네」 = Region and neighborhood) 오판을 막는다.
 * - `forbiddenKoWithEn`: 한국어 단어 자체가 금지인 경우(영어 값이 이 패턴이면 한국어를 바꿔야 함).
 */
export type GlossaryEntry = {
  id: string;
  ko: string;
  en: string;
  koMatch: RegExp;
  koExclude?: RegExp;
  forbiddenEn: RegExp;
  requiredEn?: RegExp;
  note?: string;
};

export const DIBAY_GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: "myinfo",
    ko: "내정보",
    en: "My page (하단 탭·제목은 브랜드 MY — 아래 brand-my)",
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
    forbiddenEn: /\b(area|region|local|town|district|barangay)s?\b/i,
    requiredEn: /\bneighbou?rhoods?\b/i,
    note: "「지역·동네」처럼 지역이 함께 있으면 Region 을 써도 되지만 Neighborhood 는 있어야 한다",
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
    forbiddenEn: /\binterested\s+neighbou?rs?\b|\bneighbou?rs?\b/i,
    requiredEn: /follow/i,
    note: "「관심이웃」을 Neighbor(s) 로만 옮기지 않는다 — Follow 가 있어야 한다",
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
  {
    id: "brand-home",
    ko: "HOME",
    en: "HOME",
    koMatch: /\bHOME\b/,
    forbiddenEn: /[\s\S]/,
    requiredEn: /\bHOME\b/,
    note: "서비스 브랜드(lib/brand/dibay-service-brand.ts) — 한국어에 HOME 가 있으면 영어도 같은 대문자 이름(번역 금지)",
  },
  {
    id: "brand-lounge",
    ko: "LOUNGE",
    en: "LOUNGE",
    koMatch: /\bLOUNGE\b/,
    forbiddenEn: /[\s\S]/,
    requiredEn: /\bLOUNGE\b/,
    note: "서비스 브랜드(lib/brand/dibay-service-brand.ts) — 한국어에 LOUNGE 가 있으면 영어도 같은 대문자 이름(번역 금지)",
  },
  {
    id: "brand-feed",
    ko: "FEED",
    en: "FEED",
    koMatch: /\bFEED\b/,
    forbiddenEn: /[\s\S]/,
    requiredEn: /\bFEED\b/,
    note: "서비스 브랜드(lib/brand/dibay-service-brand.ts) — 한국어에 FEED 가 있으면 영어도 같은 대문자 이름(번역 금지)",
  },
  {
    id: "brand-market",
    ko: "MARKET",
    en: "MARKET",
    koMatch: /\bMARKET\b/,
    forbiddenEn: /[\s\S]/,
    requiredEn: /\bMARKET\b/,
    note: "서비스 브랜드(lib/brand/dibay-service-brand.ts) — 한국어에 MARKET 가 있으면 영어도 같은 대문자 이름(번역 금지)",
  },
  {
    id: "brand-crew",
    ko: "CREW",
    en: "CREW",
    koMatch: /\bCREW\b/,
    forbiddenEn: /[\s\S]/,
    requiredEn: /\bCREW\b/,
    note: "서비스 브랜드(lib/brand/dibay-service-brand.ts) — 한국어에 CREW 가 있으면 영어도 같은 대문자 이름(번역 금지)",
  },
  {
    id: "brand-dipick",
    ko: "DIPICK",
    en: "DIPICK",
    koMatch: /\bDIPICK\b/,
    forbiddenEn: /[\s\S]/,
    requiredEn: /\bDIPICK\b/,
    note: "서비스 브랜드(lib/brand/dibay-service-brand.ts) — 한국어에 DIPICK 가 있으면 영어도 같은 대문자 이름(번역 금지)",
  },
  {
    id: "brand-letaring",
    ko: "telRING",
    en: "telRING",
    koMatch: /\btelRING\b/,
    forbiddenEn: /[\s\S]/,
    requiredEn: /\btelRING\b/,
    note: "서비스 브랜드(lib/brand/dibay-service-brand.ts) — 메시지 서비스 표시명 telRING(Owner 2026-11-14), ko·en 같은 이름(번역 금지)",
  },
  {
    id: "brand-my",
    ko: "MY",
    en: "MY",
    koMatch: /\bMY\b/,
    forbiddenEn: /[\s\S]/,
    requiredEn: /\bMY\b/,
    note: "서비스 브랜드(lib/brand/dibay-service-brand.ts) — 한국어에 MY 가 있으면 영어도 같은 대문자 이름(번역 금지)",
  },
];
