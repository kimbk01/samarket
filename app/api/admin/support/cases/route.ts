import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  countSupportCasesByTab,
  enrichSupportCasesForAdminDisplay,
  listSupportCasesForAdmin,
} from "@/lib/support/support-case-service";
import { isAdminSupportListFilter, isAdminSupportTab } from "@/lib/support/support-case-types";
import { getSupportCategoryGroup } from "@/lib/support/support-category-groups";

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

  const sp = req.nextUrl.searchParams;
  const filterRaw = sp.get("filter")?.trim().toUpperCase() ?? "ALL";
  // DEF-03: whitelist = ADMIN_SUPPORT_LIST_FILTERS SSOT (legacy deep links).
  const filter = isAdminSupportListFilter(filterRaw) ? filterRaw : "ALL";
  // Console redesign: status tab + secondary filters (whitelisted).
  const tabRaw = sp.get("tab")?.trim().toUpperCase() ?? "";
  const tab = isAdminSupportTab(tabRaw) ? tabRaw : undefined;
  const audienceRaw = sp.get("audience")?.trim().toUpperCase() ?? "";
  const audience = audienceRaw === "MEMBER" || audienceRaw === "OWNER" ? audienceRaw : null;
  const group = getSupportCategoryGroup(sp.get("group"))?.id ?? null;
  const assigneeRaw = sp.get("assignee")?.trim().toUpperCase() ?? "";
  const assignee = assigneeRaw === "ME" || assigneeRaw === "UNASSIGNED" ? assigneeRaw : null;
  const stale = sp.get("stale") === "1";
  const search = sp.get("search")?.trim() ?? "";

  let adminUserId: string | null = null;
  if (assignee === "ME") {
    const auth = await requireAuthenticatedUserId();
    if (!auth.ok) return auth.response;
    adminUserId = auth.userId;
  }

  const [res, counts] = await Promise.all([
    listSupportCasesForAdmin(sb, { filter, tab, audience, group, assignee, adminUserId, stale, search }),
    countSupportCasesByTab(sb),
  ]);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }
  const cases = await enrichSupportCasesForAdminDisplay(sb, res.cases);
  return NextResponse.json({ ok: true, cases, counts });
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
