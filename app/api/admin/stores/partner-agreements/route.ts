import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { internalErrorResponse } from "@/lib/security/internal-error-response";
import { parseAdminPartnerAgreementFilter } from "@/lib/stores/partner/admin-store-partner-agreements-model";
import { loadAdminStorePartnerAgreementList } from "@/lib/stores/partner/load-admin-store-partner-agreements.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 매장 입점 계약 목록 (조회 전용 — 조회 권한은 `/admin/stores` 와 같음).
 * Query: filter=pending|approved|reconsent|all (기본 pending), lang=ko|en (업종 이름 언어)
 */
export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const filter = parseAdminPartnerAgreementFilter(sp.get("filter"));
  const res = await loadAdminStorePartnerAgreementList(sb, { filter, en: sp.get("lang") === "en" });
  if (!res.ok) return internalErrorResponse("load_failed", "[admin/stores/partner-agreements GET]", res.error, 500);
  return NextResponse.json({
    ok: true as const,
    filter,
    currentVersion: res.currentVersion,
    truncated: res.truncated,
    rows: res.rows,
  });
}
