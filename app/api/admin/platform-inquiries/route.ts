import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import {
  memberOpsListRange,
  parseMemberOpsListPageIfRequested,
} from "@/lib/admin/member-ops-list/member-ops-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INQUIRY_TYPES = new Set(["general", "store_ops", "store_point", "settlement", "ad"]);

/**
 * GET /api/admin/platform-inquiries
 * - `limit`/`offset` 이 있으면 (R7 목록 표준 · 이전 문의 기록 화면): limit 20/50/100 서버 페이지 + `total`(count exact).
 * - 없으면 기존 응답 그대로(최근 300건) — 다른 호출자 `AdminPlatformInquiriesPage`·`AdminStorePointPendingProvider` 호환.
 */
export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const type = req.nextUrl.searchParams.get("inquiry_type")?.trim() ?? "";
  const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";

  const page = parseMemberOpsListPageIfRequested(req.nextUrl.searchParams);
  const base = sb
    .from("platform_admin_inquiries")
    .select(
      "id, inquiry_type, inquiry_kind, store_id, from_user_id, subject, content, attachment_urls, status, answer, answered_by, answered_at, related_charge_request_id, created_at, updated_at",
      page ? { count: "exact" } : undefined
    )
    .order("created_at", { ascending: false });
  let q = page
    ? base.order("id", { ascending: false }).range(...memberOpsListRange(page))
    : base.limit(300);

  if (type && INQUIRY_TYPES.has(type)) q = q.eq("inquiry_type", type);
  if (status) q = q.eq("status", status);

  const { data: rows, error, count } = await q;
  if (error) {
    if (/platform_admin_inquiries/i.test(error.message) && /does not exist/i.test(error.message)) {
      return NextResponse.json(
        page ? { ok: true, inquiries: [], total: 0, limit: page.limit, offset: page.offset } : { ok: true, inquiries: [] }
      );
    }
    return NextResponse.json({ ok: false, error: page ? "db_error" : error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const storeIds = [...new Set(list.map((r) => r.store_id).filter(Boolean))] as string[];
  const storeById: Record<string, { name: string; pointBalance: number }> = {};
  if (storeIds.length) {
    const { data: stores } = await sb
      .from("stores")
      .select("id, store_name, point_balance")
      .in("id", storeIds);
    for (const s of stores ?? []) {
      storeById[s.id as string] = {
        name: (s.store_name as string) ?? "",
        pointBalance: Number(s.point_balance) || 0,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    ...(page ? { total: count ?? list.length, limit: page.limit, offset: page.offset } : {}),
    inquiries: list.map((r) => {
      const storeMeta = r.store_id ? storeById[r.store_id as string] : undefined;
      return {
        ...r,
        store_name: storeMeta?.name ?? "",
        point_balance: storeMeta?.pointBalance ?? 0,
      };
    }),
  });
}
