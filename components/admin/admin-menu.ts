/**
 * 관리자 사이드바 메뉴 데이터 (JSON 기반, 당근형 서비스 중심)
 * - adminMenu: 단일 배열, 최상위는 대시보드(단일) + 그룹(children)
 * - path: 존재하는 app/admin 라우트는 실제 path, 없으면 임시 path + 주석 "추후 연결 필요"
 * - roles 미지정 시 전체 노출, 지정 시 해당 role만 노출 (추후 권한 연동)
 */

export type AdminMenuRole = "master" | "admin" | "operator" | "viewer";

/** 메뉴 연결 상태: 완료 / 부분 / 미연결. 미지정 시 하위로부터 자동 계산 (사이드바 접두어 미사용) */
export type AdminMenuStatus = "done" | "partial" | "todo";

export interface AdminMenuItem {
  key: string;
  title: string;
  path?: string;
  icon?: string;
  roles?: AdminMenuRole[];
  children?: AdminMenuItem[];
  /** true면 해당 path 페이지 미구현 — UI에서 muted 표시, 추후 연결 필요 */
  pendingRoute?: true;
  /** 연결 상태. 미지정이면 하위 메뉴 기준 자동 계산 */
  status?: AdminMenuStatus;
}

/** 단일 배열: 대시보드(단일) + 실질운영/광고/포인트/설정/관리보고/개발시스템(그룹) */
export const adminMenu: AdminMenuItem[] = [
  {
    key: "dashboard",
    title: "대시보드",
    path: "/admin",
    status: "done",
  },
  {
    key: "operations",
    title: "실질 운영",
    children: [
      { key: "users", title: "회원관리", path: "/admin/users", status: "done" },
      {
        key: "posts-management",
        title: "게시물 관리",
        path: "/admin/posts-management",
        status: "done",
      },
      {
        key: "jobs-management",
        title: "일자리(알바) 관리",
        path: "/admin/posts-management?tab=jobs",
        status: "done",
      },
      { key: "regions", title: "지역관리", path: "/admin/regions", pendingRoute: true, status: "todo" },
      {
        key: "menu-management",
        title: "메뉴 관리",
        path: "/admin/menus",
        children: [
          { key: "menu-trade", title: "메뉴 (거래)", path: "/admin/menus/trade", status: "done" },
          { key: "menu-community", title: "메뉴 (커뮤니티)", path: "/admin/menus/philife", status: "done" },
          { key: "menu-main-bottom-nav", title: "메인 하단 탭", path: "/admin/menus/main-bottom-nav", status: "done" },
        ],
      },
      {
        key: "trade",
        title: "거래",
        path: "/admin/products",
        children: [
          { key: "trade-products", title: "상품관리", path: "/admin/products", status: "partial" },
          { key: "trade-feed-topics", title: "거래 피드 주제", path: "/admin/trade/feed-topics", status: "done" },
          { key: "trade-offers", title: "가격제안관리", path: "/admin/price-offers", pendingRoute: true, status: "todo" },
          { key: "trade-likes", title: "찜/관심관리", path: "/admin/favorites", status: "done" },
          { key: "trade-status", title: "거래상태관리", path: "/admin/trade-status", pendingRoute: true, status: "todo" },
        ],
      },
      {
        key: "community",
        title: "커뮤니티",
        path: "/admin/posts",
        children: [
          { key: "community-boards", title: "게시판관리", path: "/admin/boards", status: "done" },
          { key: "community-sections", title: "피드 섹션", path: "/admin/philife/sections", status: "done" },
          { key: "community-topics", title: "피드 주제", path: "/admin/philife/topics", status: "done" },
          {
            key: "community-feed-settings",
            title: "피드 운영 설정",
            path: "/admin/philife/settings",
            status: "done",
          },
          { key: "community-feed-reports", title: "피드 신고", path: "/admin/philife/reports", status: "done" },
          {
            key: "community-meeting-events",
            title: "모임 운영 로그",
            path: "/admin/philife/meeting-events",
            status: "done",
          },
          { key: "community-posts", title: "게시글관리", path: "/admin/posts", status: "done" },
          { key: "community-comments", title: "댓글관리", path: "/admin/comments", status: "done" },
          { key: "community-board-categories", title: "게시판카테고리", path: "/admin/board-categories", pendingRoute: true, status: "todo" },
          { key: "community-popular", title: "인기글관리", path: "/admin/popular-posts", pendingRoute: true, status: "todo" },
          { key: "community-notices", title: "공지관리", path: "/admin/app/notices", status: "done" },
        ],
      },
      {
        key: "business",
        title: "배달",
        path: "/admin/business",
        children: [
          {
            key: "store-application-settings",
            title: "배달 입점 설정",
            path: "/admin/stores/application-settings",
            status: "done",
          },
          {
            key: "stores-commerce",
            title: "배달 입점 심사(DB)",
            path: "/admin/stores",
            status: "partial",
          },
          {
            key: "store-products-admin",
            title: "배달 메뉴·상품 검수",
            path: "/admin/store-products",
            status: "partial",
          },
          {
            key: "store-orders-admin",
            title: "배달 주문",
            path: "/admin/store-orders",
            status: "partial",
          },
          {
            key: "delivery-orders-console",
            title: "배달 주문 운영",
            path: "/admin/delivery-orders",
            children: [
              {
                key: "delivery-orders-list",
                title: "주문목록",
                path: "/admin/delivery-orders",
                status: "done",
              },
              {
                key: "delivery-orders-cancel",
                title: "취소 요청",
                path: "/admin/delivery-orders/cancellations",
                status: "done",
              },
              {
                key: "delivery-orders-refund",
                title: "환불 요청",
                path: "/admin/delivery-orders/refunds",
                status: "done",
              },
              {
                key: "delivery-orders-settlement",
                title: "정산",
                path: "/admin/delivery-orders/settlements",
                status: "done",
              },
              {
                key: "delivery-orders-reports",
                title: "신고·분쟁",
                path: "/admin/delivery-orders/reports",
                status: "done",
              },
              {
                key: "delivery-orders-logs",
                title: "감사 로그",
                path: "/admin/delivery-orders/logs",
                status: "done",
              },
            ],
          },
          {
            key: "store-inquiries-admin",
            title: "배달 문의",
            path: "/admin/store-inquiries",
            status: "partial",
          },
          {
            key: "store-reviews-admin",
            title: "배달 리뷰",
            path: "/admin/store-reviews",
            status: "partial",
          },
          {
            key: "store-reports-admin",
            title: "배달·상품 신고",
            path: "/admin/store-reports",
            status: "partial",
          },
          {
            key: "store-settlements-admin",
            title: "배달 정산",
            path: "/admin/store-settlements",
            status: "partial",
          },
          {
            key: "store-payment-events-admin",
            title: "배달 결제 이벤트",
            path: "/admin/store-payment-events",
            status: "partial",
          },
          {
            key: "commerce-settings-admin",
            title: "배달 커머스 수치",
            path: "/admin/commerce-settings",
            status: "partial",
          },
          { key: "business-shops", title: "업체관리", path: "/admin/business", status: "done" },
          { key: "business-posts", title: "홍보글관리", path: "/admin/promo-posts", pendingRoute: true, status: "todo" },
          { key: "business-coupons", title: "쿠폰/이벤트", path: "/admin/coupons", pendingRoute: true, status: "todo" },
          { key: "business-exposure", title: "노출관리", path: "/admin/business-exposure", pendingRoute: true, status: "todo" },
        ],
      },
      {
        key: "chat",
        title: "채팅관리",
        path: "/admin/chats",
        children: [
          { key: "chat-all", title: "전체채팅", path: "/admin/chats", status: "done" },
          { key: "chat-trade-flow", title: "거래흐름·온도", path: "/admin/trade-flow", status: "done" },
          { key: "chat-trade", title: "거래채팅", path: "/admin/chats/trade", status: "done" },
          { key: "chat-messenger", title: "커뮤니티 메신저", path: "/admin/chats/messenger", status: "done" },
          { key: "chat-reported", title: "신고채팅", path: "/admin/chats/reported", status: "done" },
        ],
      },
      {
        key: "reviews",
        title: "리뷰관리",
        path: "/admin/reviews",
        children: [
          { key: "reviews-trade", title: "거래후기", path: "/admin/reviews", status: "done" },
          { key: "reviews-business", title: "업체후기", path: "/admin/reviews/business", pendingRoute: true, status: "todo" },
          { key: "reviews-reported", title: "리뷰신고", path: "/admin/reviews/reported", pendingRoute: true, status: "todo" },
        ],
      },
      {
        key: "reports",
        title: "신고/제재관리",
        path: "/admin/reports",
        children: [
          { key: "reports-posts", title: "통합 신고", path: "/admin/reports", status: "done" },
          { key: "reports-comments", title: "댓글신고", path: "/admin/reports/comments", pendingRoute: true, status: "todo" },
          { key: "reports-chat", title: "채팅신고", path: "/admin/reports/chats", pendingRoute: true, status: "todo" },
          { key: "reports-users", title: "사용자제재", path: "/admin/reports/sanctions", pendingRoute: true, status: "todo" },
          { key: "reports-logs", title: "처리로그", path: "/admin/reports/log", pendingRoute: true, status: "todo" },
        ],
      },
    ],
  },
  {
    key: "ads",
    title: "광고/노출",
    children: [
      { key: "ads-applications", title: "광고신청 관리", path: "/admin/ad-applications", status: "done" },
      { key: "ads-post-ads", title: "게시글광고", path: "/admin/post-ads", status: "done" },
      { key: "ads-paid", title: "유료노출", path: "/admin/promoted-items", status: "done" },
      { key: "ads-benefits", title: "회원혜택", path: "/admin/member-benefits", status: "done" },
      { key: "ads-policy", title: "노출정책", path: "/admin/exposure-policies", status: "done" },
      { key: "ads-home-feed", title: "홈피드", path: "/admin/home-feed", status: "done" },
      { key: "ads-recommendation", title: "개인화추천", path: "/admin/personalized-feed", status: "done" },
    ],
  },
  {
    key: "points",
    title: "포인트 운영",
    children: [
      { key: "points-charge", title: "포인트충전", path: "/admin/point-charges", status: "done" },
      { key: "points-ledger", title: "포인트원장", path: "/admin/points/ledger", status: "done" },
      { key: "points-policy", title: "포인트정책", path: "/admin/point-policies", status: "done" },
      { key: "points-execute", title: "포인트실행", path: "/admin/point-executions", status: "done" },
      { key: "points-expire", title: "포인트만료", path: "/admin/points/expire", status: "done" },
    ],
  },
  {
    key: "settings",
    title: "운영 설정",
    children: [
      { key: "settings-services", title: "서비스관리", path: "/admin/services", pendingRoute: true, status: "todo" },
      { key: "settings-boards", title: "게시판관리", path: "/admin/boards", status: "done" },
      { key: "settings-general", title: "설정관리", path: "/admin/settings", status: "done" },
      { key: "settings-permissions", title: "권한관리", path: "/admin/permissions", pendingRoute: true, status: "todo" },
    ],
  },
  {
    key: "manage",
    title: "관리/보고",
    children: [
      {
        key: "manage-experiments",
        title: "실험/분석",
        path: "/admin/recommendation-experiments",
        children: [
          { key: "manage-ab", title: "A/B실험", path: "/admin/recommendation-experiments", status: "done" },
          { key: "manage-reports", title: "추천보고서", path: "/admin/recommendation-reports", status: "done" },
          { key: "manage-ops-board", title: "운영보드", path: "/admin/ops-board", status: "done" },
        ],
      },
      {
        key: "manage-knowledge",
        title: "운영 지식",
        path: "/admin/ops-docs",
        children: [
          { key: "manage-docs", title: "운영문서", path: "/admin/ops-docs", status: "done" },
          { key: "manage-runbooks", title: "런북실행", path: "/admin/ops-runbooks", status: "done" },
          { key: "manage-kb", title: "지식베이스", path: "/admin/ops-knowledge", status: "done" },
          { key: "manage-kg", title: "지식그래프", path: "/admin/ops-knowledge-graph", status: "done" },
        ],
      },
      {
        key: "manage-eval",
        title: "운영 평가",
        path: "/admin/ops-maturity",
        children: [
          { key: "manage-learning", title: "운영학습", path: "/admin/ops-learning", status: "done" },
          { key: "manage-maturity", title: "운영성숙도", path: "/admin/ops-maturity", status: "done" },
          { key: "manage-benchmarks", title: "운영벤치마크", path: "/admin/ops-benchmarks", status: "done" },
        ],
      },
    ],
  },
  {
    key: "system",
    title: "개발/시스템",
    children: [
      { key: "system-qa", title: "QA보드", path: "/admin/qa-board", status: "done" },
      { key: "system-hotfix", title: "핫수정/긴급조치", path: "/admin/feed-emergency", status: "done" },
      { key: "system-longrun", title: "장기운영", path: "/admin/ops-routines", status: "done" },
      { key: "system-backlog", title: "제품백로그", path: "/admin/product-backlog", status: "done" },
      { key: "system-sprint", title: "스프린트", path: "/admin/dev-sprints", status: "done" },
      {
        key: "system-release",
        title: "릴리즈관리",
        path: "/admin/release-notes",
        children: [
          { key: "system-release-notes", title: "릴리즈노트", path: "/admin/release-notes", status: "done" },
          { key: "system-release-archive", title: "릴리즈아카이브", path: "/admin/release-archive", status: "done" },
          { key: "system-release-migration", title: "프로덕션전환", path: "/admin/production-migration", status: "done" },
        ],
      },
      {
        key: "system-manage",
        title: "시스템관리",
        path: "/admin/system",
        children: [
          { key: "system-backup", title: "백업/복구", path: "/admin/backup", status: "done" },
          { key: "system-dr", title: "DR시나리오", path: "/admin/dr", status: "done" },
          { key: "system-security", title: "보안점검", path: "/admin/security", status: "done" },
          { key: "system-performance", title: "성능", path: "/admin/performance", status: "done" },
          { key: "system-usage", title: "비용", path: "/admin/usage", status: "done" },
          { key: "system-automation", title: "자동화", path: "/admin/automation", status: "done" },
          { key: "system-status", title: "시스템상태", path: "/admin/system", status: "done" },
        ],
      },
      { key: "system-audit", title: "로그감사", path: "/admin/audit-logs", status: "done" },
    ],
  },
];

/**
 * role 기준 메뉴 필터링. 항목/자식의 roles 미지정 시 전체 노출, 지정 시 해당 role만 노출.
 */
export function filterMenuByRole(
  menu: AdminMenuItem[],
  role: AdminMenuRole
): AdminMenuItem[] {
  function filter(items: AdminMenuItem[]): AdminMenuItem[] {
    return items
      .filter((item) => !item.roles?.length || item.roles.includes(role))
      .map((item) => ({
        ...item,
        children: item.children?.length ? filter(item.children) : undefined,
      }))
      .filter((item) => !item.children || item.children.length > 0 || item.path);
  }
  return filter(menu);
}
