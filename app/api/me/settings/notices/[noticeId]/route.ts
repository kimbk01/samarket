import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { buildAppNoticeDetailPath } from "@/lib/notices/app-notice-paths";
import {
  APP_NOTICES_CONTENT_SELECT,
  customerCenterContentUnavailableFallback,
  isCustomerCenterContentPublishedNow,
  parseCustomerCenterContentType,
  resolveCustomerCenterAuthorLabel,
} from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardDetailPath } from "@/lib/notices/customer-center-content-paths";
import { normalizeCustomerCenterHeroImageUrl } from "@/lib/notices/customer-center-media";
import { isMissingAppNoticesTableError } from "@/lib/notices/is-missing-app-notices-table-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ noticeId: string }> };

/**
 * Member content detail.
 * Soft-deleted / ended: safe fallback body (not bare 404) for Bell/Push history.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { noticeId: raw } = await ctx.params;
  const noticeId = String(raw ?? "").trim();
  if (!noticeId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row, error } = await sb
    .from("app_notices")
    .select(APP_NOTICES_CONTENT_SELECT)
    .eq("id", noticeId)
    .maybeSingle();

  if (error) {
    if (isMissingAppNoticesTableError(error.message ?? "")) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const id = String(row.id);
  const contentType = parseCustomerCenterContentType(row.content_type, "notice");
  const canonicalHref = buildCustomerCenterBoardDetailPath(contentType, id);
  const href = buildAppNoticeDetailPath(id);

  if (!isCustomerCenterContentPublishedNow(row) || row.deleted_at || row.archived_at) {
    return NextResponse.json({
      ok: true,
      unavailable: true,
      message: customerCenterContentUnavailableFallback("ko"),
      messageEn: customerCenterContentUnavailableFallback("en"),
      notice: {
        id,
        contentType,
        title: String(row.title ?? ""),
        body: customerCenterContentUnavailableFallback("ko"),
        heroImageUrl: null,
        authorLabel: resolveCustomerCenterAuthorLabel({
          contentType,
          authorLabel: row.author_label,
        }),
        viewCount: Number(row.view_count) || 0,
        commentEnabled: false,
        createdAt: String(row.published_at ?? row.created_at ?? ""),
        href,
        canonicalHref,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    unavailable: false,
    notice: {
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
      commentEnabled: row.comment_enabled !== false,
      createdAt: String(row.published_at ?? row.created_at ?? ""),
      href,
      canonicalHref,
    },
  });
}
