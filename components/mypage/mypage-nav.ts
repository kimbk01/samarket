import type { MyPageTabId } from "./types";

export type MyPageSectionItem = {
  id: string;
  label: string;
};

export type MyPageTabNav = {
  id: MyPageTabId;
  label: string;
  sections: MyPageSectionItem[];
};

export const MYPAGE_NAV: MyPageTabNav[] = [
  {
    id: "account",
    label: "내 계정",
    sections: [
      { id: "home", label: "내정보 홈" },
      { id: "profile", label: "프로필" },
      { id: "basic", label: "계정 기본정보" },
      { id: "favorite-users", label: "친구 / 관심 사용자" },
      { id: "blocked-users", label: "차단 사용자" },
      { id: "hidden-users", label: "숨긴 사용자" },
    ],
  },
  {
    id: "trade",
    label: "거래",
    sections: [
      { id: "sales", label: "판매 내역" },
      { id: "purchases", label: "구매 내역" },
      { id: "favorites", label: "찜한 상품" },
      { id: "recent", label: "최근 본 상품" },
      { id: "chat", label: "거래 채팅" },
      { id: "reviews", label: "거래 후기" },
    ],
  },
  {
    id: "community",
    label: "커뮤니티",
    sections: [
      { id: "posts", label: "내가 쓴 글" },
      { id: "comments", label: "내가 쓴 댓글" },
      { id: "favorites", label: "찜한 게시물" },
      { id: "users", label: "커뮤니티 친구 / 관심 사용자" },
      { id: "reports", label: "신고 내역" },
    ],
  },
  {
    id: "store",
    label: "매장 / 주문",
    sections: [
      { id: "orders", label: "주문 내역" },
      { id: "order-chat", label: "주문 채팅" },
      { id: "payment", label: "결제 정보" },
      { id: "address", label: "배송지 / 주소" },
      { id: "member", label: "매장회원 진입" },
      { id: "manage", label: "내 상점 등록 / 관리" },
      { id: "rider", label: "라이더 진입" },
    ],
  },
  {
    id: "messenger",
    label: "메신저",
    sections: [
      { id: "dm", label: "1:1 채팅" },
      { id: "groups", label: "그룹 채팅" },
      { id: "chat-settings", label: "채팅 설정" },
      { id: "alerts", label: "알림 설정" },
    ],
  },
  {
    id: "settings",
    label: "설정",
    sections: [
      { id: "address", label: "주소 관리" },
      { id: "service", label: "서비스" },
      { id: "users", label: "사용자 관리" },
      { id: "region-language", label: "지역 / 언어 / 국가" },
      { id: "system", label: "시스템" },
      { id: "support", label: "공지 / 고객센터 / 약관" },
    ],
  },
];

export function getDefaultMyPageLocation(): { tab: MyPageTabId; section: string } {
  return { tab: "account", section: "home" };
}

export function getMyPageTabNav(tab: MyPageTabId): MyPageTabNav {
  return MYPAGE_NAV.find((item) => item.id === tab) ?? MYPAGE_NAV[0];
}

export function normalizeMyPageTab(raw: string | null | undefined): MyPageTabId {
  const matched = MYPAGE_NAV.find((item) => item.id === raw);
  return matched?.id ?? getDefaultMyPageLocation().tab;
}

export function normalizeMyPageSection(
  tab: MyPageTabId,
  raw: string | null | undefined
): string {
  const matched = getMyPageTabNav(tab).sections.find((item) => item.id === raw);
  return matched?.id ?? getMyPageTabNav(tab).sections[0]?.id ?? "";
}

export function buildMyPageHref(tab: MyPageTabId, section?: string): string {
  const normalizedSection = normalizeMyPageSection(tab, section);
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (normalizedSection) {
    params.set("section", normalizedSection);
  }
  return `/mypage?${params.toString()}`;
}
