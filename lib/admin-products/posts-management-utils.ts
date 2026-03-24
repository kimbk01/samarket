/**
 * 게시물 관리: 탭·필터·정렬
 */

import type { Product, ProductStatus } from "@/lib/types/product";

export type PostsManagementTab =
  | "all"
  | "trade"
  | "used-car"
  | "real-estate"
  | "jobs"
  | "exchange"
  | "etc";

/** 웹 마켓 상단 탭과 동일한 순서: 전체 · 중고거래 · 중고차 · 부동산 · 알바 · 환전 · 기타 */
export const POSTS_MANAGEMENT_TABS: { value: PostsManagementTab; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "trade", label: "중고거래" },
  { value: "used-car", label: "중고차" },
  { value: "real-estate", label: "부동산" },
  { value: "jobs", label: "알바" },
  { value: "exchange", label: "환전" },
  { value: "etc", label: "기타" },
];

/** slug / icon_key / 표시명(미해석 제외)을 소문자·하이픈 기준으로 통일 */
function normalizedCategoryTokens(p: Product): string[] {
  const raw = [p.categorySlug, p.categoryIconKey, p.category].filter(Boolean).map(String);
  const n = (p.categoryName ?? "").trim();
  if (n && !n.includes("미해석") && !n.includes("미연결")) {
    raw.push(n);
  }
  const out = new Set<string>();
  for (const r of raw) {
    const a = r.toLowerCase().trim();
    if (!a) continue;
    out.add(a);
    out.add(a.replace(/_/g, "-"));
  }
  return [...out];
}

const USED_CAR_KEYS = [
  "used-car",
  "usedcar",
  "used_car",
  "car",
  "중고차",
  "자동차",
];
const REAL_ESTATE_KEYS = [
  "real-estate",
  "realestate",
  "real_estate",
  "property",
  "budongsan",
  "housing",
  "apt",
  "부동산",
];
const EXCHANGE_KEYS = ["exchange", "currency", "환전", "페소", "외환"];
/** 알바·구인 등 → 알바 탭 (웹 상단 ‘알바’ 메뉴와 동일) */
const JOBS_OR_SERVICE_CONTENT_KEYS = [
  "jobs",
  "job",
  "alba",
  "part-time",
  "parttime",
  "recruitment",
  "hire",
  "work",
  "알바",
  "구인",
];

function matchesCategoryKeys(p: Product, keys: string[]): boolean {
  const tokens = normalizedCategoryTokens(p);
  for (const t of tokens) {
    if (keys.includes(t)) return true;
    if (keys.some((k) => t.includes(k) || k.includes(t))) return true;
  }
  return false;
}

function isUsedCarCategory(p: Product): boolean {
  return matchesCategoryKeys(p, USED_CAR_KEYS);
}

function isRealEstateCategory(p: Product): boolean {
  return matchesCategoryKeys(p, REAL_ESTATE_KEYS);
}

function isExchangeCategory(p: Product): boolean {
  return matchesCategoryKeys(p, EXCHANGE_KEYS);
}

function isJobsOrServiceContentCategory(p: Product): boolean {
  return matchesCategoryKeys(p, JOBS_OR_SERVICE_CONTENT_KEYS);
}

function serviceTypeLower(p: Product): string {
  return (p.serviceType ?? "").trim().toLowerCase();
}

/** 알바 탭: services.service_type=jobs 또는 카테고리 slug/이름이 알바·구인 등 */
function postBelongsToJobs(p: Product): boolean {
  return serviceTypeLower(p) === "jobs" || isJobsOrServiceContentCategory(p);
}

/**
 * 커뮤니티·비즈니스 서비스, 또는 카테고리 타입이 거래 홈이 아닌 글(알바 제외) → 기타
 */
function isNonTradeHomeSection(p: Product): boolean {
  if (postBelongsToJobs(p)) return false;
  const pk = (p.postKind ?? "").trim().toLowerCase();
  if (pk === "community" || pk === "feature") return true;
  const st = serviceTypeLower(p);
  if (st === "community" || st === "business") return true;
  const ct = (p.categoryType ?? "").trim().toLowerCase();
  if (ct === "community" || ct === "service" || ct === "feature") return true;
  return false;
}

function postBelongsToUsedCar(p: Product): boolean {
  return serviceTypeLower(p) === "used_car" || isUsedCarCategory(p);
}

function postBelongsToRealEstate(p: Product): boolean {
  return serviceTypeLower(p) === "real_estate" || isRealEstateCategory(p);
}

