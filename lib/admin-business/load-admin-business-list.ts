/**
 * Admin Business list — ops control plane read model.
 * Pagination + KPI from existing tables. No parallel SSOT.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUSINESS_OPS_DELIVERING_ORDER_STATUSES,
  BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES,
  BUSINESS_OPS_PENDING_APPROVAL,
  formatOpsListCityLine,
  hoursLabelFromBusinessHoursJson,
  presentSettlementKind,
  storeCommissionAttentionSignals,
  presentStoreOpenKind,
  resolveBusinessOpsOwnerIdentity,
  taxonomyName,
  type BusinessOpsOpenKind,
  type BusinessOpsSettlementKind,
} from "@/lib/admin-business/business-ops-presentation";
import {
  CONFIRMED_SALE_REVENUE_ORDER_SELECT,
  confirmedSaleRevenuePhp,
  type ConfirmedSaleRevenueOrderSnapshot,
} from "@/lib/stores/confirmed-sale-revenue";
import { STORE_ECONOMIC_POINT_ACCOUNTS_TABLE } from "@/lib/stores/advertising/canonical-business-cash-contract";

export type AdminBusinessListOpsFilters = {
  q?: string;
  /** approval_status or "all" */
  approval?: string;
  /** open | closed | break | temp_closed */
  openKind?: string;
  orderable?: "yes" | "no" | "";
  delivery?: "yes" | "no" | "";
  settlement?: "ok" | "needs_check" | "held" | "attention" | "";
  report?: "open" | "none" | "";
  restriction?: "yes" | "no" | "";
  categoryId?: string;
  region?: string;
  page?: number;
  pageSize?: number;
  /** last_order | created | reports | name */
  sort?: string;
  /** 5-A AB-01 — `stores.store_kind` (real · sample · legacy_test). 빈 값 = 전체. */
  kind?: AdminBusinessStoreKindFilter;
  /** 5-A AB-02 — `stores.is_visible` (yes · no). 빈 값 = 전체. */
  visible?: "yes" | "no" | "";
  /** 5-A AB-03 — 「전체 결과 선택」: 같은 조건의 전체 id 만 돌려준다 (상한 `ADMIN_BUSINESS_SELECT_ALL_MAX`). */
  selectAll?: boolean;
};

export const ADMIN_BUSINESS_STORE_KINDS = ["real", "sample", "legacy_test"] as const;
export type AdminBusinessStoreKind = (typeof ADMIN_BUSINESS_STORE_KINDS)[number];
export type AdminBusinessStoreKindFilter = AdminBusinessStoreKind | "";

/** 「전체 결과 선택」 상한 — 일괄 처리 1회 상한(`ADMIN_STORE_BULK_MAX`)과 같다. */
export const ADMIN_BUSINESS_SELECT_ALL_MAX = 500;

function parseKindFilter(raw: string | null): AdminBusinessStoreKindFilter {
  const v = String(raw ?? "").trim();
  return (ADMIN_BUSINESS_STORE_KINDS as readonly string[]).includes(v) ? (v as AdminBusinessStoreKind) : "";
}

function parseVisibleFilter(raw: string | null): "yes" | "no" | "" {
  const v = String(raw ?? "").trim();
  return v === "yes" || v === "no" ? v : "";
}

/**
 * 주소 → 매장 운영 목록 필터 (`/api/admin/business/ops-list` 와 통합 대시보드 「영업 중 매장」이 같은 해석을 쓴다).
 */
export function parseAdminBusinessListOpsFilters(searchParams: URLSearchParams): AdminBusinessListOpsFilters {
  return {
    q: searchParams.get("q") ?? "",
    approval: searchParams.get("approval") ?? searchParams.get("status") ?? "all",
    openKind: searchParams.get("open") ?? "",
    orderable: (searchParams.get("orderable") as "yes" | "no" | "") || "",
    delivery: (searchParams.get("delivery") as "yes" | "no" | "") || "",
    settlement: (searchParams.get("settlement") as "ok" | "needs_check" | "held" | "attention" | "") || "",
    report: (searchParams.get("report") as "open" | "none" | "") || "",
    restriction: (searchParams.get("restriction") as "yes" | "no" | "") || "",
    categoryId: searchParams.get("category_id") ?? "",
    region: searchParams.get("region") ?? "",
    page: Number(searchParams.get("page") || 1),
    pageSize: Number(searchParams.get("pageSize") || 20),
    sort: searchParams.get("sort") ?? "last_order",
    kind: parseKindFilter(searchParams.get("kind")),
    visible: parseVisibleFilter(searchParams.get("visible")),
    selectAll: searchParams.get("select_all") === "1",
  };
}

