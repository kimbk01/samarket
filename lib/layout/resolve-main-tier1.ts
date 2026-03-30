import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";

function starts(p: string, prefix: string): boolean {
  return p === prefix || p.startsWith(`${prefix}/`);
}

export type ResolvedMainTier1Subpage = {
  showBack: boolean;
  /** true면 좌측 뒤로 숨김(주문 허브 등) */
  hideBack?: boolean;
  backHref: string;
  preferHistoryBack: boolean;
  ariaLabel: string;
  titleText: string;
  subtitle?: string;
  subtitleHref?: string;
  /** false면 `MyHubHeaderActions` 대신 `extras.tier1.rightSlot` 기대 */
  showHubQuickActions: boolean;
};

const DEFAULT: ResolvedMainTier1Subpage = {
  showBack: true,
  backHref: "/home",
  preferHistoryBack: true,
  ariaLabel: "이전 화면",
  titleText: "",
  showHubQuickActions: true,
};

function backMypage(overrides: Partial<ResolvedMainTier1Subpage>): ResolvedMainTier1Subpage {
  return { ...DEFAULT, backHref: "/mypage", ...overrides };
}

function backHome(overrides: Partial<ResolvedMainTier1Subpage>): ResolvedMainTier1Subpage {
  return { ...DEFAULT, backHref: "/home", ...overrides };
}

/**
 * `RegionBar` 기본 서브페이지 1단(뒤로·제목·허브).
 * `null`이면 호출측에서 전용 분기(거래 탐색·커뮤니티 피드·배달 루트·거래 허브 루트 등)를 쓴다.
 */
