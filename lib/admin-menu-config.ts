/**
 * 관리자 메뉴 설정
 * - 대시보드 / 실질 운영 / 광고·노출 / 포인트 운영 / 운영 설정 / 관리·보고 / 개발·시스템
 * - 권한: operator(운영자) | manager(총괄) | master(마스터)
 */

export type AdminRole = "operator" | "manager" | "master";

export type AdminSectionId =
  | "dashboard"
  | "ops"
  | "ads"
  | "point"
  | "settings"
  | "manage"
  | "dev";

export interface AdminMenuItem {
  label: string;
  href?: string;
  children?: AdminMenuItem[];
}

export interface AdminMenuSection {
  id: AdminSectionId;
  label: string;
  requiredRole: AdminRole;
  items: AdminMenuItem[];
}

/** 그룹 라벨 + 평면 링크 (사이드바 CollapsibleGroup용) */
export interface OpsMenuGroup {
  groupLabel: string;
  items: { label: string; href: string }[];
}

// ─── 실질 운영 (트리 구조) ─────────────────────────────────────────

const OPS_ITEMS: AdminMenuItem[] = [
  { label: "운영 허브", href: "/admin/operations" },
  { label: "회원관리", href: "/admin/users" },
  { label: "지역관리", href: "/admin/regions" },
  {
    label: "메뉴 관리",
    href: "/admin/menus",
    children: [
      { label: "메뉴 (중고·거래)", href: "/admin/menus/trade" },
      { label: "메뉴 (동네생활)", href: "/admin/menus/community" },
      { label: "메인 하단 탭", href: "/admin/menus/main-bottom-nav" },
    ],
  },
  {
    label: "중고거래",
    href: "/admin/products",
    children: [
      { label: "상품관리", href: "/admin/products" },
      { label: "거래 피드 주제", href: "/admin/trade/feed-topics" },
      { label: "거래카테고리", href: "/admin/trade-categories" },
      { label: "가격제안관리", href: "/admin/price-offers" },
      { label: "찜/관심관리", href: "/admin/favorites" },
      { label: "거래상태관리", href: "/admin/trade-status" },
    ],
  },
  {
    label: "커뮤니티",
    href: "/admin/boards",
    children: [
      { label: "게시판관리", href: "/admin/boards" },
      { label: "피드 섹션 (동네생활)", href: "/admin/community/sections" },
      { label: "피드 주제", href: "/admin/community/topics" },
      { label: "피드 운영 설정", href: "/admin/community/settings" },
      { label: "피드 신고", href: "/admin/community/reports" },
      { label: "게시글관리", href: "/admin/posts" },
      { label: "댓글관리", href: "/admin/comments" },
      { label: "게시판카테고리", href: "/admin/board-categories" },
      { label: "인기글관리", href: "/admin/popular-posts" },
      { label: "공지관리", href: "/admin/app/notices" },
      { label: "사용 설명서 (게시판)", href: "/admin/docs/board" },
    ],
  },
  {
    label: "매장 (배달관련)",
    href: "/admin/business",
    children: [
      { label: "업체관리", href: "/admin/business" },
      { label: "홍보글관리", href: "/admin/promo-posts" },
      { label: "쿠폰/이벤트", href: "/admin/coupons" },
      { label: "노출관리", href: "/admin/business-exposure" },
    ],
  },
  { label: "알바", href: "/admin/jobs" },
  { label: "부동산", href: "/admin/real-estate" },
  { label: "중고차", href: "/admin/used-car" },
  {
    label: "채팅관리",
    href: "/admin/chats",
    children: [
      { label: "전체 채팅", href: "/admin/chats" },
      { label: "거래 채팅", href: "/admin/chats/trade" },
      { label: "신고 채팅", href: "/admin/chats/reported" },
      { label: "업체·비즈", href: "/admin/chats/business" },
      { label: "커뮤니티", href: "/admin/chats/community" },
      { label: "모임·게시판", href: "/admin/chats/group" },
      { label: "거래완료", href: "/admin/chats/trade-complete" },
      { label: "사용 설명서 (채팅)", href: "/admin/docs/chat" },
    ],
  },
  { label: "리뷰관리", href: "/admin/reviews" },
  { label: "통합 신고·제재", href: "/admin/reports" },
];

// ─── 광고/노출 ─────────────────────────────────────────────────────

const ADS_ITEMS: AdminMenuItem[] = [
  { label: "광고신청", href: "/admin/ad-applications" },
  { label: "유료노출", href: "/admin/promoted-items" },
  { label: "회원혜택", href: "/admin/member-benefits" },
  { label: "노출정책", href: "/admin/exposure-policies" },
  { label: "홈피드", href: "/admin/home-feed" },
  { label: "개인화추천", href: "/admin/personalized-feed" },
];

// ─── 포인트 운영 ───────────────────────────────────────────────────

const POINT_ITEMS: AdminMenuItem[] = [
  { label: "포인트충전", href: "/admin/point-charges" },
  { label: "포인트원장", href: "/admin/points/ledger" },
  { label: "포인트정책", href: "/admin/point-policies" },
  { label: "포인트실행", href: "/admin/point-executions" },
  { label: "포인트만료", href: "/admin/points/expire" },
];

// ─── 운영 설정 ─────────────────────────────────────────────────────