export type AdminBusinessListOpsRow = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
  categoryName: string;
  /** List: city only (see formatOpsListCityLine). Detail uses full address line. */
  regionLine: string;
  approvalStatus: string;
  hoursLabel: string | null;
  owner: {
    ok: boolean;
    label: string;
    ownerUserId: string;
    handle: string | null;
  };
  openKind: BusinessOpsOpenKind;
  orderable: boolean;
  deliveryAvailable: boolean | null;
  inProgressOrderCount: number;
  deliveringOrderCount: number;
  todayOrderCount: number;
  /** Sum of payment_amount for orders created today (PHP). */
  todaySalesAmount: number;
  pointBalance: number | null;
  pointCommerceBlocked: boolean;
  settlementKind: BusinessOpsSettlementKind;
  ratingAvg: number | null;
  reviewCount: number;
  openReportCount: number;
  lastOrderAt: string | null;
  salesAllowed: boolean | null;
  isSuspended: boolean;
  createdAt: string | null;
  /** 5-A AB-01 — real · sample · legacy_test (조회 실패·미기록이면 null) */
  storeKind: string | null;
  /** 5-A AB-02 — 고객 앱 노출 여부 */
  isVisible: boolean;
  /** HS-07 — 추천 매장 */
  isFeatured: boolean;
  slug: string | null;
};

export type AdminBusinessListOpsKpi = {
  totalStores: number;
  openNow: number;
  closedNow: number;
  pendingApproval: number;
  restricted: number;
  inProgressOrders: number;
  settlementNeedsCheck: number;
  openReports: number;
  /**
   * 5-A AB-04 — 같은 유형·노출 조건 안에서 샘플·숨김 매장을 뺀 운영 기준 수치.
   * 위 값(전체 수치)과 함께 표시한다.
   */
  operational: {
    totalStores: number;
    openNow: number;
    closedNow: number;
    pendingApproval: number;
    restricted: number;
  };
};

export type AdminBusinessListSelectAllResult = {
  ok: true;
  ids: string[];
  total: number;
  truncated: boolean;
  max: number;
};

