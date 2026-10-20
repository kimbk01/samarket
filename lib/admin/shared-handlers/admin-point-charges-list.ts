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
  quotePostgrestOrValue,
  sanitizeAdminListSearch,
} from "@/lib/admin/pagination/parse-admin-list-page";
import {
  POINT_CHARGE_REQUEST_STATUSES,
  parsePointChargeStatusFilter,
} from "@/lib/points/admin-point-charge-list-query";
import type { PointChargeRequestStatus } from "@/lib/types/point";


/**
 * GET /api/admin/point-charges — server-side paginated.
 *
 * Query: `status` (all | open | pending,waiting_confirm,… whitelist) · `q` (닉네임 · 입금자명 · 신청/회원 UUID)
 *        · `limit` (기본 50, 최대 200) · `offset` (기본 0) · `counts=1` (상태별 전체 건수 동봉)
 * Response: `{ ok, requests, total, limit, offset, statusCounts? }` — `total` 은 현재 필터 기준 exact count.
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

  const empty = (statusCounts?: Record<PointChargeRequestStatus, number>) =>
    NextResponse.json({
      ok: true,
      requests: [],
      total: 0,
      limit: page.limit,
      offset: page.offset,
      ...(statusCounts ? { statusCounts } : {}),
    });

  // 닉네임 검색 — profiles 에서 먼저 id 해석 후 user_id IN.
  let nicknameUserIds: string[] = [];
  if (search && !isAdminListUuid(search)) {
    const { data: hits } = await sb
      .from("profiles")
      .select("id")
      .ilike("nickname", `%${escapeAdminIlike(search)}%`)
      .limit(200);
    nicknameUserIds = ((hits ?? []) as { id?: string }[]).map((p) => String(p.id ?? "")).filter(Boolean);
  }

  const [from, to] = adminListRange(page);
  let query = sb
    .from("point_charge_requests")
    .select(POINT_CHARGE_REQUEST_ROW_SELECT, { count: "exact" })
    .order("requested_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (statuses) query = query.in("request_status", statuses);
  if (search) {
    if (isAdminListUuid(search)) {
      query = query.or(`id.eq.${search},user_id.eq.${search}`);
    } else {
      const ors = [`depositor_name.ilike.${quotePostgrestOrValue(`%${escapeAdminIlike(search)}%`)}`];
      if (nicknameUserIds.length) ors.push(`user_id.in.(${nicknameUserIds.join(",")})`);
      query = query.or(ors.join(","));
    }
  }

  const countsPromise = withCounts ? countPointChargesByStatus(sb) : Promise.resolve(undefined);
  const [{ data: rows, error, count }, statusCounts] = await Promise.all([query, countsPromise]);

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

  return NextResponse.json({
    ok: true,
    requests,
    total: count ?? requests.length,
    limit: page.limit,
    offset: page.offset,
    ...(statusCounts ? { statusCounts } : {}),
  });
}

/** 상태 탭 배지 — 검색과 무관한 상태별 전체 건수 (head + exact count). 실패 시 생략. */
/** 상태별 전체 건수 — 포인트 충전 화면 요약 카드와 통합 대시보드가 같은 함수를 쓴다. 실패 = undefined. */
export async function countPointChargesByStatus(
  sb: SupabaseClient
): Promise<Record<PointChargeRequestStatus, number> | undefined> {
  const results = await Promise.all(
    POINT_CHARGE_REQUEST_STATUSES.map(async (status) => {
      const { count, error } = await sb
        .from("point_charge_requests")
        .select("id", { count: "exact", head: true })
        .eq("request_status", status);
      return [status, error ? null : (count ?? 0)] as const;
    })
  );
  if (results.some(([, n]) => n == null)) return undefined;
  return Object.fromEntries(results) as Record<PointChargeRequestStatus, number>;
}