/** ExchangeWriteForm 등이 저장한 posts.meta */
function isExchangePostMeta(p: Product): boolean {
  const m = p.postMeta;
  if (!m || typeof m !== "object") return false;
  if (m.exchange_direction === "sell" || m.exchange_direction === "buy") return true;
  if (typeof m.exchange_rate === "number" && !Number.isNaN(m.exchange_rate) && m.exchange_rate > 0) {
    return true;
  }
  const from = String(m.from_currency ?? "").toUpperCase();
  const to = String(m.to_currency ?? "").toUpperCase();
  if ((from === "PHP" && to === "KRW") || (from === "KRW" && to === "PHP")) return true;
  return false;
}

/** 카테고리 조인 실패 시에도 웹 환전 글 제목 패턴으로 분류 */
function isExchangeByTitleHeuristic(p: Product): boolean {
  const t = (p.title ?? "").toLowerCase();
  if (t.includes("페소") && (t.includes("팝니다") || t.includes("삽니다"))) return true;
  if (/\b1\s*php\s*=/.test(t)) return true;
  return false;
}

function postBelongsToExchange(p: Product): boolean {
  if (isExchangeCategory(p) || isExchangePostMeta(p)) return true;
  /** 카테고리가 이미 해석된 글은 slug 기준만 사용 (다른 탭 카테고리 글 제목에 ‘페소’가 있어도 환전 탭으로 빼지 않음) */
  if (hasResolvedCategoryMeta(p)) return false;
  return isExchangeByTitleHeuristic(p);
}

/**
 * slug·icon_key·이름으로 카테고리가 “해석된” 글 (관리자용 미해석/미연결 문구는 미분류로 취급)
 */
export function hasResolvedCategoryMeta(p: Product): boolean {
  if ((p.categorySlug ?? "").trim()) return true;
  if ((p.categoryIconKey ?? "").trim()) return true;
  const n = (p.categoryName ?? "").trim();
  if (!n) return false;
  if (n.includes("미해석") || n.includes("미연결")) return false;
  return true;
}

/**
 * 웹 상단 탭과 동일: 전체·중고거래·중고차·부동산·알바·환전·기타
 * - 중고차·부동산·환전·알바: service_type 또는 카테고리(slug·icon·이름)로 판별
 * - 기타: 커뮤니티·비즈니스·서비스/피처 카테고리 (알바는 별도 탭)
 * - 중고거래: 그 외 (home_trade, 일반 거래, 미분류)
 */
function matchesTab(p: Product, tab: PostsManagementTab): boolean {
  const isCar = postBelongsToUsedCar(p);
  const isRe = postBelongsToRealEstate(p);
  const isJobs = postBelongsToJobs(p);
  const isEx = postBelongsToExchange(p);
  const isEtc = isNonTradeHomeSection(p);

  switch (tab) {
    case "all":
      return true;
    case "used-car":
      return isCar;
    case "real-estate":
      return isRe;
    case "jobs":
      return isJobs;
    case "exchange":
      return isEx;
    case "etc":
      return isEtc;
    case "trade":
      return !isCar && !isRe && !isJobs && !isEx && !isEtc;
    default:
      return true;
  }
}

/** 탭별 글 수 (필터 적용 전, 순수 탭 규칙만) */
export function countProductsForTab(products: Product[], tab: PostsManagementTab): number {
  return products.filter((p) => matchesTab(p, tab)).length;
}

/** 한 건이 어느 관리 탭에 속하는지 (표시·디버그용, matchesTab과 동일 규칙) */
export function inferPostsManagementSection(p: Product): PostsManagementTab {
  if (postBelongsToUsedCar(p)) return "used-car";
  if (postBelongsToRealEstate(p)) return "real-estate";
  if (postBelongsToJobs(p)) return "jobs";
  if (postBelongsToExchange(p)) return "exchange";
  if (isNonTradeHomeSection(p)) return "etc";
  return "trade";
}

export function getPostsManagementSectionLabel(p: Product): string {
  const t = inferPostsManagementSection(p);
  return POSTS_MANAGEMENT_TABS.find((x) => x.value === t)?.label ?? t;
}

/** 홈·카테고리 목록과 동일하게 웹에 노출되는 글 (숨김·삭제·블라인드·visibility hidden 제외) */
export function isWebListedProduct(p: Product): boolean {
  const st = p.status;
  if (st === "hidden" || st === "deleted" || st === "blinded") return false;
  const v = (p.visibility ?? "public").toLowerCase();
  if (v === "hidden") return false;
  return true;
}

export const DEAL_TYPE_OPTIONS: { value: "all" | "sale" | "free"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "sale", label: "판매" },
  { value: "free", label: "무료나눔" },
];

export const STATUS_OPTIONS_POSTS: { value: ProductStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "active", label: "판매중" },
  { value: "reserved", label: "예약중" },
  { value: "sold", label: "완료" },
  { value: "hidden", label: "숨김" },
];