export type AdminBusinessListOpsResult = {
  ok: true;
  stores: AdminBusinessListOpsRow[];
  total: number;
  page: number;
  pageSize: number;
  kpi: AdminBusinessListOpsKpi;
  filterOptions: {
    categories: { id: string; name: string }[];
    regions: string[];
  };
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function startOfLocalDayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function parsePage(raw: number | undefined): number {
  const n = Math.floor(Number(raw) || 1);
  return n < 1 ? 1 : n;
}

function parsePageSize(raw: number | undefined): number {
  const n = Math.floor(Number(raw) || DEFAULT_PAGE_SIZE);
  return Math.min(MAX_PAGE_SIZE, Math.max(1, n));
}

type LightStore = {
  id: string;
  is_open: boolean | null;
  business_hours_json: unknown;
  approval_status: string;
  point_commerce_blocked: boolean | null;
  owner_user_id: string;
  delivery_available: boolean | null;
  region: string | null;
  city: string | null;
  store_category_id: string | null;
  created_at: string | null;
  store_name: string | null;
};

/** 매장 한 행 = 판정 재료 + 판매 권한·수수료 신호·신고·주문 사실 (DB `admin_business_ops_store_scan`). */
type ScanStore = LightStore & {
  has_sales_permission: boolean;
  allowed_to_sell: boolean | null;
  sales_status: string | null;
  settle_outstanding: boolean;
  settle_review_required: boolean;
  open_report_count: number;
  last_order_at: string | null;
  in_progress_order_count: number;
  delivering_order_count: number;
  q_match: boolean;
};

export const ADMIN_BUSINESS_OPS_STORE_SCAN_RPC = "admin_business_ops_store_scan";

/**
 * 전 매장 1회 조회 (R7) — 상한 없음, jsonb 한 값이라 PostgREST 행 상한과도 무관.
 * 영업 중 판정은 공개 매장 계약(TS `presentStoreOpenKind`) 그대로 쓰므로 판정 재료를 전 매장에 대해 받는다.
 * 실패하면 부분 결과로 KPI·목록을 만들지 않고 오류를 돌려준다.
 */
async function scanAllStores(
  sb: SupabaseClient,
  qText: string
): Promise<
  | { ok: true; stores: ScanStore[]; total: number; categories: { id: string; name: string }[] }
  | { ok: false; error: string }
> {
  const { data, error } = await sb.rpc(ADMIN_BUSINESS_OPS_STORE_SCAN_RPC, {
    p_q: qText ? qText.slice(0, 80) : null,
    p_in_progress_statuses: [...BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES],
    p_delivering_statuses: [...BUSINESS_OPS_DELIVERING_ORDER_STATUSES],
  });
  if (error) {
    console.error("[admin-business-list] store scan", error.message);
    return { ok: false, error: "db_error" };
  }
  const payload = (data ?? {}) as { total?: unknown; rows?: unknown; categories?: unknown };
  const rows = (Array.isArray(payload.rows) ? payload.rows : []) as Record<string, unknown>[];
  const total = Math.max(0, Math.floor(Number(payload.total) || 0));
  if (rows.length !== total) {
    // 전수 계약 — 잘린 응답으로 KPI(영업 중 매장)를 만들지 않는다.
    return { ok: false, error: "store_scan_incomplete" };
  }
  const str = (v: unknown) => (v == null ? null : String(v));
  const stores = rows.map((r) => ({
    id: String(r.id ?? ""),
    store_name: str(r.store_name),
    is_open: typeof r.is_open === "boolean" ? r.is_open : null,
    business_hours_json: r.business_hours_json ?? null,
    approval_status: String(r.approval_status ?? ""),
    point_commerce_blocked: typeof r.point_commerce_blocked === "boolean" ? r.point_commerce_blocked : null,
    owner_user_id: String(r.owner_user_id ?? ""),
    delivery_available: typeof r.delivery_available === "boolean" ? r.delivery_available : null,
    region: str(r.region),
    city: str(r.city),
    store_category_id: str(r.store_category_id),
    created_at: str(r.created_at),
    has_sales_permission: r.has_sales_permission === true,
    allowed_to_sell: typeof r.allowed_to_sell === "boolean" ? r.allowed_to_sell : null,
    sales_status: str(r.sales_status),
    settle_outstanding: r.settle_outstanding === true,
    settle_review_required: r.settle_review_required === true,
    open_report_count: Math.max(0, Math.floor(Number(r.open_report_count) || 0)),
    last_order_at: str(r.last_order_at),
    in_progress_order_count: Math.max(0, Math.floor(Number(r.in_progress_order_count) || 0)),
    delivering_order_count: Math.max(0, Math.floor(Number(r.delivering_order_count) || 0)),
    q_match: r.q_match !== false,
  }));
  const categories = (Array.isArray(payload.categories) ? (payload.categories as Record<string, unknown>[]) : [])
    .map((c) => ({ id: String(c.id ?? ""), name: String(c.name ?? "") }))
    .filter((c) => c.id && c.name);
  return { ok: true, stores, total, categories };
}

/** 오늘 주문 (쪽 매장만) — PostgREST 응답 상한과 무관하게 끝까지 읽는다. */
async function loadTodayOrdersForStores(
  sb: SupabaseClient,
  storeIds: string[],
  dayStart: string
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await sb
      .from("store_orders")
      .select(`id, store_id, ${CONFIRMED_SALE_REVENUE_ORDER_SELECT}`)
      .in("store_id", storeIds)
      .gte("created_at", dayStart)
      .order("id", { ascending: true })
      .range(from, from + step - 1);
    if (error) {
      console.error("[admin-business-list] today orders", error.message);
      return out;
    }
    const batch = (data ?? []) as Record<string, unknown>[];
    out.push(...batch);
    if (batch.length < step) return out;
  }
}