export function resolveMainTier1Subpage(pathname: string): ResolvedMainTier1Subpage | null {
  const p = pathname.split("?")[0]!.trim();
  if (!p) return { ...DEFAULT, titleText: "SAMarket" };

  if (isTradeFloatingMenuSurface(p)) return null;
  if (p === "/philife") return null;
  if (p === "/community") return null;
  if (p === "/stores") return null;

  if (p === "/stores/browse" || starts(p, "/stores/browse/")) {
    return {
      ...DEFAULT,
      backHref: "/stores",
      titleText: "배달",
      showHubQuickActions: false,
    };
  }

  if (p === "/mypage/trade") {
    return {
      ...DEFAULT,
      backHref: "/mypage",
      titleText: "개인 거래 허브",
      subtitle: "구매·판매·찜·후기·채팅",
      showHubQuickActions: true,
    };
  }

  /** 주문 허브 내 배달 주문 상세 — 제목만 「주문 상세」로, 우측 허브(알림 등)는 유지 */
  if (/^\/orders\/store\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/orders?tab=store",
      preferHistoryBack: true,
      ariaLabel: "이전 화면",
      titleText: "주문 상세",
      showHubQuickActions: true,
    };
  }

  if (p === "/orders" || starts(p, "/orders/")) {
    return {
      ...DEFAULT,
      showBack: false,
      hideBack: true,
      backHref: "/home",
      titleText: "주문",
      showHubQuickActions: false,
    };
  }

  if (p === "/search") {
    return backHome({ titleText: "검색", showHubQuickActions: true });
  }

  if (p === "/services" || starts(p, "/services/")) {
    return backHome({ titleText: "서비스", showHubQuickActions: true });
  }

  if (p === "/mypage") {
    return backHome({ titleText: "내정보", showHubQuickActions: true });
  }

  if (p === "/write" || starts(p, "/write/")) {
    return backHome({ titleText: "글쓰기", showHubQuickActions: true });
  }

  if (p === "/philife/write" || starts(p, "/philife/write")) {
    return backHome({ titleText: "커뮤니티 글쓰기", showHubQuickActions: true });
  }

  if (p === "/philife/open-chat") {
    return backHome({ titleText: "오픈채팅", subtitle: "커뮤니티", showHubQuickActions: true });
  }

  if (p === "/philife/open-chat/create") {
    return {
      ...DEFAULT,
      backHref: "/philife/open-chat",
      titleText: "커뮤니티",
      subtitle: "오픈채팅 만들기",
      showHubQuickActions: true,
    };
  }

  if (/^\/philife\/open-chat\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/philife/open-chat",
      titleText: "오픈채팅",
      subtitle: "커뮤니티",
      showHubQuickActions: true,
    };
  }

  if (p === "/philife/my") {
    return backHome({ titleText: "내 커뮤니티 활동", showHubQuickActions: true });
  }

  if (p === "/chats/philife" || starts(p, "/chats/philife")) {
    return backHome({ titleText: "커뮤니티 채팅", showHubQuickActions: true });
  }

  if (p === "/home/reviews" || starts(p, "/home/reviews/")) {
    return backHome({ titleText: "후기 관리", showHubQuickActions: true });
  }

  if (p === "/home/purchases") {
    return backHome({ titleText: "거래 관리", showHubQuickActions: true });
  }

  if (/^\/home\/purchases\/[^/]+$/.test(p)) {
    return backHome({ titleText: "구매 상세", showHubQuickActions: true });
  }

  if (p === "/home/sales" || starts(p, "/home/sales/")) {
    return backHome({ titleText: "거래 관리", showHubQuickActions: true });
  }

  if (p === "/mypage/purchases") {
    return backMypage({ titleText: "거래 관리", subtitle: "구매·예약·후기", showHubQuickActions: true });
  }

  if (/^\/mypage\/purchases\/[^/]+$/.test(p)) {
    return backMypage({ titleText: "구매 상세", subtitle: "거래 진행·채팅", showHubQuickActions: true });
  }

  if (p === "/mypage/sales" || starts(p, "/mypage/sales/")) {
    return backMypage({ titleText: "거래 관리", subtitle: "판매·예약·완료", showHubQuickActions: true });
  }

  if (p === "/mypage/reviews" || starts(p, "/mypage/reviews/")) {
    return backMypage({ titleText: "후기 관리", subtitle: "작성·받은 거래 후기", showHubQuickActions: true });
  }

  if (p === "/my/community-posts") {
    return backMypage({
      titleText: "내 커뮤니티 글",
      subtitle: "커뮤니티·동네생활",
      showHubQuickActions: true,
    });
  }

  if (p === "/my/benefits") {
    return backMypage({ titleText: "회원 혜택", subtitle: "이벤트·프로모션", showHubQuickActions: true });
  }

  if (p === "/my/account") {
    return backMypage({ titleText: "내 계정", subtitle: "프로필·인증·연락처", showHubQuickActions: true });
  }

  if (p === "/my/account/phone-verification") {
    return backMypage({ titleText: "전화번호 인증", subtitle: "계정 보안", showHubQuickActions: true });
  }

  if (p === "/my/ads") {
    return backMypage({ titleText: "내 광고 신청", subtitle: "노출·홍보", showHubQuickActions: true });
  }

  if (p === "/my/ads/apply") {
    return { ...DEFAULT, backHref: "/my/ads", titleText: "광고 신청", subtitle: "노출 플랜 선택", showHubQuickActions: true };
  }

  if (p === "/my/store-inquiries") {
    return backMypage({ titleText: "배달 문의", subtitle: "주문·배달 문의 내역", showHubQuickActions: true });
  }

  if (p === "/my/store-orders") {
    return backMypage({ titleText: "배달 주문", showHubQuickActions: true });
  }

  if (/^\/my\/store-orders\/[^/]+$/.test(p)) {
    return backMypage({
      titleText: "주문 상세",
      subtitle: "배달·픽업 주문",
      preferHistoryBack: true,
      ariaLabel: "이전 화면",
      showHubQuickActions: true,
    });
  }

  if (/^\/my\/store-orders\/[^/]+\/review$/.test(p)) {
    return backMypage({ titleText: "리뷰 작성", subtitle: "배달 주문 후기", showHubQuickActions: true });
  }

  if (p === "/my/points") {
    return backMypage({ titleText: "포인트", subtitle: "잔액·충전·내역", showHubQuickActions: true });
  }

  if (p === "/my/points/promotions") {
    return { ...DEFAULT, backHref: "/my/points", titleText: "포인트 노출 신청", subtitle: "프로모션", showHubQuickActions: true };
  }

  if (p === "/my/points/expiring") {
    return { ...DEFAULT, backHref: "/my/points", titleText: "만료 예정 포인트", subtitle: "소멸 전 확인", showHubQuickActions: true };
  }

  if (p === "/my/points/ledger") {
    return { ...DEFAULT, backHref: "/my/points", titleText: "포인트 거래내역", subtitle: "적립·사용 내역", showHubQuickActions: true };
  }

  if (p === "/my/points/charge") {
    return { ...DEFAULT, backHref: "/my/points", titleText: "포인트 충전 신청", subtitle: "충전 요청", showHubQuickActions: true };
  }

  if (p === "/my/notifications") {
    return backMypage({ titleText: "알림", subtitle: "거래·주문·서비스", showHubQuickActions: false });
  }

  if (p === "/my/trust") {
    return backMypage({ titleText: "나의 배터리·신뢰", subtitle: "거래 매너 지표", showHubQuickActions: true });
  }

  if (p === "/my/blocked-users") {
    return backMypage({ titleText: "차단 목록", subtitle: "차단·숨김 관리", showHubQuickActions: true });
  }

  if (p === "/my/reviews" || starts(p, "/my/reviews/")) {
    return backMypage({ titleText: "받은 후기", subtitle: "거래 신뢰·평가", showHubQuickActions: true });
  }

  if (p === "/my/products" || starts(p, "/my/products/")) {
    return backMypage({ titleText: "내상품 관리", subtitle: "거래·판매 글", showHubQuickActions: true });
  }

  if (p === "/my/edit") {
    return backMypage({ titleText: "프로필 수정", subtitle: "닉네임·사진·소개", showHubQuickActions: true });
  }

  if (p === "/my/business/apply") {
    return { ...DEFAULT, backHref: "/my/business", titleText: "배달 입점 신청", showHubQuickActions: true };
  }

  if (p === "/my/recent-viewed") {
    return backMypage({ titleText: "최근 본 글", subtitle: "상품·게시물 다시 보기", showHubQuickActions: true });
  }

  if (starts(p, "/my/settings")) {
    return backMypage({ titleText: "설정", showHubQuickActions: true });
  }

  if (p === "/products/new" || starts(p, "/products/new/")) {
    return backHome({ titleText: "상품 등록", showHubQuickActions: true });
  }

  if (/^\/products\/[^/]+\/edit$/.test(p)) {
    return backHome({ titleText: "상품 수정", showHubQuickActions: true });
  }

  if (/^\/products\/[^/]+$/.test(p)) {
    return backHome({ titleText: "상품", showHubQuickActions: false });
  }

  const back = p.startsWith("/my/") || p.startsWith("/mypage") ? "/mypage" : "/home";
  return { ...DEFAULT, backHref: back, titleText: "", showHubQuickActions: true };
}
