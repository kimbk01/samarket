import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import {
  listPlatformPopupAdminCampaignPage,
  listPlatformPopupAdminCampaigns,
} from "@/lib/platform-popup/admin-campaign-loader";
import { parsePlatformAdminListPage } from "@/lib/admin/platform-list/admin-platform-list-page";
import { createPlatformPopupAdminCampaign } from "@/lib/platform-popup/admin-campaign-writer";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform-popup-campaigns
 * - `limit`(20/50/100)·`offset` 이 있으면 서버 페이지 + `total` (팝업·당겨서 새로고침 목록 화면).
 *   필터: `status`(`live` = 지금 노출 중 · DB 상태값) · `composition`(팝업 형태) · `q`(검색) · `scope`.
 * - 없으면 기존 응답(최근 수정 100건, `status`·`scope` 만) — 다른 호출자 호환.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const params = new URL(req.url).searchParams;
  const status = params.get("status");
  const scope = params.get("scope") === "ptr" ? "ptr" : "popup";
  const page = parsePlatformAdminListPage(params);
  if (page) {
    const paged = await listPlatformPopupAdminCampaignPage(sb, {
      filter: { scope, status, composition: params.get("composition"), q: params.get("q") },
      limit: page.limit,
      offset: page.offset,
    });
    if (!paged.ok) {
      return NextResponse.json({ ok: false, error: paged.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      items: paged.items,
      total: paged.total,
      limit: page.limit,
      offset: page.offset,
    });
  }
  const result = await listPlatformPopupAdminCampaigns(sb, { status, scope });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: result.items });
}

/** POST /api/admin/platform-popup-campaigns — create draft */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    surfaces?: string[];
    priority?: number;
    timezone?: string;
    presentationType?: string;
  };

  const result = await createPlatformPopupAdminCampaign(sb, {
    adminUserId: admin.userId,
    name: String(body.name ?? "").trim(),
    surfaces: body.surfaces,
    priority: body.priority,
    timezone: body.timezone,
    presentationType: body.presentationType,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.httpStatus ?? 400 }
    );
  }
  return NextResponse.json({ ok: true, id: result.id });
}
