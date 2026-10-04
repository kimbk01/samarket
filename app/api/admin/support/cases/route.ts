import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  enrichSupportCasesForAdminDisplay,
  listSupportCasesForAdmin,
} from "@/lib/support/support-case-service";
import { isAdminSupportListFilter } from "@/lib/support/support-case-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const filterRaw = req.nextUrl.searchParams.get("filter")?.trim().toUpperCase() ?? "ALL";
  // DEF-03: whitelist = ADMIN_SUPPORT_LIST_FILTERS SSOT (same list the UI chips render).
  const filter = isAdminSupportListFilter(filterRaw) ? filterRaw : "ALL";
  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";

  const res = await listSupportCasesForAdmin(sb, { filter, search });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }
  const cases = await enrichSupportCasesForAdminDisplay(sb, res.cases);
  return NextResponse.json({ ok: true, cases });
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
