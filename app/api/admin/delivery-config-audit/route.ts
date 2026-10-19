import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { parseAdminConfigAuditScope } from "@/lib/admin/audit/admin-config-audit-scopes";
import { loadAdminConfigAuditHistory } from "@/lib/admin/audit/load-admin-config-audit-history";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 관리자: 배달 설정·구성 화면 「처리 이력」 (DEF-2 수수료 정책 · DEF-45 노출 정책 · DEF-40 구성 변경).
 * `?scope=` 는 허용 목록(`ADMIN_CONFIG_AUDIT_SCOPES`)만 — 임의 target_type 조회 불가. 읽기 전용.
 */
export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sp = req.nextUrl.searchParams;
  const scope = parseAdminConfigAuditScope(sp.get("scope"));
  if (!scope) return NextResponse.json({ ok: false, error: "invalid_scope" }, { status: 400 });
  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const res = await loadAdminConfigAuditHistory(sb, {
    scope,
    targetId: sp.get("target_id"),
    limit: Number(sp.get("limit") ?? 50),
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: res.error === "table_missing" ? 503 : 500 });
  }
  return NextResponse.json({ ok: true, scope, rows: res.rows });
}
