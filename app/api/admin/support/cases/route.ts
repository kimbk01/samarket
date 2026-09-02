import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  listSupportCasesForAdmin,
  type AdminSupportListFilter,
} from "@/lib/support/support-case-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILTERS = new Set<AdminSupportListFilter>([
  "ALL",
  "MEMBER",
  "OWNER",
  "UNASSIGNED",
  "WAITING_ADMIN",
  "WAITING_USER",
  "RESOLVED",
]);

export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const filterRaw = req.nextUrl.searchParams.get("filter")?.trim().toUpperCase() ?? "ALL";
  const filter = FILTERS.has(filterRaw as AdminSupportListFilter)
    ? (filterRaw as AdminSupportListFilter)
    : "ALL";
  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";

  const res = await listSupportCasesForAdmin(sb, { filter, search });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, cases: res.cases });
}

export async function POST(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { ok: false, error: "use_case_detail_route" },
    { status: 405 }
  );
}
