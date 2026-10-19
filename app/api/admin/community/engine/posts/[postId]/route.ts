import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { NextRequest, NextResponse } from "next/server";
import {
  applyCommunityPostAdminPatch,
  type CommunityPostAdminPatchBody,
} from "@/lib/admin/community-admin/community-post-admin-patch";
import { listRunningCommunityPromotionsForPost } from "@/lib/admin/community-admin/community-promotion-admin";
import {
  formatAdminMemberLabel,
  loadAdminMemberIdentityMap,
} from "@/lib/admin-community/member-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POST_DETAIL_SELECT =
  "id, user_id, location_id, section_slug, category, topic_id, topic_slug, title, content, summary, content_blocks, status, " +
  "is_reported, report_count, like_count, comment_count, view_count, created_at, published_at, updated_at, region_label, is_sample_data, " +
  "origin_kind, display_author_name, display_author_avatar_url, display_date, public_attribution_name, public_attribution_url, " +
  "moderated_by, moderated_at, moderation_reason, last_edited_by, last_edited_role, last_edit_reason, last_admin_edit_at, " +
  "is_notice, notice_starts_at, notice_ends_at, pinned_at, pinned_until, pinned_by, pin_scope, pin_rank, pin_reason";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * GET /api/admin/community/engine/posts/:postId
 * 운영 상세 — 작성자 식별·작성 구분·출처·조치(누가·언제·왜)·고정/공지·노출 중 홍보.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;
  const { sb } = admin;

  const { postId } = await ctx.params;
  const id = postId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const { data, error } = await sb.from("community_posts").select(POST_DETAIL_SELECT).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const row = data as unknown as Record<string, unknown>;
  const uid = str(row.user_id);
  const moderatedBy = str(row.moderated_by);
  const editedBy = str(row.last_edited_by);
  const pinnedBy = str(row.pinned_by);

  const [identityMap, imgs, promotions] = await Promise.all([
    loadAdminMemberIdentityMap(sb, [uid, moderatedBy, editedBy, pinnedBy]),
    sb
      .from("community_post_images")
      .select("id, image_url, sort_order")
      .eq("post_id", id)
      .order("sort_order", { ascending: true }),
    listRunningCommunityPromotionsForPost(sb, id),
  ]);
  const identity = uid ? identityMap.get(uid) : undefined;
  const labelOf = (userId: string) => (userId ? formatAdminMemberLabel(identityMap.get(userId) ?? null) : null);

  let images: Array<{ id: string; url: string; sort_order: number }> = [];
  if (Array.isArray(imgs.data)) {
    images = imgs.data.map((img) => {
      const i = img as { id?: string; image_url?: string; url?: string; sort_order?: number };
      return {
        id: String(i.id ?? ""),
        url: String(i.image_url ?? i.url ?? ""),
        sort_order: Number(i.sort_order ?? 0) || 0,
      };
    });
  }

  const nowMs = Date.now();
  const pinnedUntil = str(row.pinned_until);
  const isPinnedNow = Boolean(row.pinned_at) && (!pinnedUntil || Date.parse(pinnedUntil) > nowMs);

  return NextResponse.json({
    ok: true,
    post: {
      ...row,
      author_nickname: identity?.nickname ?? null,
      author_username: identity?.username ?? null,
      author_label: formatAdminMemberLabel(identity ?? null),
      moderated_by_label: labelOf(moderatedBy),
      last_edited_by_label: labelOf(editedBy),
      pinned_by_label: labelOf(pinnedBy),
      is_pinned_now: isPinnedNow,
      images,
      running_promotions: promotions,
    },
  });
}

/**
 * PATCH /api/admin/community/engine/posts/:postId
 * body: {
 *   expectedUpdatedAt: string,            // GET 의 updated_at (CAS, 필수)
 *   reason?: string,                      // 숨김·삭제·본문 수정 필수 (2자+), 복구는 선택
 *   status?: 'active'|'hidden'|'deleted',
 *   isReported?: boolean,
 *   title?: string, content?: string,
 *   contentBlocks?: ImportedContentBlock[] | null,  // origin_kind=imported 만
 *   topicId?: string, topicSlug?: string,
 *   promotionFault?: 'operator'|'member', // 노출 중 홍보가 걸린 글 숨김·삭제 시 필수
 * }
 * 409 { error:'conflict', post } · 400 { error:'reason_required' | 'promotion_fault_required', promotions } …
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;

  const { postId } = await ctx.params;
  const id = postId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: CommunityPostAdminPatchBody;
  try {
    body = (await req.json()) as CommunityPostAdminPatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const res = await applyCommunityPostAdminPatch(admin.sb, req, { actorId: admin.userId, postId: id, body });
  return NextResponse.json(res.body, { status: res.status });
}
