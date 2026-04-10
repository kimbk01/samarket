/**
 * 매장 주소 입력 — 스토어 장바구니 주소 모달(`StoreCommerceCartPageClient`)과 동일한 구분·길이.
 */
export const STORE_ADDRESS_STREET_MAX = 300;
export const STORE_ADDRESS_DETAIL_MAX = 500;

/** 매장 신청 등 「위치」 블록 안내 */
export const STORE_LOCATION_SECTION_HINT_APPLY =
  "거래 글 등록과 동일한 지역·동네 목록에서 선택합니다. PhilPost ZIP으로 지역을 맞출 수 있습니다.";
/** 매장 기본 정보 등 */
export const STORE_LOCATION_SECTION_HINT_STORE_PUBLIC =
  "공개 매장 페이지 상단 위치·주소에 반영됩니다. PhilPost ZIP으로 지역을 맞출 수 있습니다.";
/** 로컬 mock 프로필 편집 등 */
export const STORE_LOCATION_SECTION_HINT_MOCK_EDIT =
  "실제 매장은 기본 정보 화면과 동일하게 지역·동네·ZIP·지번·동·호를 입력합니다.";
/** `/mypage/section/account/profile/edit` 프로필 수정 — 지도 위치(레거시 ZIP·드롭다운 없음) */
export const PROFILE_MAP_LOCATION_SECTION_TITLE = "위치";
export const STORE_LOCATION_SECTION_HINT_PROFILE_EDIT =
  "Google 지도에서 핀으로 위치를 고르면 역지오코딩 주소·우편번호가 함께 저장됩니다. 생활·거래·배달 기본지는 주소록에서 따로 지정합니다.";
/** 생활·거래·배달 주소록 시트 */
export const STORE_ADDRESS_BOOK_STREET_BLOCK_INTRO =
  "매장·프로필과 동일: 지번·건물·번지와 동·호·출입을 한 행에 나누어 입력합니다. (영문 상세는 아래에서 이어서 입력 가능)";
/** 관리자 회원 추가 — 거래 지역 아래 */
export const STORE_LOCATION_SECTION_HINT_ADMIN_CREATE_MEMBER =
  "지역·동네·ZIP 후 지번·건물·번지 / 동·호·출입을 입력하면 연락처 주소에 반영됩니다.";

/** 왼쪽 칸 — 지번·건물명·번지 등(지역·동네는 위에서 선택) */
export const STORE_ADDRESS_STREET_LABEL = "지번·건물명·번지";
export const STORE_ADDRESS_STREET_HINT =
  "지역·동네는 위에서 고르고, 목록에 없을 때는 3자 이상 입력하세요.";

/** 오른쪽 칸 — 동·호·출입 등 */
export const STORE_ADDRESS_DETAIL_LABEL = "동·호·출입 등";

export const STORE_ADDRESS_STREET_PLACEHOLDER =
  "예: Barangay · 건물명 · 번지";
