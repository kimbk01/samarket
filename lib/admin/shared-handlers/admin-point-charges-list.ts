/**
 * 공용 관리자 처리 (원래 app/api/admin/point-charges/route.ts 본문 그대로 이동). 서버 전용.
 * 원래 라우트(권한 키 `point`)와 거래 Admin 라우트(O-2 활성 관리자 전원)가 같은 처리를 공유한다 — 데이터·규칙 SSOT 하나.
 */
import "server-only";
import type { SharedAdminHandlerGate } from "@/lib/admin/shared-handlers/shared-admin-handler-gate";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { POINT_CHARGE_REQUEST_ROW_SELECT } from "@/lib/points/point-query-select";
import {
  isMissingPointsTable,
  normalizeChargeRequest,
} from "@/lib/points/admin-user-points-shared";
import {
  adminListRange,
  escapeAdminIlike,
  isAdminListUuid,
  parseAdminListPage,
  sanitizeAdminListSearch,
} from "@/lib/admin/pagination/parse-admin-list-page";
import {
  POINT_CHARGE_REQUEST_STATUSES,
  parsePointChargeStatusFilter,
} from "@/lib/points/admin-point-charge-list-query";
import type { PointChargeRequestStatus } from "@/lib/types/point";
import {
  loadAdminRequestPeriodSummary,
  parseAdminRequestPeriod,
  POINT_CHARGE_SUMMARY_BUCKETS,
} from "@/lib/admin/finance/admin-request-period-summary";
import { invalidPeriodResponse } from "@/lib/stores/commission/period-input-response";

/** 포인트 충전 신청 텍스트 검색 DB 페이지 (마이그레이션 20270601165000) */
const POINT_CHARGE_SEARCH_RPC = "admin_point_charge_requests_search_page";


/**
 * GET /api/admin/point-charges — server-side paginated.
 *
 * Query: `status` (all | open | pending,waiting_confirm,… whitelist) · `q` (닉네임 · 입금자명 · 신청/회원 UUID —
 *        텍스트 검색은 DB RPC `admin_point_charge_requests_search_page`, 그 외는 아래 PostgREST 조회)
 *        · `limit` (기본 50, 최대 200) · `offset` (기본 0) · `counts=1` (상태별 전체 건수 동봉)
 *        · `from`/`to` (PHT YYYY-MM-DD — 신청 시각 requested_at 기간, H-10) · `summary=1` (기간 합계 동봉)
 * Response: `{ ok, requests, total, limit, offset, statusCounts?, periodSummary?, periodNotAppliedToSearch? }`
 *   — `total` 은 현재 필터 기준 exact count. `periodSummary` 는 고른 기간 전체(상태·검색과 무관) 신청·승인·반려·대기
 *   건수 / point_amount(amount) · payment_amount(amount2) 합계.
 *   닉네임·입금자명 텍스트 검색(DB RPC)은 기간 인자가 없어 기간이 적용되지 않는다 → `periodNotAppliedToSearch: true`.
 */