const SETTINGS_ITEMS: AdminMenuItem[] = [
  { label: "서비스관리", href: "/admin/services" },
  { label: "카테고리관리", href: "/admin/categories" },
  { label: "게시판관리", href: "/admin/boards" },
  { label: "설정관리", href: "/admin/settings" },
  { label: "권한관리", href: "/admin/permissions" },
];

// ─── 관리/보고 (그룹 + 평면 링크) ──────────────────────────────────

export const MANAGE_MENU_GROUPS: OpsMenuGroup[] = [
  {
    groupLabel: "실험/분석",
    items: [
      { label: "A/B실험", href: "/admin/recommendation-experiments" },
      { label: "추천보고서", href: "/admin/recommendation-reports" },
      { label: "운영보드", href: "/admin/ops-board" },
    ],
  },
  {
    groupLabel: "운영 지식",
    items: [
      { label: "운영문서", href: "/admin/ops-docs" },
      { label: "런북실행", href: "/admin/ops-runbooks" },
      { label: "지식베이스", href: "/admin/ops-knowledge" },
      { label: "지식그래프", href: "/admin/ops-knowledge-graph" },
    ],
  },
  {
    groupLabel: "운영 평가",
    items: [
      { label: "운영학습", href: "/admin/ops-learning" },
      { label: "운영성숙도", href: "/admin/ops-maturity" },
      { label: "운영벤치마크", href: "/admin/ops-benchmarks" },
    ],
  },
];

const MANAGE_ITEMS: AdminMenuItem[] = [
  ...MANAGE_MENU_GROUPS.flatMap((g) =>
    g.items.map((i) => ({ label: i.label, href: i.href }))
  ),
];

// ─── 개발/시스템 ───────────────────────────────────────────────────

const DEV_ITEMS: AdminMenuItem[] = [
  { label: "QA보드", href: "/admin/qa-board" },
  { label: "핫수정/긴급조치", href: "/admin/feed-emergency" },
  { label: "장기운영", href: "/admin/ops-routines" },
  { label: "제품백로그", href: "/admin/product-backlog" },
  { label: "스프린트", href: "/admin/dev-sprints" },
  {
    label: "릴리즈관리",
    href: "/admin/release-notes",
    children: [
      { label: "릴리즈노트", href: "/admin/release-notes" },
      { label: "릴리즈아카이브", href: "/admin/release-archive" },
      { label: "프로덕션전환", href: "/admin/production-migration" },
    ],
  },
  {
    label: "시스템관리",
    href: "/admin/system",
    children: [
      { label: "백업/복구", href: "/admin/backup" },
      { label: "DR시나리오", href: "/admin/dr" },
      { label: "보안점검", href: "/admin/security" },
      { label: "성능", href: "/admin/performance" },
      { label: "비용", href: "/admin/usage" },
      { label: "자동화", href: "/admin/automation" },
      { label: "시스템상태", href: "/admin/system" },
    ],
  },
  { label: "로그감사", href: "/admin/audit-logs" },
];

// ─── 실질 운영 플랫 (대시보드 빠른링크 등용) ───────────────────────

function flattenOpsItems(items: AdminMenuItem[]): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const it of items) {
    if (it.href) out.push({ label: it.label, href: it.href });
    if (it.children) out.push(...flattenOpsItems(it.children));
  }
  return out;
}

export const OPS_MENU_GROUPS: OpsMenuGroup[] = [
  { groupLabel: "실질 운영", items: flattenOpsItems(OPS_ITEMS) },
];

/** 대시보드 실질 운영 바로가기 우선순위 (자주 쓰는 순) */
export const OPS_QUICK_LINKS_PRIORITY: { label: string; href: string }[] = [
  { label: "운영 허브", href: "/admin/operations" },
  { label: "통합 신고·제재", href: "/admin/reports" },
  { label: "상품관리", href: "/admin/products" },
  { label: "회원관리", href: "/admin/users" },
  { label: "게시판관리", href: "/admin/boards" },
  { label: "포인트충전", href: "/admin/point-charges" },
  { label: "채팅관리", href: "/admin/chats" },
  { label: "광고신청", href: "/admin/ad-applications" },
  { label: "설정관리", href: "/admin/settings" },
];

/** 대시보드 관리/보고 바로가기 우선순위 */
export const MANAGE_QUICK_LINKS_PRIORITY: { label: string; href: string }[] = [
  { label: "운영보드", href: "/admin/ops-board" },
  { label: "추천보고서", href: "/admin/recommendation-reports" },
  { label: "A/B실험", href: "/admin/recommendation-experiments" },
  { label: "운영문서", href: "/admin/ops-docs" },
  { label: "지식베이스", href: "/admin/ops-knowledge" },
  { label: "운영성숙도", href: "/admin/ops-maturity" },
];

// ─── 섹션 정의 ─────────────────────────────────────────────────────

export const ADMIN_MENU_SECTIONS: AdminMenuSection[] = [
  { id: "dashboard", label: "대시보드", requiredRole: "operator", items: [] },
  { id: "ops", label: "실질 운영", requiredRole: "operator", items: OPS_ITEMS },
  { id: "ads", label: "광고/노출", requiredRole: "operator", items: ADS_ITEMS },
  { id: "point", label: "포인트 운영", requiredRole: "operator", items: POINT_ITEMS },
  { id: "settings", label: "운영 설정", requiredRole: "operator", items: SETTINGS_ITEMS },
  { id: "manage", label: "관리/보고", requiredRole: "manager", items: MANAGE_ITEMS },
  { id: "dev", label: "개발/시스템", requiredRole: "master", items: DEV_ITEMS },
];