export type PostsManagementSortKey = "popular" | "latest" | "id_asc" | "id_desc";

export const SORT_OPTIONS_POSTS: { value: PostsManagementSortKey; label: string }[] = [
  { value: "popular", label: "인기순" },
  { value: "latest", label: "최신순" },
  { value: "id_asc", label: "상품ID 오름차순" },
  { value: "id_desc", label: "상품ID 내림차순" },
];

export interface PostsManagementFilters {
  dealType: "all" | "sale" | "free";
  status: ProductStatus | "";
  hasReport: boolean;
  hiddenOnly: boolean;
  bannedSuspect: boolean;
  sortKey: PostsManagementSortKey;
  /** true면 웹 앱에 실제 노출되는 글만 (getPostsByCategory·홈과 동일 기준) */
  webVisibleOnly: boolean;
}

export const DEFAULT_POSTS_MANAGEMENT_FILTERS: PostsManagementFilters = {
  dealType: "all",
  status: "",
  hasReport: false,
  hiddenOnly: false,
  bannedSuspect: false,
  sortKey: "latest",
  webVisibleOnly: false,
};

/** UUID 검색 시 하이픈 유무 무시 */
function normalizeIdForMatch(id: string): string {
  return id.toLowerCase().replace(/-/g, "");
}

export function filterAndSortPostsManagement(
  products: Product[],
  tab: PostsManagementTab,
  filters: PostsManagementFilters,
  sellerSearch: string,
  categorySearch: string,
  productIdSearch: string
): Product[] {
  let list = products.filter((p) => matchesTab(p, tab));

  if (filters.webVisibleOnly) {
    list = list.filter((p) => isWebListedProduct(p));
  }

  if (filters.dealType === "sale") {
    list = list.filter((p) => !p.isFreeShare);
  } else if (filters.dealType === "free") {
    list = list.filter((p) => p.isFreeShare === true);
  }

  if (filters.status) {
    list = list.filter((p) => p.status === filters.status);
  }
  if (filters.hasReport) {
    list = list.filter((p) => (p.reportCount ?? 0) > 0);
  }
  if (filters.hiddenOnly) {
    list = list.filter((p) => p.status === "hidden" || p.visibility === "hidden");
  }
  if (filters.bannedSuspect) {
    list = list.filter((p) => (p.bannedMemo ?? "").trim().length > 0);
  }

  if (sellerSearch.trim()) {
    const q = sellerSearch.trim().toLowerCase();
    list = list.filter((p) =>
      (p.seller?.nickname ?? p.sellerId ?? "").toLowerCase().includes(q)
    );
  }
  if (categorySearch.trim()) {
    const q = categorySearch.trim().toLowerCase();
    list = list.filter(
      (p) =>
        (p.categoryName ?? "").toLowerCase().includes(q) ||
        (p.categorySlug ?? "").toLowerCase().includes(q) ||
        (p.categoryIconKey ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
    );
  }

  if (productIdSearch.trim()) {
    const q = normalizeIdForMatch(productIdSearch.trim());
    list = list.filter((p) => normalizeIdForMatch(p.id).includes(q));
  }

  const key = filters.sortKey;
  list.sort((a, b) => {
    if (key === "id_asc") {
      return a.id.localeCompare(b.id);
    }
    if (key === "id_desc") {
      return b.id.localeCompare(a.id);
    }
    if (key === "popular") {
      const aScore = (a.likesCount ?? 0) + (a.chatCount ?? 0);
      const bScore = (b.likesCount ?? 0) + (b.chatCount ?? 0);
      if (bScore !== aScore) return bScore - aScore;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return list;
}

export function getCategoryOptionsFromProducts(products: Product[]): string[] {
  const set = new Set<string>();
  products.forEach((p) => {
    const name = p.categoryName ?? p.category ?? p.categorySlug;
    if (name?.trim()) set.add(name.trim());
  });
  return Array.from(set).sort();
}

/** 중고거래 탭(미분류 묶음)에 들어가는 글 수 */
export function countPostsWithoutCategoryMeta(products: Product[]): number {
  return products.filter((p) => !hasResolvedCategoryMeta(p)).length;
}

export function hasPostsManagementActiveFilters(
  filters: PostsManagementFilters,
  sellerSearch: string,
  categorySearch: string,
  productIdSearch: string
): boolean {
  return (
    filters.webVisibleOnly ||
    filters.hasReport ||
    filters.hiddenOnly ||
    filters.bannedSuspect ||
    filters.status !== "" ||
    filters.dealType !== "all" ||
    sellerSearch.trim() !== "" ||
    categorySearch.trim() !== "" ||
    productIdSearch.trim() !== ""
  );
}