export async function handleAdminPointChargesListGet(
  gate: SharedAdminHandlerGate,
  req: NextRequest): Promise<NextResponse> {

  const { sb } = gate;
  const sp = req.nextUrl.searchParams;
  const page = parseAdminListPage(sp);
  const statuses = parsePointChargeStatusFilter(sp.get("status"));
  const search = sanitizeAdminListSearch(sp.get("q"));
  const withCounts = sp.get("counts") === "1";
  const badPeriod = invalidPeriodResponse(sp);
  if (badPeriod) return badPeriod;
  const period = parseAdminRequestPeriod(sp);
  const hasPeriod = Boolean(period.fromIso || period.toIso);
  const summaryPromise =
    sp.get("summary") === "1"
      ? loadAdminRequestPeriodSummary(sb, {
          table: "point_charge_requests",
          timeColumn: "requested_at",
          statusColumn: "request_status",
          amountColumn: "point_amount",
          amount2Column: "payment_amount",
          period,
          buckets: POINT_CHARGE_SUMMARY_BUCKETS,
        })
      : Promise.resolve(undefined);

  const empty = (statusCounts?: Record<PointChargeRequestStatus, number>) =>
    NextResponse.json({
      ok: true,
      requests: [],
      total: 0,
      limit: page.limit,
      offset: page.offset,
      ...(statusCounts ? { statusCounts } : {}),
    });
  let periodSummary: Awaited<typeof summaryPromise>;

  // R3-j — 상태 카드도 고른 기간(신청 시각)으로 센다. 기간이 없으면 전체 기간(대시보드와 같은 값).
  const countsPromise = withCounts
    ? countPointChargesByStatus(sb, hasPeriod ? period : undefined)
    : Promise.resolve(undefined);
  /** 기간을 고른 경우에도 「입금 확인 대기」 경고는 기간과 무관한 전체 건수로 (기간 밖 대기 건을 놓치지 않게). */
  const waitingAllPromise =
    withCounts && hasPeriod ? countPointChargesWithStatus(sb, "waiting_confirm") : Promise.resolve(undefined);
  const textSearch = Boolean(search) && !isAdminListUuid(search);

  let rows: unknown[] | null;
  let error: { message?: string } | null;
  let count: number | null;
  let statusCounts: Record<PointChargeRequestStatus, number> | undefined;
  if (textSearch) {
    // 입금자명 · 신청 회원 닉네임 검색 — DB 한 번(필터·정렬 requested_at DESC, id DESC·페이지·total).
    // R7: 예전 「닉네임 일치 회원 200명만 먼저 찾아 user_id IN」 제거 (마이그레이션 20270601165000).
    const [searchPage, counts, summary] = await Promise.all([
      sb.rpc(POINT_CHARGE_SEARCH_RPC, {
        p_statuses: statuses ?? null,
        p_q_pattern: `%${escapeAdminIlike(search)}%`,
        p_limit: page.limit,
        p_offset: page.offset,
      }),
      countsPromise,
      summaryPromise,
    ]);
    periodSummary = summary;
    statusCounts = counts;
    error = searchPage.error;
    const res = (searchPage.data ?? {}) as { total?: number; ids?: string[] };
    const ids = Array.isArray(res.ids) ? res.ids.map(String) : [];
    count = Number(res.total ?? 0);
    rows = [];
    if (!error && ids.length) {
      const full = await sb.from("point_charge_requests").select(POINT_CHARGE_REQUEST_ROW_SELECT).in("id", ids);
      error = full.error;
      const byId = new Map(
        ((full.data ?? []) as unknown as Record<string, unknown>[]).map((r) => [String(r.id ?? ""), r])
      );
      rows = ids.map((id) => byId.get(id)).filter(Boolean) as unknown[];
    }
  } else {
    const [from, to] = adminListRange(page);
    let query = sb
      .from("point_charge_requests")
      .select(POINT_CHARGE_REQUEST_ROW_SELECT, { count: "exact" })
      .order("requested_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (statuses) query = query.in("request_status", statuses);
    if (search) query = query.or(`id.eq.${search},user_id.eq.${search}`);
    if (period.fromIso) query = query.gte("requested_at", period.fromIso);
    if (period.toIso) query = query.lt("requested_at", period.toIso);
    const [res, counts, summary] = await Promise.all([query, countsPromise, summaryPromise]);
    periodSummary = summary;
    rows = res.data;
    error = res.error;
    count = res.count;
    statusCounts = counts;
  }

  if (error) {
    if (isMissingPointsTable(error.message ?? "", "point_charge_requests")) {
      return empty(statusCounts);
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const userIds = [...new Set(list.map((r) => String((r as { user_id?: string }).user_id ?? "")))].filter(
    Boolean
  );

  const nickById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", userIds);
    for (const p of profiles ?? []) {
      nickById[String(p.id)] = String((p as { nickname?: string }).nickname ?? "");
    }
  }

  const requests = list.map((row) => {
    const rec = row as Record<string, unknown>;
    const userId = String(rec.user_id ?? "");
    return normalizeChargeRequest(rec, userId, nickById[userId] ?? "");
  });

  const waitingConfirmAllTime = await waitingAllPromise;
  return NextResponse.json({
    ok: true,
    requests,
    total: count ?? requests.length,
    limit: page.limit,
    offset: page.offset,
    ...(statusCounts
      ? {
          statusCounts,
          /** R3-j — 상태 카드 기준: 신청 시각 기간(fromDay~toDay, PHT) · 둘 다 null = 전체 기간. */
          statusCountsPeriod: { fromDay: hasPeriod ? period.fromDay : null, toDay: hasPeriod ? period.toDay : null },
        }
      : {}),
    ...(waitingConfirmAllTime != null ? { waitingConfirmAllTime } : {}),
    ...(periodSummary !== undefined ? { periodSummary } : {}),
    ...(textSearch && hasPeriod ? { periodNotAppliedToSearch: true } : {}),
  });
}

/** 상태 탭 배지 — 검색과 무관한 상태별 전체 건수 (head + exact count). 실패 시 생략. */
/** 상태별 전체 건수 — 포인트 충전 화면 요약 카드와 통합 대시보드가 같은 함수를 쓴다. 실패 = undefined. */
export async function countPointChargesByStatus(
  sb: SupabaseClient,
  /** R3-j — 신청 시각(requested_at) 기간 [fromIso, toIso). 없으면 전체 기간. */
  period?: { fromIso: string | null; toIso: string | null }
): Promise<Record<PointChargeRequestStatus, number> | undefined> {
  const results = await Promise.all(
    POINT_CHARGE_REQUEST_STATUSES.map(async (status) => {
      let q = sb
        .from("point_charge_requests")
        .select("id", { count: "exact", head: true })
        .eq("request_status", status);
      if (period?.fromIso) q = q.gte("requested_at", period.fromIso);
      if (period?.toIso) q = q.lt("requested_at", period.toIso);
      const { count, error } = await q;
      return [status, error ? null : (count ?? 0)] as const;
    })
  );
  if (results.some(([, n]) => n == null)) return undefined;
  return Object.fromEntries(results) as Record<PointChargeRequestStatus, number>;
}

/** 한 상태의 전체 기간 건수 (실패 = undefined). */
async function countPointChargesWithStatus(
  sb: SupabaseClient,
  status: PointChargeRequestStatus
): Promise<number | undefined> {
  const { count, error } = await sb
    .from("point_charge_requests")
    .select("id", { count: "exact", head: true })
    .eq("request_status", status);
  return error ? undefined : (count ?? 0);
}
