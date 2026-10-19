import { NextRequest, NextResponse } from "next/server";
import { requireCommunityAdmin } from "@/lib/admin/community-admin/community-admin-guards";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  COMMUNITY_NOTICE_LIST_SELECT,
  parseNoticeWindow,
} from "@/lib/admin/community-admin/community-notice-admin";
import {
  applyCommunityPostAdminPatch,
  sameUpdatedAtInstant,
  type CommunityPostAdminPatchBody,
} from "@/lib/admin/community-admin/community-post-admin-patch";
import { COMMUNITY_POST_PIN_CLEAR_PATCH } from "@/lib/admin/community-admin/community-post-pin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/community/notices/:postId
 * - 공지 종료: { action:'end', expectedUpdatedAt, reason?, alsoHide?: boolean }
 *   → notice_ends_at=now + 고정 해제 (글은 보존 · alsoHide 면 관리자 숨김, 사유 필수)
 * - 수정: 게시글 PATCH 와 같은 body (expectedUpdatedAt 필수, title/content/topicId+topicSlug/status…)
 *   + noticeStartsAt?, noticeEndsAt? (ISO|null). 공지 본문 수정 사유는 선택(L1), 숨김·삭제는 필수.
 * → 200 { ok, post } · 409 { error:'conflict', post } · 400 not_notice …
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const admin = await requireCommunityAdmin("content");
  if (!admin.ok) return admin.response;
  const { sb } = admin;
  const { postId } = await ctx.params;
  const id = postId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.action === "end") {
    const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
    if (!expected) return NextResponse.json({ ok: false, error: "expected_updated_at_required" }, { status: 400 });
    const reason = normalizeCommunityAdminReason(body.reason);
    const alsoHide = body.alsoHide === true;
    if (alsoHide && !reason) return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });

    const { data: before } = await sb.from("community_posts").select(COMMUNITY_NOTICE_LIST_SELECT).eq("id", id).maybeSingle();
    if (!before) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    const b = before as unknown as Record<string, unknown>;
    if (b.is_notice !== true) return NextResponse.json({ ok: false, error: "not_notice" }, { status: 400 });
    if (!sameUpdatedAtInstant(b.updated_at, expected)) {
      return NextResponse.json({ ok: false, error: "conflict", post: before }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const endsAt = b.notice_ends_at ? String(b.notice_ends_at) : null;
    const patch: Record<string, unknown> = { ...COMMUNITY_POST_PIN_CLEAR_PATCH };
    if (!endsAt || Date.parse(endsAt) > Date.now()) patch.notice_ends_at = nowIso;
    if (alsoHide && b.status === "active") {
      patch.status = "hidden";
      patch.moderated_by = admin.userId;
      patch.moderated_at = nowIso;
      patch.moderation_reason = reason;
    }

    const { data: after, error } = await sb
      .from("community_posts")
      .update(patch)
      .eq("id", id)
      .eq("updated_at", String(b.updated_at))
      .select(COMMUNITY_NOTICE_LIST_SELECT)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!after) {
      const { data: fresh } = await sb.from("community_posts").select(COMMUNITY_NOTICE_LIST_SELECT).eq("id", id).maybeSingle();
      return NextResponse.json({ ok: false, error: "conflict", post: fresh ?? null }, { status: 409 });
    }
    const audit = await appendCommunityAdminAudit(sb, req, {
      actorId: admin.userId,
      targetType: "community_post",
      targetId: id,
      action: "community_notice.end",
      reason,
      before: {
        status: b.status ?? null,
        notice_starts_at: b.notice_starts_at ?? null,
        notice_ends_at: b.notice_ends_at ?? null,
        pinned_at: b.pinned_at ?? null,
        pin_scope: b.pin_scope ?? null,
      },
      after: patch,
    });
    return NextResponse.json({ ok: true, post: after, auditOk: audit.ok });
  }

  // ── 수정 (게시글 PATCH 와 같은 규칙)
  const extraPatch: Record<string, unknown> = {};
  if ("noticeStartsAt" in body || "noticeEndsAt" in body) {
    const { data: cur } = await sb
      .from("community_posts")
      .select("notice_starts_at, notice_ends_at")
      .eq("id", id)
      .maybeSingle();
    const c = (cur ?? {}) as { notice_starts_at?: string | null; notice_ends_at?: string | null };
    const win = parseNoticeWindow(
      "noticeStartsAt" in body ? body.noticeStartsAt : c.notice_starts_at,
      "noticeEndsAt" in body ? body.noticeEndsAt : c.notice_ends_at
    );
    if (!win.ok) return NextResponse.json({ ok: false, error: win.error }, { status: 400 });
    if ("noticeStartsAt" in body) extraPatch.notice_starts_at = win.startsAt;
    if ("noticeEndsAt" in body) extraPatch.notice_ends_at = win.endsAt;
  }

  const res = await applyCommunityPostAdminPatch(sb, req, {
    actorId: admin.userId,
    postId: id,
    body: body as CommunityPostAdminPatchBody,
    extraPatch,
    requireNotice: true,
    editReasonOptional: true,
  });
  return NextResponse.json(res.body, { status: res.status });
}