type StoreKindVisibility = {
  storeKind: string | null;
  isVisible: boolean;
  isFeatured: boolean;
  slug: string | null;
};

/**
 * 5-A — 전 매장 유형·노출·추천 (scan RPC 에 없는 컬럼 · 스키마 변경 없이 별도 1회 조회).
 * PostgREST 응답 상한과 무관하게 끝까지 읽는다. 실패하면 부분 결과로 필터·KPI 를 만들지 않는다.
 */
async function loadStoreKindVisibility(
  sb: SupabaseClient
): Promise<{ ok: true; map: Map<string, StoreKindVisibility> } | { ok: false; error: string }> {
  const map = new Map<string, StoreKindVisibility>();
  const step = 1000;
  for (let from = 0; ; from += step) {
    const { data, error } = await sb
      .from("stores")
      .select("id, store_kind, is_visible, is_featured, slug")
      .order("id", { ascending: true })
      .range(from, from + step - 1);
    if (error) {
      console.error("[admin-business-list] store kind/visibility", error.message);
      return { ok: false, error: "db_error" };
    }
    const batch = (data ?? []) as Record<string, unknown>[];
    for (const r of batch) {
      const id = String(r.id ?? "");
      if (!id) continue;
      map.set(id, {
        storeKind: typeof r.store_kind === "string" ? r.store_kind : null,
        isVisible: r.is_visible === true,
        isFeatured: r.is_featured === true,
        slug: typeof r.slug === "string" ? r.slug : null,
      });
    }
    if (batch.length < step) return { ok: true, map };
  }
}

const NO_KIND_VISIBILITY: StoreKindVisibility = { storeKind: null, isVisible: false, isFeatured: false, slug: null };

/** 유형·노출 필터 판정 (목록·KPI·전체 결과 선택 공용). */
export function matchesAdminBusinessKindVisibility(
  meta: { storeKind: string | null; isVisible: boolean },
  filters: Pick<AdminBusinessListOpsFilters, "kind" | "visible">
): boolean {
  if (filters.kind && meta.storeKind !== filters.kind) return false;
  if (filters.visible === "yes" && !meta.isVisible) return false;
  if (filters.visible === "no" && meta.isVisible) return false;
  return true;
}

/** 운영 기준 = 샘플 아님 + 노출 중. */
export function isAdminBusinessOperationalStore(meta: { storeKind: string | null; isVisible: boolean }): boolean {
  return meta.storeKind !== "sample" && meta.isVisible;
}

function isRestrictedStore(
  row: LightStore,
  salesByStore: Map<string, { allowed: boolean; status: string }>
): boolean {
  if (String(row.approval_status ?? "") === "suspended") return true;
  if (row.point_commerce_blocked === true) return true;
  const sales = salesByStore.get(row.id);
  if (!sales) return false;
  if (sales.allowed === false) return true;
  if (sales.status === "suspended" || sales.status === "rejected") return true;
  return false;
}

/** 매장 운영 목록 한 쪽 + KPI (`selectAll` 은 무시 — 전체 결과 id 는 `loadAdminBusinessListSelectAllIds`). */
export async function loadAdminBusinessListOps(
  sb: SupabaseClient,
  filters: AdminBusinessListOpsFilters
): Promise<AdminBusinessListOpsResult | { ok: false; error: string }> {
  const res = await loadAdminBusinessListOpsCore(sb, { ...filters, selectAll: false });
  if (res.ok && "ids" in res) return { ok: false, error: "unexpected_select_all" };
  return res;
}

