import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { listAdminOwnerEventPromoRequests } from "@/lib/platform-event-owner-requests/admin-review";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { parsePlatformAdminListPage } from "@/lib/admin/platform-list/admin-platform-list-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform-event-owner-requests?status=&limit=&offset=
 * R7 서버 페이지 — `limit`(20/50/100, 기본 20)·`offset` → `total`(count exact).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  const page = parsePlatformAdminListPage(params) ?? { limit: 20, offset: 0 };
  try {
    const { items, total } = await listAdminOwnerEventPromoRequests(sb, {
      status,
      limit: page.limit,
      offset: page.offset,
    });
    return NextResponse.json({ ok: true, items, total, limit: page.limit, offset: page.offset });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "failed" },
      { status: 500 }
    );
  }
}
