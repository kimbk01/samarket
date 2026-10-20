import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PointFinancialFilter } from "@/lib/points/point-financial-history";
import {
  loadPointFinancialHistory,
  loadPointFinancialHistoryOffsetPage,
  serializePointFinancialPage,
} from "@/lib/points/project-point-financial-history";
import { parseMemberOpsListPage } from "@/lib/admin/member-ops-list/member-ops-list-page";
import { manilaDateRangeToUtc } from "@/lib/admin/metrics/manila-period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseFilter(raw: string | null): PointFinancialFilter {
  const v = (raw ?? "all").trim().toLowerCase();
  if (v === "credit" || v === "debit") return v;
  return "all";
}

async function nicknameMap(sb: SupabaseClient, userIds: string[]): Promise<Record<string, string>> {
  const nickById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", userIds);
    for (const p of profiles ?? []) {
      nickById[String(p.id)] = String((p as { nickname?: string }).nickname ?? "");
    }
  }
  return nickById;
}

/**
 * GET /api/admin/points/ledger
 * - 기본(R7 목록 표준): `limit`(20/50/100)·`offset` 서버 페이지 + `total`(count exact).
 *   필터 `status`(credit|debit, 예전 키 `filter` 도 허용) · `q`(회원 UUID, 예전 키 `userId` 도 허용) · `from`/`to`(PHT 날짜).
 *   Response `{ ok, items, total, limit, offset }`.
 * - `cursor` 가 있으면 예전 커서 응답(`history`·`entries`) 그대로 — 호환용.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireAdminPermission("point");
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  if (!sp.has("cursor")) {
    const page = parseMemberOpsListPage(sp);
    const filter = parseFilter(sp.get("status") ?? sp.get("filter"));
    const userId = (sp.get("q") ?? sp.get("userId") ?? "").trim();
    const period = manilaDateRangeToUtc(sp.get("from"), sp.get("to"));
    const res = await loadPointFinancialHistoryOffsetPage(gate.sb, {
      userId: userId || undefined,
      filter,
      limit: page.limit,
      offset: page.offset,
      fromIso: period.fromIso,
      toIso: period.toIso,
    });
    if (!res.ok) {
      if (res.code === "table_missing") {
        return NextResponse.json({ ok: true, items: [], total: 0, limit: page.limit, offset: page.offset });
      }
      return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
    }
    const nickById = await nicknameMap(gate.sb, [...new Set(res.items.map((i) => i.userId).filter(Boolean))]);
    return NextResponse.json({
      ok: true,
      items: res.items.map((e) => ({ ...e, userNickname: nickById[e.userId] ?? "" })),
      total: res.total,
      limit: page.limit,
      offset: page.offset,
    });
  }

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  const filter = parseFilter(req.nextUrl.searchParams.get("filter"));
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const cursor = req.nextUrl.searchParams.get("cursor");
  const dateFrom = req.nextUrl.searchParams.get("dateFrom");
  const dateTo = req.nextUrl.searchParams.get("dateTo");

  const { sb } = gate;
  const historyRes = await loadPointFinancialHistory(sb, {
    userId: userId || undefined,
    filter,
    limit,
    cursor,
    dateFrom,
    dateTo,
  });
  if (!historyRes.ok) {
    if (historyRes.code === "table_missing") {
      return NextResponse.json({
        ok: true,
        history: { items: [], hasMore: false, nextCursor: null },
        entries: [],
      });
    }
    return NextResponse.json({ ok: false, error: historyRes.error }, { status: 500 });
  }

  const history = serializePointFinancialPage(historyRes.page);
  const userIds = [...new Set(history.items.map((i) => i.userId).filter(Boolean))];
  const nickById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profiles } = await sb.from("profiles").select("id, nickname").in("id", userIds);
    for (const p of profiles ?? []) {
      nickById[String(p.id)] = String((p as { nickname?: string }).nickname ?? "");
    }
  }

  return NextResponse.json({
    ok: true,
    history: {
      ...history,
      items: history.items.map((e) => ({
        ...e,
        userNickname: nickById[e.userId] ?? "",
      })),
    },
    entries: history.items.map((e) => ({
      id: e.ledgerId,
      userId: e.userId,
      userNickname: nickById[e.userId] ?? "",
      entryType: e.entryType,
      amount: e.signedAmount,
      balanceAfter: e.balanceAfter,
      relatedType: e.relatedType,
      relatedId: e.relatedId,
      description: e.description,
      createdAt: e.occurredAt,
      actorType: e.actorType,
      financial: e,
    })),
  });
}
