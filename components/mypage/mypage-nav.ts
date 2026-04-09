import type { MyPageTabId } from "./types";

export type MyPageSectionItem = {
  id: string;
  label: string;
  /** `/mypage` 상단 헤더 보조 문구(선택) */
  description?: string;
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
      {
        id: "home",
        label: "내정보 홈",
        description: "내 계정 상태와 주요 활동을 한눈에 확인합니다.",
      },
      {
        id: "profile",
        label: "프로필",
        description: "닉네임, 프로필 사진, 기본 소개와 지역 정보를 확인하고 수정합니다.",
      },
      {
        id: "basic",
        label: "계정 기본정보",
        description: "계정 상세, 연락처 인증, 로그아웃과 탈퇴 같은 계정 단위 작업을 관리합니다.",
      },
      {
        id: "favorite-users",
        label: "친구 / 관심 사용자",
        description: "모아보는 사용자를 관리합니다. 거래, 커뮤니티, 메신저에서 공통으로 참조됩니다.",
      },
      {
        id: "blocked-users",
        label: "차단 사용자",
        description: "차단된 사용자는 거래, 커뮤니티, 메신저에서 공통으로 제한됩니다.",
      },
      {
        id: "hidden-users",
        label: "숨긴 사용자",
        description: "숨김 처리한 사용자는 피드와 일부 목록 노출에서 제외됩니다.",
      },
    ],
  },
  {
    id: "trade",
    label: "거래",
    sections: [
      {
        id: "sales",
        label: "판매 내역",
        description: "판매중, 예약중, 완료된 거래를 한 화면에서 관리합니다.",
      },
      {
        id: "purchases",
        label: "구매 내역",
        description: "구매 진행 상태와 구매 후 후기를 확인합니다.",
      },
      {
        id: "favorites",
        label: "찜한 상품",
        description: "관심 상품과 다시 보고 싶은 거래 글을 모아서 관리합니다.",
      },
      {
        id: "recent",
        label: "최근 본 상품",
        description: "최근에 확인한 상품을 다시 이어서 볼 수 있습니다.",
      },
      {
        id: "chat",
        label: "거래 채팅",
        description: "거래 전용 채팅만 분리해서 확인합니다.",
      },
      {
        id: "reviews",
        label: "거래 후기",
        description: "받은 후기, 작성한 후기, 후기 대기 상태를 관리합니다.",
      },
    ],
  },
  {
    id: "community",
    label: "커뮤니티",
    sections: [
      {
        id: "posts",
        label: "내가 쓴 글",
        description: "내가 남긴 커뮤니티 글을 최근순으로 확인합니다.",
      },
      {
        id: "comments",
        label: "내가 쓴 댓글",
        description: "내가 남긴 커뮤니티 댓글을 최근순으로 확인합니다.",
      },
      {
        id: "favorites",
        label: "찜한 게시물",
        description: "관심 표시한 커뮤니티 게시물을 최근순으로 정리합니다.",
      },
      {
        id: "users",
        label: "커뮤니티 친구 / 관심 사용자",
        description: "커뮤니티에서 자주 보는 사용자는 전체 사용자 관리와 같은 단일 데이터 소스를 사용합니다.",
      },
      {
        id: "reports",
        label: "신고 내역",
        description: "커뮤니티와 메신저 신고 접수 내역을 한곳에서 확인합니다.",
      },
    ],
  },
  {
    id: "store",
    label: "매장 / 주문",
    sections: [
      {
        id: "orders",
        label: "주문 내역",
        description: "내 주문 상태와 주문 채팅, 리뷰 작성 흐름을 한곳에서 확인합니다.",
      },
      {
        id: "order-chat",
        label: "주문 채팅",
        description: "주문 채팅은 주문 상세와 함께 관리됩니다. 주문 목록에서 바로 이어집니다.",
      },
      {
        id: "payment",
        label: "결제 정보",
        description: "포인트, 결제된 주문 확인, 충전 신청 흐름을 이 영역에서 함께 관리합니다.",
      },
      {
        id: "address",
        label: "배송지 / 주소",
        description: "거래, 생활, 배달 주소를 주소 관리 한 곳에서 통합 관리합니다.",
      },
      {
        id: "member",
        label: "매장회원 진입",
        description: "일반 사용자 주문 관리와 사장님 운영 진입을 구분합니다.",
      },
      {
        id: "manage",
        label: "내 상점 등록 / 관리",
        description: "매장 등록, 운영, 주문 처리, 상품과 문의 관리를 한 축으로 모읍니다.",
      },
      {
        id: "rider",
        label: "라이더 진입",
        description: "라이더 전용 권한과 화면은 별도 운영 흐름이 필요해 현재는 기존 배송·주문 흐름을 유지합니다.",
      },
    ],
  },
  {
    id: "messenger",
    label: "메신저",
    sections: [
      {
        id: "dm",
        label: "1:1 채팅",
        description: "메신저 1:1 채팅과 거래·주문 채팅을 구분해서 관리합니다.",
      },
      {
        id: "groups",
        label: "그룹 채팅",
        description: "공개 그룹과 비공개 그룹은 메신저 축에서 유지하되, 내정보 안에서 빠르게 진입합니다.",
      },
      {
        id: "chat-settings",
        label: "채팅 설정",
        description: "거래 채팅, 주문 채팅, 메신저가 공통으로 참조하는 채팅 설정입니다.",
      },
      {
        id: "alerts",
        label: "알림 설정",
        description: "메신저 알림과 전체 서비스 알림을 함께 관리합니다.",
      },
    ],
  },
  {
    id: "settings",
    label: "설정",
    sections: [
      {
        id: "address",
        label: "주소 관리",
        description: "생활주소, 거래주소, 배달주소를 주소 관리 한 곳에서 분리해 관리합니다.",
      },
      {
        id: "service",
        label: "서비스",
        description: "채팅 설정, 알림, 동영상 자동 재생, 맞춤 설정을 관리합니다.",
      },
      {
        id: "users",
        label: "사용자 관리",
        description: "친구·관심 사용자, 차단, 숨김을 공통 사용자 관리로 묶습니다.",
      },
      {
        id: "region-language",
        label: "지역 / 언어 / 국가",
        description: "서비스 전체 공통 값으로 지역, 언어, 국가를 한곳에서 관리합니다.",
      },
      {
        id: "system",
        label: "시스템",
        description: "캐시 삭제, 버전 정보, 로그아웃, 탈퇴 같은 시스템 단위 작업을 모읍니다.",
      },
      {
        id: "support",
        label: "공지 / 고객센터 / 약관",
        description: "공지사항과 운영 안내, 도움말 영역을 설정 하단 보조 영역으로 분리합니다.",
      },
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

/** 모바일에서 전체 메뉴 목록만 표시할 때 `1` */
export const MYPAGE_MOBILE_NAV_QUERY = "nav";

export function buildMyPageHref(tab: MyPageTabId, section?: string): string {
  const normalizedSection = normalizeMyPageSection(tab, section);
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (normalizedSection) {
    params.set("section", normalizedSection);
  }
  return `/mypage?${params.toString()}`;
}

/** 모바일: 메뉴 선택 화면(목록만). 본문만 보려면 이 파라미터를 붙이지 않음. */
export function buildMyPageMobileMenuHref(
  tab: MyPageTabId,
  section?: string,
): string {
  const base = buildMyPageHref(tab, section);
  const u = new URL(base, "https://local.local");
  u.searchParams.set(MYPAGE_MOBILE_NAV_QUERY, "1");
  return `${u.pathname}${u.search}`;
}

/** 내정보 콘솔 상단 헤더(제목·부제) — 선택된 하위 메뉴 기준 */
export function resolveMyPageConsoleHeader(
  tab: MyPageTabId,
  section: string,
): { title: string; subtitle?: string } {
  const tabNav = getMyPageTabNav(tab);
  const sec =
    tabNav.sections.find((item) => item.id === section) ?? tabNav.sections[0];
  if (!sec) {
    return { title: tabNav.label };
  }
  return {
    title: sec.label,
    subtitle: sec.description,
  };
}
