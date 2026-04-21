import { isTradeFloatingMenuSurface } from "@/lib/layout/mobile-top-tier1-rules";
import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

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
  const raw = (pathname ?? "").split("?")[0]!.trim();
  if (!raw) return { ...DEFAULT, titleText: "SAMarket" };
  const p = normalizeAppPathnameForTier1(pathname);

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

  if (p === "/address/select") {
    return backMypage({ titleText: "주소 설정", showHubQuickActions: false });
  }

  if (p === "/community-messenger") {
    return backHome({
      titleText: "메신저",
      subtitle: "친구 · 채팅 · 오픈채팅",
      showHubQuickActions: true,
    });
  }

  if (/^\/community-messenger\/rooms\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/community-messenger?section=chats",
      /** 히스토리(back)에 따라 홈·글 상세 등으로 튀지 않고 항상 메신저 채팅 탭으로 */
      preferHistoryBack: false,
      ariaLabel: "메신저로 돌아가기",
      titleText: "메신저 대화",
      subtitle: "1:1·그룹 채팅",
      showHubQuickActions: false,
    };
  }

  if (p === "/write" || starts(p, "/write/")) {
    return backHome({ titleText: "글쓰기", showHubQuickActions: true });
  }

  if (p === "/philife/write" || starts(p, "/philife/write")) {
    return backHome({ titleText: "커뮤니티 글쓰기", showHubQuickActions: true });
  }

  if (p === "/philife/my") {
    return backHome({ titleText: "내 커뮤니티 활동", showHubQuickActions: true });
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

  if (p === "/my/account" || p === "/mypage/account") {
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

  if (p === "/my/store-orders" || p === "/mypage/store-orders") {
    return backMypage({ titleText: "배달 주문", showHubQuickActions: true });
  }

  if (/^\/my\/store-orders\/[^/]+$/.test(p) || /^\/mypage\/store-orders\/[^/]+$/.test(p)) {
    return backMypage({
      titleText: "주문 상세",
      subtitle: "배달·픽업 주문",
      preferHistoryBack: true,
      ariaLabel: "이전 화면",
      showHubQuickActions: true,
    });
  }

  if (/^\/my\/store-orders\/[^/]+\/review$/.test(p) || /^\/mypage\/store-orders\/[^/]+\/review$/.test(p)) {
    return backMypage({ titleText: "리뷰 작성", subtitle: "배달 주문 후기", showHubQuickActions: true });
  }

  if (p === "/my/points" || p === "/mypage/points") {
    return backMypage({ titleText: "포인트", subtitle: "잔액·충전·내역", showHubQuickActions: true });
  }

  if (p === "/my/points/promotions") {
    return { ...DEFAULT, backHref: "/mypage/points", titleText: "포인트 노출 신청", subtitle: "프로모션", showHubQuickActions: true };
  }

  if (p === "/my/points/expiring") {
    return { ...DEFAULT, backHref: "/mypage/points", titleText: "만료 예정 포인트", subtitle: "소멸 전 확인", showHubQuickActions: true };
  }

  if (p === "/my/points/ledger") {
    return { ...DEFAULT, backHref: "/mypage/points", titleText: "포인트 거래내역", subtitle: "적립·사용 내역", showHubQuickActions: true };
  }

  if (p === "/my/points/charge") {
    return { ...DEFAULT, backHref: "/mypage/points", titleText: "포인트 충전 신청", subtitle: "충전 요청", showHubQuickActions: true };
  }

  if (p === "/my/notifications" || p === "/mypage/notifications") {
    return backMypage({ titleText: "알림", subtitle: "거래·주문·서비스", showHubQuickActions: false });
  }

  if (p === "/mypage/order-notifications") {
    return backMypage({ titleText: "주문 알림", subtitle: "배달·픽업 상태 알림", showHubQuickActions: false });
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

  if (p === "/my/edit" || p === "/mypage/edit" || p === "/mypage/section/account/profile/edit") {
    return backMypage({ titleText: "프로필 수정", subtitle: "닉네임·사진·소개", showHubQuickActions: true });
  }

  if (p === "/mypage/business" || /^\/mypage\/business\/.+/.test(p)) {
    return backMypage({ titleText: "매장 운영", subtitle: "주문·상품·정산 관리", showHubQuickActions: true });
  }

  if (p === "/my/business/apply") {
    return { ...DEFAULT, backHref: "/my/business", titleText: "배달 입점 신청", showHubQuickActions: true };
  }

  if (p === "/my/recent-viewed") {
    return backMypage({ titleText: "최근 본 글", subtitle: "상품·게시물 다시 보기", showHubQuickActions: true });
  }

  if (starts(p, "/my/settings") || starts(p, "/mypage/settings")) {
    return backMypage({ titleText: "앱·계정 설정", showHubQuickActions: true });
  }

  /** `/mypage/section/...` — `MainTier1Extras`로 섹션 제목 덮어쓰기 전 RegionBar 기본값 */
  if (starts(p, "/mypage/section/")) {
    return backMypage({ titleText: "내정보", showHubQuickActions: true });
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

  /**
   * `/post/:id` 거래·서비스 글 상세 — id 는 UUID 외 형식도 있을 수 있음.
   * `PostDetailView`·페이지 부트스트랩의 `MainTier1Extras`로 카테고리(피드 주제)명을 덮어씀.
   */
  if (/^\/post\/[^/]+$/.test(p)) {
    return {
      ...DEFAULT,
      backHref: "/home",
      preferHistoryBack: true,
      ariaLabel: "이전 화면",
      titleText: "거래",
      showHubQuickActions: true,
    };
  }

  /**
   * `/philife/:postId` 동네 글 상세 (단일 세그먼트·UUID 형태).
   * `MainTier1Extras`로 주제 라벨을 덮어씀 — 여기서는 짧은 기본 제목만.
   */
  if (p.startsWith("/philife/")) {
    const seg = p.slice("/philife/".length);
    if (seg && !seg.includes("/") && isUuidLikeString(seg)) {
      return {
        ...DEFAULT,
        backHref: "/philife",
        preferHistoryBack: true,
        ariaLabel: "피드로",
        titleText: "커뮤니티",
        showHubQuickActions: true,
      };
    }
  }

  const back = p.startsWith("/my/") || p.startsWith("/mypage") ? "/mypage" : "/home";
  return { ...DEFAULT, backHref: back, titleText: "", showHubQuickActions: true };
}
