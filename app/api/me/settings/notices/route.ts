import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";
import {
  APP_NOTICES_CONTENT_SELECT,
  isCustomerCenterContentPublishedNow,
  isCustomerCenterContentType,
  parseCustomerCenterContentType,
  resolveCustomerCenterAuthorLabel,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { isMissingAppNoticesTableError } from "@/lib/notices/is-missing-app-notices-table-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Member board list — Content SSOT only (not Bell merge).
 * Optional ?content_type=notice|system|marketing
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: true, notices: [], source: "fallback" });
  }

  const typeRaw = req.nextUrl.searchParams.get("content_type");
  let q = sb
    .from("app_notices")
    .select(APP_NOTICES_CONTENT_SELECT)
    .eq("is_active", true)
    .is("deleted_at", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (isCustomerCenterContentType(typeRaw)) {
    q = q.eq("content_type", typeRaw);
  }

  const { data: boardRows, error: boardError } = await q;

  if (boardError) {
    if (isMissingAppNoticesTableError(boardError.message ?? "")) {
      return NextResponse.json({ ok: true, notices: [], source: "table_missing" });
    }
    return NextResponse.json(
      { ok: false, error: boardError.message ?? "notices_fetch_failed" },
      { status: 500 }
    );
  }

  const notices = [];
  for (const row of boardRows ?? []) {
    if (!isCustomerCenterContentPublishedNow(row)) continue;
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const contentType = parseCustomerCenterContentType(row.content_type, "notice");
    notices.push({
      id,
      contentType,
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      heroImageUrl: normalizeCustomerCenterHeroImageUrl(row.hero_image_url),
      authorLabel: resolveCustomerCenterAuthorLabel({
        contentType,
        authorLabel: row.author_label,
      }),
      viewCount: Number(row.view_count) || 0,
      commentCount: Number(row.comment_count) || 0,
      commentEnabled: row.comment_enabled !== false,
      createdAt: String(row.published_at ?? row.created_at ?? ""),
      href: buildAppNoticeDetailPath(id),
      canonicalHref: buildCustomerCenterBoardDetailPath(contentType, id),
      source: "board" as const,
    });
  }

  return NextResponse.json({
    ok: true,
    notices,
    source: "app_notices_ssot",
  });
}