/** 5-A AB-03 — 같은 조건(필터·검색·정렬)의 전체 결과 id (상한 `ADMIN_BUSINESS_SELECT_ALL_MAX`, 페이지 무관). */
export async function loadAdminBusinessListSelectAllIds(
  sb: SupabaseClient,
  filters: AdminBusinessListOpsFilters
): Promise<AdminBusinessListSelectAllResult | { ok: false; error: string }> {
  const res = await loadAdminBusinessListOpsCore(sb, { ...filters, selectAll: true });
  if (res.ok && !("ids" in res)) return { ok: false, error: "unexpected_page_result" };
  return res;
}

async function loadAdminBusinessListOpsCore(
  sb: SupabaseClient,
  filters: AdminBusinessListOpsFilters
): Promise<AdminBusinessListOpsResult | AdminBusinessListSelectAllResult | { ok: false; error: string }> {
  const page = parsePage(filters.page);
  const pageSize = parsePageSize(filters.pageSize);
  const qRaw = String(filters.q ?? "").trim();
  const qText = qRaw.replace(/^@+/, "").trim();
  const now = new Date();
  const dayStart = startOfLocalDayIso();

  const kindVisibilityFiltered = Boolean(filters.kind) || Boolean(filters.visible);
  const [scan, inProgRes, kindVis] = await Promise.all([
    scanAllStores(sb, qText && !UUID_RE.test(qText) ? qText : ""),
    sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .in("order_status", [...BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES]),
    loadStoreKindVisibility(sb),
  ]);
  if (!scan.ok) return scan;
  if (!kindVis.ok) return kindVis;
  const metaOf = (id: string): StoreKindVisibility => kindVis.map.get(id) ?? NO_KIND_VISIBILITY;
  const light: ScanStore[] = scan.stores;
  /** 5-A AB-04 — KPI 는 유형·노출 필터를 따른다 (다른 필터는 KPI 칩 자체라 적용하지 않음). */
  const kpiBase = light.filter((row) => matchesAdminBusinessKindVisibility(metaOf(row.id), filters));

  const salesByStore = new Map<string, { allowed: boolean; status: string }>();
  const settleStatusesByStore = new Map<string, string[]>();
  const openReportStores = new Set<string>();
  const openReportCountGlobal = new Map<string, number>();
  const lastOrderGlobal = new Map<string, string>();
  for (const row of light) {
    if (row.has_sales_permission) {
      salesByStore.set(row.id, {
        allowed: Boolean(row.allowed_to_sell),
        status: String(row.sales_status ?? ""),
      });
    }
    const signals = storeCommissionAttentionSignals({
      fee_outstanding_minor: row.settle_outstanding ? 1 : 0,
      adjustment_status: row.settle_review_required ? "review_required" : "",
    });
    if (signals.length) settleStatusesByStore.set(row.id, signals);
    if (row.open_report_count > 0) {
      openReportStores.add(row.id);
      openReportCountGlobal.set(row.id, row.open_report_count);
    }
    if (row.last_order_at) lastOrderGlobal.set(row.id, row.last_order_at);
  }

  const openKindById = new Map<string, BusinessOpsOpenKind>();
  for (const row of light) {
    openKindById.set(row.id, presentStoreOpenKind(row.business_hours_json, row.is_open, now).kind);
  }

  let matched = kpiBase.filter((row) => {
    if (filters.approval && filters.approval !== "all") {
      // DEF-14: 「처리 필요」(actionable) = 심사 대기 계열 (pending · under_review · revision_requested)
      if (filters.approval === "pending_family" || filters.approval === "actionable") {
        if (
          !(BUSINESS_OPS_PENDING_APPROVAL as readonly string[]).includes(
            String(row.approval_status ?? "")
          )
        ) {
          return false;
        }
      } else if (String(row.approval_status ?? "") !== filters.approval) {
        return false;
      }
    }
    if (filters.categoryId) {
      if (String(row.store_category_id ?? "") !== filters.categoryId) return false;
    }
    if (filters.region) {
      const regionHit =
        String(row.region ?? "").trim() === filters.region ||
        String(row.city ?? "").trim() === filters.region;
      if (!regionHit) return false;
    }
    if (filters.delivery === "yes" && row.delivery_available !== true) return false;
    if (filters.delivery === "no" && row.delivery_available !== false) return false;
    if (filters.openKind) {
      if (openKindById.get(row.id) !== filters.openKind) return false;
    }
    if (filters.orderable === "yes" && openKindById.get(row.id) !== "open") return false;
    if (filters.orderable === "no" && openKindById.get(row.id) === "open") return false;
    if (filters.restriction === "yes" && !isRestrictedStore(row, salesByStore)) return false;
    if (filters.restriction === "no" && isRestrictedStore(row, salesByStore)) return false;
    if (filters.report === "open" && !openReportStores.has(row.id)) return false;
    if (filters.report === "none" && openReportStores.has(row.id)) return false;
    if (filters.settlement) {
      const kind = presentSettlementKind(settleStatusesByStore.get(row.id) ?? []);
      if (filters.settlement === "attention") {
        if (kind === "ok") return false;
      } else if (kind !== filters.settlement) {
        return false;
      }
    }
    if (qText) {
      if (UUID_RE.test(qText)) {
        if (row.id.toLowerCase() !== qText.toLowerCase()) return false;
      } else if (!row.q_match) {
        // 이름·slug·사장님(표시명·닉네임·아이디) 검색 — DB 가 전 매장에 대해 판정 (후보 상한 없음)
        return false;
      }
    }
    return true;
  });

  const isPending = (r: LightStore) =>
    (BUSINESS_OPS_PENDING_APPROVAL as readonly string[]).includes(String(r.approval_status ?? ""));
  const operationalBase = kpiBase.filter((r) => isAdminBusinessOperationalStore(metaOf(r.id)));
  const kpi: AdminBusinessListOpsKpi = {
    totalStores: kpiBase.length,
    openNow: kpiBase.filter((r) => openKindById.get(r.id) === "open").length,
    closedNow: kpiBase.filter((r) => openKindById.get(r.id) === "closed").length,
    pendingApproval: kpiBase.filter(isPending).length,
    restricted: kpiBase.filter((r) => isRestrictedStore(r, salesByStore)).length,
    // 유형·노출 필터가 없으면 전체 진행 주문 수(기존 계약), 있으면 해당 매장들의 진행 주문 합계
    inProgressOrders: kindVisibilityFiltered
      ? kpiBase.reduce((sum, r) => sum + r.in_progress_order_count, 0)
      : Math.max(0, Math.floor(Number(inProgRes.count) || 0)),
    settlementNeedsCheck: kpiBase.filter((r) => settleStatusesByStore.has(r.id)).length,
    openReports: kpiBase.filter((r) => openReportStores.has(r.id)).length,
    operational: {
      totalStores: operationalBase.length,
      openNow: operationalBase.filter((r) => openKindById.get(r.id) === "open").length,
      closedNow: operationalBase.filter((r) => openKindById.get(r.id) === "closed").length,
      pendingApproval: operationalBase.filter(isPending).length,
      restricted: operationalBase.filter((r) => isRestrictedStore(r, salesByStore)).length,
    },
  };

  const sortKey = String(filters.sort ?? "last_order").trim() || "last_order";
  matched = [...matched].sort((a, b) => {
    if (sortKey === "name") {
      return String(a.store_name ?? "").localeCompare(String(b.store_name ?? ""), "ko");
    }
    if (sortKey === "created") {
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    }
    if (sortKey === "reports") {
      return (openReportCountGlobal.get(b.id) ?? 0) - (openReportCountGlobal.get(a.id) ?? 0);
    }
    // last_order default
    const la = lastOrderGlobal.get(a.id) ?? "";
    const lb = lastOrderGlobal.get(b.id) ?? "";
    if (la === lb) return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    return lb.localeCompare(la);
  });

  // When KPI filter "closed" — treat closed+break+temp as closed bucket for KPI click
  // openKind filter already exact; closed KPI uses openKind=closed via UI mapping of non-open

  const total = matched.length;

  if (filters.selectAll) {
    const ids = matched.slice(0, ADMIN_BUSINESS_SELECT_ALL_MAX).map((r) => r.id);
    return { ok: true, ids, total, truncated: total > ids.length, max: ADMIN_BUSINESS_SELECT_ALL_MAX };
  }

  const offset = (page - 1) * pageSize;
  const pageLight = matched.slice(offset, offset + pageSize);
  const pageIds = pageLight.map((r) => r.id);

  if (pageIds.length === 0) {
    const regions = [
      ...new Set(
        light
          .map((r) => String(r.region ?? r.city ?? "").trim())
          .filter(Boolean)
      ),
    ].sort();
    return {
      ok: true,
      stores: [],
      total,
      page,
      pageSize,
      kpi,
      filterOptions: {
        categories: scan.categories,
        regions,
      },
    };
  }

  const selectAttempts = [
    [
      "id, store_name, slug, owner_user_id, approval_status, is_visible, is_open",
      "store_category_id, store_topic_id, profile_image_url, region, city, district",
      "delivery_available, pickup_available, business_hours_json",
      "point_balance, point_commerce_blocked, rating_avg, review_count",
      "created_at, updated_at, suspended_reason",
      "store_categories ( name, name_en, slug ), store_topics ( name, name_en, slug )",
    ].join(", "),
    [
      "id, store_name, slug, owner_user_id, approval_status, is_visible, is_open",
      "store_category_id, store_topic_id, profile_image_url, region, city, district",
      "delivery_available, pickup_available, business_hours_json",
      "created_at, updated_at, suspended_reason",
      "store_categories ( name ), store_topics ( name )",
    ].join(", "),
  ] as const;

  let storeRows: Record<string, unknown>[] = [];
  let lastErr: string | null = null;
  for (const sel of selectAttempts) {
    const res = await sb.from("stores").select(sel).in("id", pageIds);
    if (!res.error) {
      storeRows = (res.data ?? []) as unknown as Record<string, unknown>[];
      lastErr = null;
      break;
    }
    lastErr = res.error.message;
  }
  if (lastErr) {
    return { ok: false, error: lastErr };
  }

  const byId = new Map(storeRows.map((r) => [String(r.id), r]));
  const ownerIds = [
    ...new Set(
      pageLight
        .map((r) => String(r.owner_user_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  const [profRes, todayRows, coinBalRes] = await Promise.all([
    ownerIds.length
      ? sb
          .from("profiles")
          .select("id, display_name, nickname, username")
          .in("id", ownerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    loadTodayOrdersForStores(sb, pageIds, dayStart),
    // Canonical Coin balance — never stores.point_balance (SCHEMA_LEGACY).
    sb
      .from(STORE_ECONOMIC_POINT_ACCOUNTS_TABLE)
      .select("store_id, balance")
      .in("store_id", pageIds),
  ]);

  const profById = new Map<string, Record<string, unknown>>();
  for (const p of profRes.data ?? []) {
    profById.set(String((p as { id?: unknown }).id ?? ""), p as Record<string, unknown>);
  }

  const coinBalanceByStore = new Map<string, number>();
  for (const row of coinBalRes.data ?? []) {
    const sid = String((row as { store_id?: unknown }).store_id ?? "").trim();
    if (!sid) continue;
    // Preserve signed Coin (F-05 merchant debt may be negative).
    coinBalanceByStore.set(sid, Math.trunc(Number((row as { balance?: unknown }).balance) || 0));
  }

  const countBy = (rows: unknown[] | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const sid = String((r as { store_id?: unknown }).store_id ?? "");
      if (!sid) continue;
      m.set(sid, (m.get(sid) ?? 0) + 1);
    }
    return m;
  };

  const todayBy = countBy(todayRows);

  const todaySalesBy = new Map<string, number>();
  for (const r of todayRows) {
    const sid = String((r as { store_id?: unknown }).store_id ?? "");
    if (!sid) continue;
    const amt = confirmedSaleRevenuePhp(r as ConfirmedSaleRevenueOrderSnapshot);
    todaySalesBy.set(sid, (todaySalesBy.get(sid) ?? 0) + amt);
  }

  const stores: AdminBusinessListOpsRow[] = pageLight.map((lightRow) => {
    const full = byId.get(lightRow.id) ?? {};
    const ownerUserId = String(full.owner_user_id ?? lightRow.owner_user_id ?? "").trim();
    const prof = ownerUserId ? profById.get(ownerUserId) : undefined;
    const ownerIdRes = resolveBusinessOpsOwnerIdentity({
      ownerUserId,
      displayName: typeof prof?.display_name === "string" ? prof.display_name : null,
      nickname: typeof prof?.nickname === "string" ? prof.nickname : null,
      username: typeof prof?.username === "string" ? prof.username : null,
    });
    const hoursJson = full.business_hours_json ?? lightRow.business_hours_json;
    const openKind =
      openKindById.get(lightRow.id) ??
      presentStoreOpenKind(hoursJson, full.is_open as boolean | null, now).kind;
    const sales = salesByStore.get(lightRow.id);
    const pointBalance = coinBalanceByStore.has(lightRow.id)
      ? (coinBalanceByStore.get(lightRow.id) as number)
      : null;
    const ratingRaw = full.rating_avg;
    const ratingAvg =
      ratingRaw == null || ratingRaw === ""
        ? null
        : Number.isFinite(Number(ratingRaw))
          ? Number(ratingRaw)
          : null;

    return {
      id: lightRow.id,
      storeName: String(full.store_name ?? lightRow.store_name ?? "").trim(),
      profileImageUrl:
        typeof full.profile_image_url === "string" ? full.profile_image_url : null,
      categoryName: taxonomyName(
        full.store_categories as
          | { name?: string | null }
          | { name?: string | null }[]
          | null
      ),
      regionLine: formatOpsListCityLine({
        city: typeof full.city === "string" ? full.city : lightRow.city,
        region: typeof full.region === "string" ? full.region : lightRow.region,
      }),
      approvalStatus: String(full.approval_status ?? lightRow.approval_status ?? ""),
      hoursLabel: hoursLabelFromBusinessHoursJson(hoursJson),
      owner: {
        ok: ownerIdRes.ok,
        label: ownerIdRes.ok ? ownerIdRes.label : "",
        ownerUserId,
        handle: ownerIdRes.ok ? ownerIdRes.handle : null,
      },
      openKind,
      orderable: openKind === "open",
      deliveryAvailable:
        typeof full.delivery_available === "boolean"
          ? full.delivery_available
          : lightRow.delivery_available,
      inProgressOrderCount: lightRow.in_progress_order_count,
      deliveringOrderCount: lightRow.delivering_order_count,
      todayOrderCount: todayBy.get(lightRow.id) ?? 0,
      todaySalesAmount: todaySalesBy.get(lightRow.id) ?? 0,
      pointBalance,
      pointCommerceBlocked:
        full.point_commerce_blocked === true || lightRow.point_commerce_blocked === true,
      settlementKind: presentSettlementKind(settleStatusesByStore.get(lightRow.id) ?? []),
      ratingAvg,
      reviewCount: Math.max(0, Math.floor(Number(full.review_count) || 0)),
      openReportCount: lightRow.open_report_count,
      lastOrderAt: lightRow.last_order_at,
      salesAllowed: sales ? sales.allowed : null,
      isSuspended: String(full.approval_status ?? lightRow.approval_status) === "suspended",
      createdAt: lightRow.created_at,
      storeKind: metaOf(lightRow.id).storeKind,
      isVisible:
        typeof full.is_visible === "boolean" ? full.is_visible : metaOf(lightRow.id).isVisible,
      isFeatured: metaOf(lightRow.id).isFeatured,
      slug: typeof full.slug === "string" ? full.slug : metaOf(lightRow.id).slug,
    };
  });

  const regions = [
    ...new Set(
      light
        .map((r) => String(r.region ?? r.city ?? "").trim())
        .filter(Boolean)
    ),
  ].sort();

  return {
    ok: true,
    stores,
    total,
    page,
    pageSize,
    kpi,
    filterOptions: {
      categories: scan.categories,
      regions,
    },
  };
}
