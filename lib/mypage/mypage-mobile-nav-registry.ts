/**
 * 모바일 내정보 계층 네비 — `/mypage/section/[section]/[item]`
 * (데이터 도메인과 맞추기 쉽도록 섹션·항목 id 를 안정적으로 유지)
 */

/** 프로필 편집 폼 — 내 계정 → 프로필 하위 */
export const MYPAGE_PROFILE_EDIT_HREF = "/mypage/section/account/profile/edit" as const;

export function isProfileEditPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === MYPAGE_PROFILE_EDIT_HREF) return true;
  return pathname === "/my/edit" || pathname === "/mypage/edit";
}

export const MYPAGE_MOBILE_SECTION_IDS = [
  "account",
  "trade",
  "community",
  "store",
  "messenger",
  "settings",
] as const;

export type MyPageMobileSectionId = (typeof MYPAGE_MOBILE_SECTION_IDS)[number];

export type MyPageMobileItemDef = {
  id: string;
  label: string;
  description?: string;
};

export type MyPageMobileSectionDef = {
  id: MyPageMobileSectionId;
  label: string;
  items: MyPageMobileItemDef[];
};

export const MYPAGE_MOBILE_NAV: MyPageMobileSectionDef[] = [
  {
    id: "account",
    label: "내 계정",
    items: [
      { id: "profile", label: "프로필", description: "사진, 닉네임, 소개를 수정합니다." },
      { id: "account-info", label: "계정 기본정보", description: "계정 상세와 인증 상태를 확인합니다." },
      { id: "favorite-users", label: "친구 / 관심 사용자", description: "거래·커뮤니티·메신저 공통 목록" },
      { id: "blocked-users", label: "차단 사용자", description: "차단된 사용자 목록을 관리합니다." },
      { id: "hidden-users", label: "숨긴 사용자", description: "숨김 처리한 사용자 목록" },
    ],
  },
  {
    id: "trade",
    label: "거래",
    items: [
      { id: "sales", label: "판매 내역", description: "판매중·예약중·완료 내역" },
      { id: "purchases", label: "구매 내역", description: "구매 진행 상태와 후기" },
      { id: "favorites", label: "찜한 상품", description: "관심 상품 모아보기" },
      { id: "recent", label: "최근 본 상품", description: "최근 확인한 상품" },
      { id: "trade-chat", label: "거래 채팅", description: "거래 전용 채팅 목록" },
      { id: "reviews", label: "거래 후기", description: "받은/작성/대기 후기" },
    ],
  },
  {
    id: "community",
    label: "커뮤니티",
    items: [
      { id: "posts", label: "내가 쓴 글", description: "작성한 글 모아보기" },
      { id: "comments", label: "내가 쓴 댓글", description: "작성한 댓글 모아보기" },
      { id: "favorite-posts", label: "찜한 게시물", description: "관심 게시물 모아보기" },
      { id: "community-friends", label: "커뮤니티 친구 / 관심 사용자", description: "자주 보는 사용자 목록" },
      { id: "reports", label: "신고 내역", description: "신고 접수/처리 현황" },
    ],
  },
  {
    id: "store",
    label: "매장 / 주문",
    items: [
      { id: "orders", label: "주문 내역", description: "주문 상태·리뷰·문의" },
      { id: "order-chat", label: "주문 채팅", description: "주문 채팅은 주문 상세와 함께" },
      { id: "payment", label: "결제 정보", description: "포인트·결제 확인" },
      { id: "address", label: "배송지 / 주소", description: "거래·생활·배달 주소 통합" },
      { id: "manage", label: "내 상점 등록 / 관리", description: "매장 등록 및 운영" },
      { id: "rider", label: "라이더 관련", description: "라이더 전용 흐름 안내" },
    ],
  },
  {
    id: "messenger",
    label: "메신저",
    items: [
      { id: "dm", label: "1:1 채팅", description: "개인 메시지" },
      { id: "groups", label: "그룹 채팅", description: "그룹 대화" },
      { id: "friends", label: "친구 관리", description: "친구/관심 사용자 관리" },
      { id: "chat-alerts", label: "채팅 알림 / 설정", description: "알림과 채팅 설정" },
    ],
  },
  {
    id: "settings",
    label: "설정",
    items: [
      { id: "address", label: "주소 관리", description: "주소 통합 관리" },
      { id: "device-permissions", label: "기기 권한", description: "위치·마이크·소리" },
      { id: "language", label: "언어 설정", description: "서비스 언어 변경" },
      { id: "country", label: "국가 설정", description: "국가 변경" },
      { id: "region", label: "지역 설정", description: "동네/지역 변경" },
      { id: "manner", label: "배터리 매너", description: "신뢰/매너 지표" },
      { id: "chat-settings", label: "채팅 설정", description: "채팅 공통 설정" },
      { id: "notifications", label: "알림 설정", description: "서비스 알림" },
      { id: "personalization", label: "맞춤 설정", description: "개인화 옵션" },
      { id: "video-autoplay", label: "동영상 자동 재생", description: "자동 재생 옵션" },
      { id: "cache", label: "캐시 삭제", description: "로컬 캐시 초기화" },
      { id: "notices", label: "공지사항", description: "운영 공지" },
      { id: "events", label: "이벤트", description: "혜택/이벤트" },
      { id: "support", label: "고객센터", description: "도움말/문의" },
      { id: "terms", label: "이용약관", description: "약관 및 정책" },
      { id: "version", label: "버전 정보", description: "앱 버전 확인" },
      { id: "leave", label: "탈퇴하기", description: "회원 탈퇴" },
    ],
  },
];

const SECTION_MAP = new Map(MYPAGE_MOBILE_NAV.map((s) => [s.id, s]));

export function findMypageMobileSection(
  raw: string | null | undefined,
): MyPageMobileSectionDef | undefined {
  if (!raw) return undefined;
  return SECTION_MAP.get(raw as MyPageMobileSectionId);
}

export function findMypageMobileItem(
  sectionId: string | null | undefined,
  itemId: string | null | undefined,
): MyPageMobileItemDef | undefined {
  const sec = findMypageMobileSection(sectionId);
  if (!sec || !itemId) return undefined;
  return sec.items.find((i) => i.id === itemId);
}

export function buildMypageSectionHref(sectionId: string): string {
  return `/mypage/section/${encodeURIComponent(sectionId)}`;
}

export function buildMypageItemHref(sectionId: string, itemId: string): string {
  return `/mypage/section/${encodeURIComponent(sectionId)}/${encodeURIComponent(itemId)}`;
}

/** 예전 `?tab=&section=` 쿼리 → 신규 item slug */
export function mapLegacyMyPageItemSlug(tab: string, section: string): string {
  const key = `${tab}:${section}`;
  const map: Record<string, string> = {
    "account:basic": "account-info",
    "community:favorites": "favorite-posts",
    "community:users": "community-friends",
    "trade:chat": "trade-chat",
    "messenger:alerts": "chat-alerts",
    /** 예전 설정 탭(그룹) → 신규 항목 id */
    "settings:region-language": "language",
    "settings:device-permissions": "device-permissions",
    "settings:service": "chat-settings",
    "settings:system": "version",
    "settings:support": "notices",
  };
  return map[key] ?? section;
}
