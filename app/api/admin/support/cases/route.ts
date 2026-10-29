import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  countSupportCasesByTab,
  enrichSupportCasesForAdminDisplay,
  listSupportCasesForAdmin,
} from "@/lib/support/support-case-service";
import { isAdminSupportListFilter, isAdminSupportTab } from "@/lib/support/support-case-types";
import { getSupportCategoryGroup } from "@/lib/support/support-category-groups";
import { SUPPORT_REFERENCE_TYPES } from "@/lib/support/support-reference-authority";
import { parseSupportCaseKind, parseSupportCaseScope } from "@/lib/support/support-community-filter";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // RS-04: 고객지원 케이스 조회 = `support` 키 (중앙·거래·커뮤니티 문의 화면 공통)
  const gate = await requireAdminPermission("support");
  if (!gate.ok) return gate.response;
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
  // 커뮤니티 문의(`?group=community`)·이의신청(`?type=appeal`) — 없으면 기존 동작 그대로.
  const scope = parseSupportCaseScope(sp.get("group"));
  const kind = parseSupportCaseKind(sp.get("type"));
  const assigneeRaw = sp.get("assignee")?.trim().toUpperCase() ?? "";
  const assignee = assigneeRaw === "ME" || assigneeRaw === "UNASSIGNED" ? assigneeRaw : null;
  const stale = sp.get("stale") === "1";
  const search = sp.get("search")?.trim() ?? "";
  // Domain deep links (주문 상세 · 매장 허브) — whitelisted reference type, UUID ids only.
  const referenceTypeRaw = sp.get("reference_type")?.trim().toUpperCase() ?? "";
  const referenceType = (SUPPORT_REFERENCE_TYPES as readonly string[]).includes(referenceTypeRaw)
    ? referenceTypeRaw
    : null;
  const uuidOrNull = (v: string | null) =>
    v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim()) ? v.trim() : null;
  const referenceId = uuidOrNull(sp.get("reference_id"));
  const ownerStoreId = uuidOrNull(sp.get("store_id"));
  // Server-side pagination — `total` is the exact count for the active filter set.
  const page = parseAdminListPage(sp);

  let adminUserId: string | null = null;
  if (assignee === "ME") {
    const auth = await requireAuthenticatedUserId();
    if (!auth.ok) return auth.response;
    adminUserId = auth.userId;
  }

  const [res, counts] = await Promise.all([
    listSupportCasesForAdmin(sb, {
      filter,
      tab,
      audience,
      group,
      assignee,
      adminUserId,
      stale,
      search,
      referenceType,
      referenceId,
      ownerStoreId,
      scope,
      kind,
      limit: page.limit,
      offset: page.offset,
    }),
    countSupportCasesByTab(sb),
  ]);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 500 });
  }
  const cases = await enrichSupportCasesForAdminDisplay(sb, res.cases);
  return NextResponse.json({ ok: true, cases, counts, total: res.total, limit: res.limit, offset: res.offset });
}

export async function POST(req: NextRequest) {
  // E-7: 고객지원 = support 키 (GET 과 같은 키)
  const gate = await requireAdminPermission("support");
  if (!gate.ok) return gate.response;
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    { ok: false, error: "use_case_detail_route" },
    { status: 405 }
  );
}
