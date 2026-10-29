/**
 * GET /api/admin/store-orders/audit?category&q&period&from&to&page — 매장 주문 감사 로그 (read-only).
 * QA records are excluded unless `category=qa`.
 */
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { NextRequest, NextResponse } from "next/server";
import { loadAdminOrderAuditPage, parseAdminOrderAuditQuery } from "@/lib/admin/store-orders/load-admin-store-order-audit";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  // G-02: 배달 주문 운영 조회(구매자 PII 포함) = business 키 — store-orders 상세·내보내기와 같은 키
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503, headers: NO_STORE });

  const q = parseAdminOrderAuditQuery(req.nextUrl.searchParams);
  const out = await loadAdminOrderAuditPage(sb, q);
  if (!out.ok) {
    console.error("[admin order audit]", out.message);
    return NextResponse.json({ ok: false, error: out.error }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, page: q.page, page_size: q.pageSize, total: out.total, rows: out.rows }, { headers: NO_STORE });
}
