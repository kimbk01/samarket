/**
 * Admin Business list — ops control plane read model.
 * Pagination + KPI from existing tables. No parallel SSOT.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BUSINESS_OPS_DELIVERING_ORDER_STATUSES,
  BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES,
  BUSINESS_OPS_PENDING_APPROVAL,
  formatRegionLine,
  hoursLabelFromBusinessHoursJson,
  presentSettlementKind,
  presentStoreOpenKind,
  resolveBusinessOpsOwnerIdentity,
  taxonomyName,
  type BusinessOpsOpenKind,
  type BusinessOpsSettlementKind,
} from "@/lib/admin-business/business-ops-presentation";

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
};

export type AdminBusinessListOpsRow = {
  id: string;
  storeName: string;
  profileImageUrl: string | null;
  categoryName: string;
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

async function loadOwnerIdsMatchingQ(
  sb: SupabaseClient,
  q: string
): Promise<string[]> {
  const qSafe = q.replace(/%/g, "\\%").slice(0, 80);
  if (!qSafe) return [];
  const { data, error } = await sb
    .from("profiles")
    .select("id")
    .or(
      `display_name.ilike.%${qSafe}%,nickname.ilike.%${qSafe}%,username.ilike.%${qSafe}%`
    )
    .limit(200);
  if (error) {
    console.error("[admin-business-list] owner search", error.message);
    return [];
  }
  return (data ?? [])
    .map((r) => String((r as { id?: unknown }).id ?? "").trim())
    .filter(Boolean);
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

async function scanAllLightStores(sb: SupabaseClient): Promise<LightStore[]> {
  const out: LightStore[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 50_000; from += pageSize) {
    const { data, error } = await sb
      .from("stores")
      .select(
        "id, store_name, is_open, business_hours_json, approval_status, point_commerce_blocked, owner_user_id, delivery_available, region, city, store_category_id, created_at"
      )
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("[admin-business-list] light scan", error.message);
      break;
    }
    const batch = (data ?? []) as LightStore[];
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
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

export async function loadAdminBusinessListOps(
  sb: SupabaseClient,
  filters: AdminBusinessListOpsFilters
): Promise<AdminBusinessListOpsResult | { ok: false; error: string }> {
  const page = parsePage(filters.page);
  const pageSize = parsePageSize(filters.pageSize);
  const qRaw = String(filters.q ?? "").trim();
  const qText = qRaw.replace(/^@+/, "").trim();
  const now = new Date();
  const dayStart = startOfLocalDayIso();

  const light = await scanAllLightStores(sb);

  const [salesRes, settleRes, reportRes, inProgRes, catRes] = await Promise.all([
    sb
      .from("store_sales_permissions")
      .select("store_id, allowed_to_sell, sales_status")
      .limit(10_000),
    sb
      .from("store_settlements")
      .select("store_id, settlement_status")
      .in("settlement_status", ["held", "pending", "processing", "scheduled"])
      .limit(10_000),
    sb
      .from("store_reports")
      .select("store_id")
      .eq("status", "open")
      .limit(10_000),
    sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .in("order_status", [...BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES]),
    sb
      .from("store_categories")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(200),
  ]);

  const salesByStore = new Map<string, { allowed: boolean; status: string }>();
  for (const p of salesRes.data ?? []) {
    const sid = String((p as { store_id?: unknown }).store_id ?? "");
    if (!sid) continue;
    salesByStore.set(sid, {
      allowed: Boolean((p as { allowed_to_sell?: unknown }).allowed_to_sell),
      status: String((p as { sales_status?: unknown }).sales_status ?? ""),
    });
  }

  const settleStatusesByStore = new Map<string, string[]>();
  if (!settleRes.error) {
    for (const r of settleRes.data ?? []) {
      const sid = String((r as { store_id?: unknown }).store_id ?? "");
      const st = String((r as { settlement_status?: unknown }).settlement_status ?? "");
      if (!sid || !st) continue;
      const arr = settleStatusesByStore.get(sid) ?? [];
      arr.push(st);
      settleStatusesByStore.set(sid, arr);
    }
  }

  const openReportStores = new Set<string>();
  const openReportCountGlobal = new Map<string, number>();
  if (!reportRes.error) {
    for (const r of reportRes.data ?? []) {
      const sid = String((r as { store_id?: unknown }).store_id ?? "");
      if (!sid) continue;
      openReportStores.add(sid);
      openReportCountGlobal.set(sid, (openReportCountGlobal.get(sid) ?? 0) + 1);
    }
  }

  const openKindById = new Map<string, BusinessOpsOpenKind>();
  for (const row of light) {
    openKindById.set(row.id, presentStoreOpenKind(row.business_hours_json, row.is_open, now).kind);
  }

  let ownerIdsFromQ: string[] = [];
  if (qText && !UUID_RE.test(qText)) {
    ownerIdsFromQ = await loadOwnerIdsMatchingQ(sb, qText);
  }

  let matched = light.filter((row) => {
    if (filters.approval && filters.approval !== "all") {
      if (filters.approval === "pending_family") {
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
      } else {
        // Name match needs store_name — loaded on page enrich; prefilter by owner id only here.
        // Full name filter applied after page select if q present — see below via id set from DB.
      }
    }
    return true;
  });

  // Name / slug search: query DB for matching ids when q is not UUID
  if (qText && !UUID_RE.test(qText)) {
    const qSafe = qText.replace(/%/g, "\\%").slice(0, 80);
    const { data: nameHits, error: nameErr } = await sb
      .from("stores")
      .select("id")
      .or(`store_name.ilike.%${qSafe}%,slug.ilike.%${qSafe}%`)
      .limit(2000);
    if (nameErr) {
      console.error("[admin-business-list] name search", nameErr.message);
    }
    const nameIds = new Set(
      (nameHits ?? []).map((r) => String((r as { id?: unknown }).id ?? "")).filter(Boolean)
    );
    for (const oid of ownerIdsFromQ) {
      for (const row of light) {
        if (row.owner_user_id === oid) nameIds.add(row.id);
      }
    }
    matched = matched.filter((r) => nameIds.has(r.id));
  }

  const kpi: AdminBusinessListOpsKpi = {
    totalStores: light.length,
    openNow: light.filter((r) => openKindById.get(r.id) === "open").length,
    closedNow: light.filter((r) => openKindById.get(r.id) === "closed").length,
    pendingApproval: light.filter((r) =>
      (BUSINESS_OPS_PENDING_APPROVAL as readonly string[]).includes(
        String(r.approval_status ?? "")
      )
    ).length,
    restricted: light.filter((r) => isRestrictedStore(r, salesByStore)).length,
    inProgressOrders: Math.max(0, Math.floor(Number(inProgRes.count) || 0)),
    settlementNeedsCheck: [...settleStatusesByStore.keys()].length,
    openReports: openReportStores.size,
  };

  // Last-order map for sort (recent orders scan)
  const lastOrderGlobal = new Map<string, string>();
  {
    const { data: recentOrders } = await sb
      .from("store_orders")
      .select("store_id, created_at")
      .order("created_at", { ascending: false })
      .limit(8000);
    for (const r of recentOrders ?? []) {
      const sid = String((r as { store_id?: unknown }).store_id ?? "");
      const at = String((r as { created_at?: unknown }).created_at ?? "");
      if (!sid || !at || lastOrderGlobal.has(sid)) continue;
      lastOrderGlobal.set(sid, at);
    }
  }

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
        categories: (catRes.data ?? []).map((c) => ({
          id: String((c as { id?: unknown }).id ?? ""),
          name: String((c as { name?: unknown }).name ?? ""),
        })).filter((c) => c.id && c.name),
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

  const [
    profRes,
    orderAggRes,
    deliveringRes,
    todayRes,
    lastOrderRes,
    reportCountRes,
  ] = await Promise.all([
    ownerIds.length
      ? sb
          .from("profiles")
          .select("id, display_name, nickname, username")
          .in("id", ownerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    sb
      .from("store_orders")
      .select("store_id")
      .in("store_id", pageIds)
      .in("order_status", [...BUSINESS_OPS_IN_PROGRESS_ORDER_STATUSES]),
    sb
      .from("store_orders")
      .select("store_id")
      .in("store_id", pageIds)
      .in("order_status", [...BUSINESS_OPS_DELIVERING_ORDER_STATUSES]),
    sb
      .from("store_orders")
      .select("store_id, payment_amount")
      .in("store_id", pageIds)
      .gte("created_at", dayStart),
    sb
      .from("store_orders")
      .select("store_id, created_at")
      .in("store_id", pageIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(500, pageIds.length * 5)),
    sb
      .from("store_reports")
      .select("store_id")
      .in("store_id", pageIds)
      .eq("status", "open"),
  ]);

  const profById = new Map<string, Record<string, unknown>>();
  for (const p of profRes.data ?? []) {
    profById.set(String((p as { id?: unknown }).id ?? ""), p as Record<string, unknown>);
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

  const inProgBy = countBy(orderAggRes.data as unknown[]);
  const deliveringBy = countBy(deliveringRes.data as unknown[]);
  const todayBy = countBy(todayRes.data as unknown[]);
  const openRepBy = countBy(reportCountRes.data as unknown[]);

  const todaySalesBy = new Map<string, number>();
  for (const r of todayRes.data ?? []) {
    const sid = String((r as { store_id?: unknown }).store_id ?? "");
    if (!sid) continue;
    const amt = Math.round(Number((r as { payment_amount?: unknown }).payment_amount) || 0);
    todaySalesBy.set(sid, (todaySalesBy.get(sid) ?? 0) + Math.max(0, amt));
  }

  const lastOrderBy = new Map<string, string>();
  for (const r of lastOrderRes.data ?? []) {
    const sid = String((r as { store_id?: unknown }).store_id ?? "");
    const at = String((r as { created_at?: unknown }).created_at ?? "");
    if (!sid || !at || lastOrderBy.has(sid)) continue;
    lastOrderBy.set(sid, at);
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
    const pointRaw = full.point_balance;
    const pointBalance =
      pointRaw == null || pointRaw === ""
        ? null
        : Math.max(0, Math.floor(Number(pointRaw) || 0));
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
      regionLine: formatRegionLine({
        region: typeof full.region === "string" ? full.region : lightRow.region,
        city: typeof full.city === "string" ? full.city : lightRow.city,
        district: typeof full.district === "string" ? full.district : null,
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
      inProgressOrderCount: inProgBy.get(lightRow.id) ?? 0,
      deliveringOrderCount: deliveringBy.get(lightRow.id) ?? 0,
      todayOrderCount: todayBy.get(lightRow.id) ?? 0,
      todaySalesAmount: todaySalesBy.get(lightRow.id) ?? 0,
      pointBalance,
      pointCommerceBlocked:
        full.point_commerce_blocked === true || lightRow.point_commerce_blocked === true,
      settlementKind: presentSettlementKind(settleStatusesByStore.get(lightRow.id) ?? []),
      ratingAvg,
      reviewCount: Math.max(0, Math.floor(Number(full.review_count) || 0)),
      openReportCount: openRepBy.get(lightRow.id) ?? 0,
      lastOrderAt: lastOrderBy.get(lightRow.id) ?? lastOrderGlobal.get(lightRow.id) ?? null,
      salesAllowed: sales ? sales.allowed : null,
      isSuspended: String(full.approval_status ?? lightRow.approval_status) === "suspended",
      createdAt: lightRow.created_at,
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
      categories: (catRes.data ?? [])
        .map((c) => ({
          id: String((c as { id?: unknown }).id ?? ""),
          name: String((c as { name?: unknown }).name ?? ""),
        }))
        .filter((c) => c.id && c.name),
      regions,
    },
  };
}
