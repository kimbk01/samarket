import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";
import {
  loadOwnerMasterAddressBookMap,
} from "@/lib/admin/load-owner-address-book-for-stores";
import {
  parseStoredAddressBookPresentation,
  type AddressBookCardPresentation,
} from "@/lib/addresses/address-book-card-presentation";
import { ADMIN_ACTIONABLE_STORE_APPROVAL } from "@/lib/admin/admin-ops-actionable-status";
import { applyStoreApprovalStatusFilter } from "@/lib/admin/metrics/admin-metric-filters";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_STORES_COUNT_STATUSES,
  buildAdminStoresSearchOrFilter,
  buildAdminStoresStatusCounts,
  parseAdminStoresPaging,
  sanitizeAdminStoresSearchTerm,
  parseAdminStoresExtraFilters,
  applyAdminStoresExtraFilters,
  summarizeAdminStoreMenuStats,
  summarizeAdminStoreAdLinks,
  ADMIN_STORES_SELECT_ALL_MAX,
  type AdminStoresExtraFilters,
  type AdminStoresPaging,
} from "@/lib/admin-business/admin-stores-list-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let adminStoresSelectAttemptStart = 0;

/** 관리자: 매장 목록 + 판매권한 요약 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status")?.trim();
  const qRaw = searchParams.get("q")?.trim() ?? "";
  const qText = qRaw.replace(/^@+/, "").trim();

  // FD2: Production has no stores.applicant_nickname — never select it.
  // Nickname comes from profiles join below (same as /api/me/stores).
  const selectAttempts = [
    [
      "id, store_name, slug, owner_user_id, approval_status, is_visible, business_type, store_kind",
      "store_category_id, store_topic_id, owner_can_edit_store_identity",
      "description, application_request_note, application_address_book, kakao_id, phone, email, website_url, region, city, district",
      "address_line1, address_line2, lat, lng, delivery_radius_km, profile_image_url",
      "created_at, updated_at, approved_at, rejected_reason, revision_note, suspended_reason",
      "store_categories ( name, name_en, slug ), store_topics ( name, name_en, slug )",
    ].join(", "),
    [
      "id, store_name, slug, owner_user_id, approval_status, is_visible, business_type, store_kind",
      "store_category_id, store_topic_id, owner_can_edit_store_identity",
      "description, kakao_id, phone, email, website_url, region, city, district",
      "address_line1, address_line2, lat, lng, delivery_radius_km, profile_image_url",
      "created_at, updated_at, approved_at, rejected_reason, revision_note, suspended_reason",
      "store_categories ( name, name_en, slug ), store_topics ( name, name_en, slug )",
    ].join(", "),
    [
      "id, store_name, slug, owner_user_id, approval_status, is_visible, business_type",
      "store_category_id, store_topic_id, owner_can_edit_store_identity",
      "description, kakao_id, phone, email, website_url, region, city, district",
      "address_line1, address_line2, lat, lng, profile_image_url",
      "created_at, updated_at, approved_at, rejected_reason, revision_note, suspended_reason",
      "store_categories ( name ), store_topics ( name )",
    ].join(", "),
  ] as const;

  const selectOrder = [
    ...selectAttempts.slice(adminStoresSelectAttemptStart),
    ...selectAttempts.slice(0, adminStoresSelectAttemptStart),
  ];

  // DEF-15 — `?page=` 가 있으면 서버 페이지네이션 + 전체 건수 집계 (입점 심사 화면).
  const paging = parseAdminStoresPaging(searchParams);
  if (paging) {
    return respondPaged(sb, {
      paging,
      status: status ?? "",
      qText,
      selectOrder,
      selectAttempts,
      extra: parseAdminStoresExtraFilters(searchParams),
      // 3-C L-10 — 「전체 결과 선택」: 같은 필터로 서버가 id 목록을 확정해 반환 (페이지 무관)
      selectAll: searchParams.get("select_all") === "1",
    });
  }

  let stores: unknown[] | null = null;
  let error: { message: string } | null = null;
  for (const sel of selectOrder) {
    const result = await sb
      .from("stores")
      .select(sel)
      .order("created_at", { ascending: false })
      .limit(300);
    if (!result.error) {
      stores = Array.isArray(result.data) ? (result.data as unknown[]) : [];
      error = null;
      const idx = selectAttempts.indexOf(sel);
      if (idx >= 0) adminStoresSelectAttemptStart = idx;
      break;
    }
    error = result.error;
  }
  if (error) {
    console.error("[admin/stores GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list: AdminStoreListRow[] = Array.isArray(stores)
    ? (stores as unknown as AdminStoreListRow[])
    : [];

  const ids = list.map((s) => s.id);
  const ownerIds = [...new Set(list.map((s) => String(s.owner_user_id ?? "").trim()).filter(Boolean))];

  const [profsRes, permsRes] = await Promise.all([
    ownerIds.length > 0
      ? sb.from("profiles").select("id, display_name, nickname, username").in("id", ownerIds)
      : Promise.resolve({
          data: null as
            | { id: string; display_name: string | null; nickname: string | null; username: string | null }[]
            | null,
          error: null,
        }),
    ids.length > 0
      ? sb
          .from("store_sales_permissions")
          .select("store_id, allowed_to_sell, sales_status, approved_at, rejection_reason, suspension_reason")
          .in("store_id", ids)
      : Promise.resolve({ data: null as Record<string, unknown>[] | null }),
  ]);

  const nickByOwner = new Map<string, string>();
  const usernameByOwner = new Map<string, string>();
  if (!profsRes.error && profsRes.data) {
    for (const p of profsRes.data) {
      const id = typeof p.id === "string" ? p.id : "";
      const display = typeof (p as any).display_name === "string" ? String((p as any).display_name).trim() : "";
      const legacy = typeof (p as any).nickname === "string" ? String((p as any).nickname).trim() : "";
      const username = typeof (p as any).username === "string" ? String((p as any).username).trim() : "";
      const label = labelFromDisplayAndUsername(display || legacy, username).trim();
      if (id && label) nickByOwner.set(id, label);
      if (id && username) usernameByOwner.set(id, username.replace(/^@+/, ""));
    }
  }

  const listWithApplicant = list.map((s) => {
    const oid = String(s.owner_user_id ?? "").trim();
    const fromProfile = oid ? nickByOwner.get(oid) : undefined;
    const ownerUsername = oid ? usernameByOwner.get(oid) : undefined;
    const fromCol = String((s as { applicant_nickname?: unknown }).applicant_nickname ?? "").trim();
    const ownerHandle = ownerUsername ? `@${ownerUsername}` : null;
    return {
      ...s,
      store_name: String((s as any).store_name ?? "").trim(),
      applicant_nickname: fromCol || fromProfile || null,
      owner_username: ownerUsername ?? null,
      owner_handle: ownerHandle,
    };
  });

  const filteredListWithApplicant = qText
    ? listWithApplicant.filter((s) => {
        const qLower = qText.toLowerCase();
        const id = String((s as { id?: unknown }).id ?? "").trim().toLowerCase();
        const ownerId = String((s as { owner_user_id?: unknown }).owner_user_id ?? "")
          .trim()
          .toLowerCase();
        const handle = String((s as any).owner_handle ?? "").trim().toLowerCase().replace(/^@+/, "");
        const storeName = String((s as any).store_name ?? "").trim().toLowerCase();
        const slug = String((s as any).slug ?? "").trim().toLowerCase();
        const phone = String((s as any).phone ?? "").trim().toLowerCase();
        const kakao = String((s as any).kakao_id ?? "").trim().toLowerCase();
        const applicant = String((s as any).applicant_nickname ?? "").trim().toLowerCase();
        const requestNote = String((s as any).application_request_note ?? "").trim().toLowerCase();
        const categoryId = String((s as { store_category_id?: unknown }).store_category_id ?? "")
          .trim()
          .toLowerCase();
        const topicId = String((s as { store_topic_id?: unknown }).store_topic_id ?? "")
          .trim()
          .toLowerCase();
        return (
          id.includes(qLower) ||
          ownerId.includes(qLower) ||
          categoryId.includes(qLower) ||
          topicId.includes(qLower) ||
          storeName.includes(qLower) ||
          slug.includes(qLower) ||
          phone.includes(qLower) ||
          kakao.includes(qLower) ||
          applicant.includes(qLower) ||
          requestNote.includes(qLower) ||
          handle.includes(qLower)
        );
      })
    : listWithApplicant;

  const statusFilteredList =
    status && status !== "all"
      ? status === "actionable"
        ? filteredListWithApplicant.filter((s) =>
            (ADMIN_ACTIONABLE_STORE_APPROVAL as readonly string[]).includes(
              String((s as { approval_status?: unknown }).approval_status ?? "")
            )
          )
        : filteredListWithApplicant.filter(
            (s) => String((s as { approval_status?: unknown }).approval_status ?? "") === status
          )
      : filteredListWithApplicant;

  const statusCounts: Record<string, number> = {
    all: filteredListWithApplicant.length,
    actionable: 0,
    pending: 0,
    under_review: 0,
    revision_requested: 0,
    approved: 0,
    rejected: 0,
    suspended: 0,
  };
  for (const r of filteredListWithApplicant) {
    const st = String((r as { approval_status?: unknown }).approval_status ?? "").trim();
    if (st && Object.prototype.hasOwnProperty.call(statusCounts, st)) {
      statusCounts[st] = (statusCounts[st] ?? 0) + 1;
    }
  }
  statusCounts.actionable =
    (statusCounts.pending ?? 0) + (statusCounts.under_review ?? 0);

  return NextResponse.json({
    ok: true,
    stores: await enrichAdminStoreRows(sb, statusFilteredList, permsRes.data ?? []),
    counts: statusCounts,
  });
}

type AdminStoreListRow = { id: string } & Record<string, unknown>;

/** 판매 권한 + 신청 주소록 카드(없으면 사장님 기본 주소록) 붙이기 — 목록·페이지 모드 공용. */
async function enrichAdminStoreRows(
  sb: SupabaseClient,
  rows: AdminStoreListRow[],
  perms: Record<string, unknown>[]
): Promise<AdminStoreListRow[]> {
  const permByStore: Record<string, Record<string, unknown>> = {};
  for (const p of perms) {
    const sid = p.store_id as string;
    permByStore[sid] = p as Record<string, unknown>;
  }

  const ownersNeedingBookFallback = [
    ...new Set(
      rows
        .filter(
          (s) =>
            !parseStoredAddressBookPresentation(
              (s as { application_address_book?: unknown }).application_address_book
            )
        )
        .map((s) => String((s as { owner_user_id?: unknown }).owner_user_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  let ownerBookFallback = new Map<string, AddressBookCardPresentation>();
  if (ownersNeedingBookFallback.length > 0) {
    try {
      ownerBookFallback = await loadOwnerMasterAddressBookMap(sb, ownersNeedingBookFallback);
    } catch (err) {
      console.error("[admin/stores GET] owner address book fallback", err);
    }
  }

  return rows.map((s) => {
    const storedBook = parseStoredAddressBookPresentation(
      (s as { application_address_book?: unknown }).application_address_book
    );
    const ownerId = String((s as { owner_user_id?: unknown }).owner_user_id ?? "").trim();
    const application_address_book =
      storedBook ?? (ownerId ? ownerBookFallback.get(ownerId) ?? null : null);
    return {
      ...s,
      application_address_book,
      sales_permission: permByStore[s.id] ?? null,
    };
  });
}

type ProfileLite = {
  id: string;
  display_name: string | null;
  nickname: string | null;
  username: string | null;
};

function applicantFields(s: AdminStoreListRow, prof: ProfileLite | undefined) {
  const display = String(prof?.display_name ?? "").trim();
  const legacy = String(prof?.nickname ?? "").trim();
  const username = String(prof?.username ?? "").trim().replace(/^@+/, "");
  const label = prof ? labelFromDisplayAndUsername(display || legacy, username).trim() : "";
  return {
    ...s,
    store_name: String(s.store_name ?? "").trim(),
    applicant_nickname: label || null,
    owner_username: username || null,
    owner_handle: username ? `@${username}` : null,
  };
}

/** DEF-15 — 서버 페이지네이션: 검색·상태 필터를 DB 에서 적용하고, 상태 탭 건수는 head count 로 집계. */
async function respondPaged(
  sb: SupabaseClient,
  input: {
    paging: AdminStoresPaging;
    status: string;
    qText: string;
    selectOrder: readonly string[];
    selectAttempts: readonly string[];
    extra: AdminStoresExtraFilters;
    selectAll: boolean;
  }
): Promise<NextResponse> {
  const { paging, status, qText, extra } = input;
  const term = sanitizeAdminStoresSearchTerm(qText);

  // 사장님 닉네임·핸들 검색 → owner id 로 변환
  let ownerIds: string[] = [];
  if (term) {
    const like = `%${term}%`;
    const { data: profs } = await sb
      .from("profiles")
      .select("id")
      .or(`username.ilike.${like},nickname.ilike.${like},display_name.ilike.${like}`)
      .limit(200);
    ownerIds = (profs ?? []).map((p) => String((p as { id?: unknown }).id ?? "")).filter(Boolean);
  }

  type Q = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;
  const runWithSearch = async (
    build: (
      orFilter: string | null
    ) => PromiseLike<{ data?: unknown; error: { message: string } | null; count?: number | null }>
  ) => {
    let res = await build(buildAdminStoresSearchOrFilter(term, ownerIds, { includeRequestNote: true }));
    if (res.error && term && /application_request_note/i.test(res.error.message)) {
      res = await build(buildAdminStoresSearchOrFilter(term, ownerIds, { includeRequestNote: false }));
    }
    return res;
  };
  // 상태 필터 = 처리 대기 레지스트리 「입점 심사 대기」와 같은 함수 (applyStoreApprovalStatusFilter)
  const applyStatus = (q: Q): Q => applyStoreApprovalStatusFilter(q, status) as Q;
  // 3-C L-2·L-3 — 유형(store_kind)·1차/2차 업종 필터 (목록·건수·전체 결과 id 공용)
  const applyExtra = (q: Q): Q => applyAdminStoresExtraFilters(q as never, extra) as Q;

  if (input.selectAll) {
    const res = await runWithSearch((orFilter) => {
      let q = sb.from("stores").select("id", { count: "exact" }) as Q;
      if (orFilter) q = q.or(orFilter) as Q;
      q = applyExtra(applyStatus(q));
      return q.order("created_at", { ascending: false }).range(0, ADMIN_STORES_SELECT_ALL_MAX - 1);
    });
    if (res.error) {
      console.error("[admin/stores GET select_all]", res.error);
      return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
    }
    const ids = (Array.isArray(res.data) ? res.data : [])
      .map((r) => String((r as { id?: unknown }).id ?? ""))
      .filter(Boolean);
    const matched = typeof res.count === "number" ? res.count : ids.length;
    return NextResponse.json({
      ok: true,
      ids,
      total: matched,
      truncated: matched > ids.length,
      max: ADMIN_STORES_SELECT_ALL_MAX,
    });
  }

  let pageRows: AdminStoreListRow[] = [];
  let total = 0;
  let lastError: { message: string } | null = null;
  for (const sel of input.selectOrder) {
    const res = await runWithSearch((orFilter) => {
      let q = sb.from("stores").select(sel, { count: "exact" }) as Q;
      if (orFilter) q = q.or(orFilter) as Q;
      q = applyExtra(applyStatus(q));
      return q.order("created_at", { ascending: false }).range(paging.from, paging.to);
    });
    if (!res.error) {
      pageRows = (Array.isArray(res.data) ? res.data : []) as AdminStoreListRow[];
      total = typeof res.count === "number" ? res.count : pageRows.length;
      lastError = null;
      const idx = input.selectAttempts.indexOf(sel);
      if (idx >= 0) adminStoresSelectAttemptStart = idx;
      break;
    }
    lastError = res.error;
  }
  if (lastError) {
    console.error("[admin/stores GET paged]", lastError);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }

  const countResults = await Promise.all(
    [null, ...ADMIN_STORES_COUNT_STATUSES].map((st) =>
      runWithSearch((orFilter) => {
        let q = sb.from("stores").select("id", { count: "exact", head: true }) as Q;
        if (orFilter) q = q.or(orFilter) as Q;
        if (st) q = q.eq("approval_status", st) as Q;
        return applyExtra(q);
      })
    )
  );
  const [allRes, ...statusRes] = countResults;
  const byStatus: Partial<Record<(typeof ADMIN_STORES_COUNT_STATUSES)[number], number>> = {};
  ADMIN_STORES_COUNT_STATUSES.forEach((st, i) => {
    byStatus[st] = Number(statusRes[i]?.count) || 0;
  });
  const counts = buildAdminStoresStatusCounts(byStatus, Number(allRes?.count) || 0);

  const ids = pageRows.map((s) => s.id);
  const pageOwnerIds = [
    ...new Set(pageRows.map((s) => String(s.owner_user_id ?? "").trim()).filter(Boolean)),
  ];
  type StatRow = Record<string, unknown>;
  const emptyRows = Promise.resolve({ data: [] as StatRow[], error: null });
  const [profsRes, permsRes, productsRes, bannerAdsRes, paidAdsRes] = await Promise.all([
    pageOwnerIds.length > 0
      ? sb.from("profiles").select("id, display_name, nickname, username").in("id", pageOwnerIds)
      : Promise.resolve({ data: [] as ProfileLite[], error: null }),
    ids.length > 0
      ? sb
          .from("store_sales_permissions")
          .select("store_id, allowed_to_sell, sales_status, approved_at, rejection_reason, suspension_reason")
          .in("store_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    // 3-C L-7 · L-9 — 페이지 행 id 로 1회씩 집계 (메뉴·옵션 수 · 연결 광고 건수)
    ids.length > 0
      ? sb.from("store_products").select("store_id, product_status, options_json").in("store_id", ids)
      : emptyRows,
    ids.length > 0
      ? sb.from("store_banner_ad_campaigns").select("store_id, lifecycle_status").in("store_id", ids)
      : emptyRows,
    ids.length > 0
      ? sb.from("store_paid_ad_campaigns").select("store_id, lifecycle_status").in("store_id", ids)
      : emptyRows,
  ]);
  if (productsRes.error) console.error("[admin/stores GET paged] menu stats", productsRes.error);
  const menuStats = summarizeAdminStoreMenuStats((productsRes.data ?? []) as StatRow[]);
  const adLinks = summarizeAdminStoreAdLinks([
    ...((bannerAdsRes.error ? [] : bannerAdsRes.data ?? []) as StatRow[]),
    ...((paidAdsRes.error ? [] : paidAdsRes.data ?? []) as StatRow[]),
  ]);
  const profById = new Map<string, ProfileLite>();
  for (const p of (profsRes.data ?? []) as ProfileLite[]) profById.set(String(p.id), p);
  const withApplicant = pageRows.map((s) => ({
    ...applicantFields(s, profById.get(String(s.owner_user_id ?? "").trim())),
    menu_count: productsRes.error ? null : menuStats.get(s.id)?.menu_count ?? 0,
    option_count: productsRes.error ? null : menuStats.get(s.id)?.option_count ?? 0,
    linked_ad_count: adLinks.get(s.id)?.linked_ad_count ?? 0,
    linked_ad_live_count: adLinks.get(s.id)?.linked_ad_live_count ?? 0,
  }));

  return NextResponse.json({
    ok: true,
    stores: await enrichAdminStoreRows(sb, withApplicant, (permsRes.data ?? []) as Record<string, unknown>[]),
    counts,
    total,
    page: paging.page,
    pageSize: paging.pageSize,
  });
}
