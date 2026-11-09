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
import { APP_NOTICE_MEMBER_AUDIENCE, isAppNoticeVisibleToMembers } from "@/lib/notices/app-notice-audience";

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
  // 배달 오픈 4단계 — 사장님 전용 운영 공지는 회원 상세에서 없는 글로 본다(제목도 노출하지 않음)
  if (!row || !isAppNoticeVisibleToMembers(row)) {
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

  // 알림 최종 설계 §5 — 같은 게시판의 이전 글(더 오래된)·다음 글(더 최신), 게시 중인 글만.
  const pubAt = String(row.published_at ?? row.created_at ?? "");
  const neighborSelect = "id, title, is_active, starts_at, ends_at, archived_at, deleted_at, published_at";
  const [olderRes, newerRes] = await Promise.all([
    sb
      .from("app_notices")
      .select(neighborSelect)
      .eq("content_type", contentType)
      .eq("audience", APP_NOTICE_MEMBER_AUDIENCE)
      .eq("is_active", true)
      .is("deleted_at", null)
      .is("archived_at", null)
      .lt("published_at", pubAt)
      .order("published_at", { ascending: false })
      .limit(5),
    sb
      .from("app_notices")
      .select(neighborSelect)
      .eq("content_type", contentType)
      .eq("audience", APP_NOTICE_MEMBER_AUDIENCE)
      .eq("is_active", true)
      .is("deleted_at", null)
      .is("archived_at", null)
      .gt("published_at", pubAt)
      .order("published_at", { ascending: true })
      .limit(5),
  ]);
  const pickNeighbor = (rows: unknown) => {
    const hit = ((rows ?? []) as { id: string; title: string | null }[]).find((r) =>
      isCustomerCenterContentPublishedNow(r as Parameters<typeof isCustomerCenterContentPublishedNow>[0])
    );
    return hit
      ? {
          id: String(hit.id),
          title: String(hit.title ?? ""),
          canonicalHref: buildCustomerCenterBoardDetailPath(contentType, String(hit.id)),
        }
      : null;
  };

  return NextResponse.json({
    ok: true,
    unavailable: false,
    prev: pickNeighbor(olderRes.data),
    next: pickNeighbor(newerRes.data),
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
      commentCount: Number(row.comment_count) || 0,
      commentEnabled: row.comment_enabled !== false,
      createdAt: String(row.published_at ?? row.created_at ?? ""),
      // S7 — 업데이트 소식 글의 앱 버전
      appVersion: contentType === "update" && row.app_version ? String(row.app_version) : null,
      href,
      canonicalHref,
    },
  });
}
