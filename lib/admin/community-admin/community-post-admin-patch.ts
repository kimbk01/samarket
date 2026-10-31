/**
 * 커뮤니티 게시글 관리자 변경 — 상태(숨김·삭제·복구)·본문 수정 공용 처리 (설계 §C-0-2 · E-2 · E-3 · F-1-2 · G-6).
 * `/api/admin/community/engine/posts/:id` PATCH 와 공지 PATCH 가 같은 규칙을 쓴다.
 *
 * - CAS: `expectedUpdatedAt` 필수, 다르면 409 `conflict` + 최신 행.
 * - 숨김·삭제·본문 수정은 사유 필수 (복구는 L1 — 사유 선택).
 * - 상태 변경 → moderated_by/at/reason, 본문 수정 → last_edited_* (리비전은 DB 트리거).
 * - 외부 수집 글(origin_kind=imported)만 content_blocks 수정 가능 (C-08).
 * - 노출 중·중지 홍보가 걸린 글을 숨김·삭제하면 귀책(promotionFault) 필수 → admin_promotion_end.
 * 서버 전용.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import {
  callAdminPromotionEnd,
  listRunningCommunityPromotionsForPost,
  parseCommunityPromotionFault,
} from "@/lib/admin/community-admin/community-promotion-admin";
import { sanitizeImportedContentBlocks } from "@/lib/community/imported-content-blocks";
import {
  notifyCommunityContentModerated,
  notifyCommunityPromotionEnded,
  type CommunityContentModerationKind,
} from "@/lib/notifications/notify-community-moderation";
import { applyCommunityPointReclaimOnPostAdminRemove } from "@/lib/points/community-point-bridge";
import { mergePostBodyImages } from "@/lib/philife/post-body-images";

export const COMMUNITY_POST_ADMIN_ROW_SELECT =
  "id, user_id, origin_kind, status, is_reported, title, content, content_blocks, images, thumbnail_url, topic_id, topic_slug, category, " +
  "is_notice, notice_starts_at, notice_ends_at, pinned_at, pinned_until, pin_scope, pin_rank, " +
  "moderated_by, moderated_at, moderation_reason, last_edited_by, last_edited_role, last_edit_reason, last_admin_edit_at, updated_at";

export type CommunityPostAdminPatchBody = {
  expectedUpdatedAt?: unknown;
  reason?: unknown;
  status?: unknown;
  isReported?: unknown;
  title?: unknown;
  content?: unknown;
  contentBlocks?: unknown;
  topicId?: unknown;
  topicSlug?: unknown;
  promotionFault?: unknown;
};

export type CommunityPostAdminPatchResult = { status: number; body: Record<string, unknown> };

type PostRow = Record<string, unknown> & {
  id: string;
  user_id?: string | null;
  origin_kind?: string | null;
  status?: string | null;
  title?: string | null;
  content?: string | null;
  content_blocks?: unknown;
  topic_id?: string | null;
  updated_at?: string | null;
};

/** CAS 비교 — 같은 시각(마이크로초 포함)이면 같은 버전 */
export function sameUpdatedAtInstant(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a === b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  if (ta !== tb) return false;
  // Date.parse 는 ms 까지만 — 마이크로초 자리까지 같아야 같은 버전으로 본다.
  const micro = (s: string) => (s.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(0, 6);
  return micro(a) === micro(b);
}

/** `community_post_images` 미러 — 회원 PATCH 와 같은 delete→insert (CM-P3-02 원자화는 별도 승인) */
async function syncCommunityPostImageRows(sb: SupabaseClient, postId: string, images: string[]): Promise<void> {
  const { error: delErr } = await sb.from("community_post_images").delete().eq("post_id", postId);
  if (delErr) {
    console.error("[community-post-admin-patch] post_images delete", delErr.message);
    return;
  }
  if (images.length === 0) return;
  const { error } = await sb.from("community_post_images").insert(
    images.map((url, i) => ({ post_id: postId, image_url: url, storage_path: "", sort_order: i }))
  );
  if (error) console.error("[community-post-admin-patch] post_images insert", error.message);
}

async function loadPostRow(sb: SupabaseClient, postId: string): Promise<PostRow | null> {
  const { data } = await sb.from("community_posts").select(COMMUNITY_POST_ADMIN_ROW_SELECT).eq("id", postId).maybeSingle();
  return (data as PostRow | null) ?? null;
}

export async function applyCommunityPostAdminPatch(
  sb: SupabaseClient,
  req: Request | null,
  input: {
    actorId: string;
    postId: string;
    body: CommunityPostAdminPatchBody;
    /** 공지 전용 필드 등 같은 UPDATE 에 실을 추가 값 (호출부에서 검증) */
    extraPatch?: Record<string, unknown>;
    /** 공지 PATCH: is_notice 글만 */
    requireNotice?: boolean;
    /** 공지 수정(L1): 본문 수정 사유 선택 */
    editReasonOptional?: boolean;
    auditTargetType?: string;
  }
): Promise<CommunityPostAdminPatchResult> {
  const { body, postId } = input;
  const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
  if (!expected) return { status: 400, body: { ok: false, error: "expected_updated_at_required" } };

  const before = await loadPostRow(sb, postId);
  if (!before) return { status: 404, body: { ok: false, error: "not_found" } };
  if (input.requireNotice && before.is_notice !== true) {
    return { status: 400, body: { ok: false, error: "not_notice" } };
  }
  if (!sameUpdatedAtInstant(before.updated_at, expected)) {
    return { status: 409, body: { ok: false, error: "conflict", post: before } };
  }

  const reason = normalizeCommunityAdminReason(body.reason);
  const isImported = before.origin_kind === "imported";
  const patch: Record<string, unknown> = { ...(input.extraPatch ?? {}) };

  // ── 상태
  const nextStatus =
    body.status === "active" || body.status === "hidden" || body.status === "deleted" ? body.status : null;
  if (body.status !== undefined && body.status !== null && !nextStatus) {
    return { status: 400, body: { ok: false, error: "invalid_status" } };
  }
  const statusChange = nextStatus !== null && nextStatus !== before.status;
  if (typeof body.isReported === "boolean") patch.is_reported = body.isReported;

  // ── 본문
  let contentEdited = false;
  let syncedImages: string[] | null = null;
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return { status: 400, body: { ok: false, error: "title_required" } };
    if (title !== before.title) {
      patch.title = title;
      contentEdited = true;
    }
  }
  if (typeof body.content === "string") {
    if (!body.content.trim()) return { status: 400, body: { ok: false, error: "content_required" } };
    if (body.content !== before.content) {
      patch.content = body.content;
      const { summarizeCommunityPostContent } = await import("@/lib/philife/interleaved-body-markdown");
      patch.summary = summarizeCommunityPostContent(body.content);
      contentEdited = true;
      // native 글: 회원 경로와 같은 규칙으로 images·대표 썸네일을 본문과 맞춘다 (CM-W-07). imported 는 기존 정책 유지.
      if (!isImported) {
        /** 회원 서식 글: 관리자 평문 수정이 원천이 된다 — 서식 블록 해제(Owner 승인 ① 설계 §2). 리비전에 이전 블록 보존 */
        if (before.content_blocks != null) patch.content_blocks = null;
        const prevImages = Array.isArray(before.images) ? (before.images as unknown[]) : [];
        const nextImages = mergePostBodyImages({
          content: body.content,
          previousContent: typeof before.content === "string" ? before.content : "",
          candidates: prevImages,
        });
        const prevStr = prevImages.map((u) => (typeof u === "string" ? u.trim() : ""));
        if (nextImages.length !== prevStr.length || nextImages.some((u, i) => u !== prevStr[i])) {
          patch.images = nextImages;
          syncedImages = nextImages;
          const thumb = typeof before.thumbnail_url === "string" ? before.thumbnail_url.trim() : "";
          if (thumb && !nextImages.includes(thumb)) patch.thumbnail_url = nextImages[0] ?? null;
        }
      }
    }
  }
  if (body.contentBlocks !== undefined) {
    if (!isImported) return { status: 400, body: { ok: false, error: "content_blocks_imported_only" } };
    if (body.contentBlocks === null) {
      if (before.content_blocks != null) {
        patch.content_blocks = null;
        contentEdited = true;
      }
    } else {
      if (!Array.isArray(body.contentBlocks)) {
        return { status: 400, body: { ok: false, error: "invalid_content_blocks" } };
      }
      const blocks = sanitizeImportedContentBlocks(body.contentBlocks);
      if (body.contentBlocks.length > 0 && blocks.length === 0) {
        return { status: 400, body: { ok: false, error: "invalid_content_blocks" } };
      }
      const next = blocks.length ? blocks : null;
      if (JSON.stringify(next) !== JSON.stringify(before.content_blocks ?? null)) {
        patch.content_blocks = next;
        contentEdited = true;
      }
    }
  }

  const topicId = typeof body.topicId === "string" ? body.topicId.trim() : "";
  const topicSlug = typeof body.topicSlug === "string" ? body.topicSlug.trim().toLowerCase() : "";
  if (topicId || topicSlug) {
    if (!topicId || !topicSlug) return { status: 400, body: { ok: false, error: "topic_incomplete" } };
    if (topicId !== before.topic_id) {
      const { getPhilifeNeighborhoodSectionSlugServer } = await import(
        "@/lib/community-feed/philife-neighborhood-section"
      );
      const { resolveTopicMeta } = await import("@/lib/community-feed/queries");
      const { deriveCommunityPostCategoryBucket } = await import(
        "@/lib/neighborhood/derive-community-post-category-bucket"
      );
      const sectionSlug = await getPhilifeNeighborhoodSectionSlugServer(sb);
      const meta = await resolveTopicMeta(sectionSlug, topicSlug);
      if (!meta || meta.is_feed_sort || meta.id !== topicId) {
        return { status: 400, body: { ok: false, error: "invalid_topic" } };
      }
      patch.topic_id = meta.id;
      patch.topic_slug = topicSlug;
      patch.category = deriveCommunityPostCategoryBucket({
        topicOrCategoryRaw: topicSlug,
        isMeetup: Boolean(meta.allow_meetup),
      });
      contentEdited = true;
    }
  }

  const removing = statusChange && (nextStatus === "hidden" || nextStatus === "deleted");
  if ((removing || (contentEdited && !input.editReasonOptional)) && !reason) {
    return { status: 400, body: { ok: false, error: "reason_required" } };
  }

  const nowIso = new Date().toISOString();
  if (statusChange) {
    patch.status = nextStatus;
    patch.moderated_by = input.actorId;
    patch.moderated_at = nowIso;
    patch.moderation_reason = reason;
  }
  if (contentEdited) {
    patch.last_edited_by = input.actorId;
    patch.last_edited_role = "admin";
    patch.last_edit_reason = reason;
  }

  if (Object.keys(patch).length === 0) return { status: 400, body: { ok: false, error: "no_updates" } };
  // community_posts 에 updated_at 자동 갱신 트리거가 없다 — CAS 토큰을 직접 전진시킨다.
  patch.updated_at = nowIso;

  // ── 홍보 중인 글 숨김·삭제: 귀책 선택 필수 (§F-1-2 #3·#5·#6)
  const promotions = removing ? await listRunningCommunityPromotionsForPost(sb, postId) : [];
  const fault = parseCommunityPromotionFault(body.promotionFault);
  if (promotions.length > 0 && !fault) {
    return {
      status: 400,
      body: {
        ok: false,
        error: "promotion_fault_required",
        promotions: promotions.map((p) => ({ id: p.id, orderStatus: p.orderStatus, endAt: p.endAt })),
      },
    };
  }

  const { data: updated, error } = await sb
    .from("community_posts")
    .update(patch)
    .eq("id", postId)
    .eq("updated_at", String(before.updated_at))
    .select(COMMUNITY_POST_ADMIN_ROW_SELECT)
    .maybeSingle();
  if (error) return { status: 500, body: { ok: false, error: error.message } };
  if (!updated) {
    const fresh = await loadPostRow(sb, postId);
    return { status: 409, body: { ok: false, error: "conflict", post: fresh } };
  }
  const after = updated as unknown as PostRow;

  if (syncedImages) {
    await syncCommunityPostImageRows(sb, postId, syncedImages);
  }

  if (removing) {
    await applyCommunityPointReclaimOnPostAdminRemove({ postId });
  }

  // ── 홍보 자동 종료 + 구매자 알림
  const promotionEnd: Array<Record<string, unknown>> = [];
  if (removing && fault) {
    for (const p of promotions) {
      const res = await callAdminPromotionEnd(sb, {
        orderId: p.id,
        actorId: input.actorId,
        reasonCode: nextStatus === "deleted" ? "post_deleted" : "post_hidden",
        fault,
        reason: reason ?? "",
      });
      if (!res.ok) {
        promotionEnd.push({ orderId: p.id, ok: false, error: res.error });
        continue;
      }
      promotionEnd.push({ orderId: p.id, ok: true, refundPoints: res.refundPoints, refundLedgerId: res.refundLedgerId });
      try {
        await notifyCommunityPromotionEnded(sb, {
          userId: p.userId,
          orderId: p.id,
          refundPoints: res.refundPoints,
          reason,
        });
      } catch (e) {
        console.error("[community-post-admin-patch] promotion notify", e);
      }
    }
  }

  const action = statusChange
    ? `community_post.status_${nextStatus}`
    : contentEdited
      ? "community_post.content_update"
      : "community_post.update";
  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: input.actorId,
    targetType: input.auditTargetType ?? "community_post",
    targetId: postId,
    action,
    reason,
    before: {
      status: before.status ?? null,
      is_reported: before.is_reported ?? null,
      title: before.title ?? null,
      content: before.content ?? null,
      ...(isImported ? { content_blocks: before.content_blocks ?? null } : {}),
      topic_id: before.topic_id ?? null,
      topic_slug: before.topic_slug ?? null,
      user_id: before.user_id ?? null,
      origin_kind: before.origin_kind ?? null,
      updated_at: before.updated_at ?? null,
    },
    after: {
      ...patch,
      updated_at: after.updated_at ?? null,
      ...(promotionEnd.length ? { promotion_end: promotionEnd, promotion_fault: fault } : {}),
    },
  });

  // ── 작성자 알림 (회원 글만 — 외부 수집·운영팀 글 제외)
  if (before.origin_kind !== "imported" && before.origin_kind !== "admin") {
    const kinds: CommunityContentModerationKind[] = [];
    if (statusChange) {
      if (nextStatus === "hidden") kinds.push("hidden");
      else if (nextStatus === "deleted") kinds.push("deleted");
      else kinds.push("restored");
    }
    if (contentEdited) kinds.push("edited");
    for (const kind of kinds) {
      try {
        await notifyCommunityContentModerated(sb, {
          userId: before.user_id,
          postId,
          kind,
          reason,
          dedupeId: `${postId}:${String(after.updated_at ?? nowIso)}`,
        });
      } catch (e) {
        console.error("[community-post-admin-patch] author notify", e);
      }
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      post: after,
      auditOk: audit.ok,
      ...(promotionEnd.length ? { promotionEnd } : {}),
    },
  };
}
