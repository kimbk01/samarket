/**
 * 커뮤니티 게시글 첨부 이미지 1장 관리자 삭제 (DELETE /api/admin/community/engine/posts/:postId/images/:imageId).
 *
 * 데이터 모델 (이미지 참조 위치):
 * - `community_post_images` 행 (id · image_url · storage_path · sort_order) — 관리자 상세가 보여 주는 목록, imageId 키.
 * - `community_posts.images` (jsonb URL 배열) · `community_posts.thumbnail_url`.
 * - `community_posts.content` 안의 교차 본문 마크다운 `![](url)` (회원 글).
 * - `community_posts.content_blocks` 의 `{ t:"img", url }` (외부 수집 글).
 *
 * 저장소 정책 (`lib/media/canonical-image-lifecycle.server`):
 * - 참조만 끊는 수정·소프트 삭제는 저장소 객체를 남기고, 더 이상 아무 데서도 참조하지 않을 때만 원본+파생본을 지운다.
 * - 수정 이력(`community_post_revisions`, 신고 증거 보존 — FK 없음)의 본문·블록이 그 URL 을 담고 있으면
 *   참조로 보고 저장소를 남긴다 (본문에서 이미지를 뺀 경우 방금 남긴 이력이 이 경우다).
 * - 다른 글의 `community_post_images` · `images` · `thumbnail_url` 이 같은 URL 을 쓰면 남긴다.
 * - 감사 기록에 실패하면 되돌릴 수 없는 저장소 삭제는 하지 않는다.
 * 서버 전용.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendCommunityAdminAudit } from "@/lib/admin/community-admin/community-admin-audit";
import { normalizeCommunityAdminReason } from "@/lib/admin/community-admin/community-admin-reason";
import { sameUpdatedAtInstant } from "@/lib/admin/community-admin/community-post-admin-patch";
import {
  collectCanonicalImagePublicUrls,
  removeCanonicalImagesFromPublicUrls,
} from "@/lib/media/canonical-image-lifecycle.server";
import { normalizeToObjectPublicUrl } from "@/lib/media/canonical-image-path";
import { notifyCommunityContentModerated } from "@/lib/notifications/notify-community-moderation";
import { summarizeCommunityPostContent } from "@/lib/philife/interleaved-body-markdown";

const POST_SELECT =
  "id, user_id, origin_kind, status, title, content, content_blocks, images, thumbnail_url, " +
  "last_edited_by, last_edited_role, last_edit_reason, last_admin_edit_at, updated_at";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MD_IMG_RE = /!\[[^\]]*\]\(([^)]+)\)/g;
const REVISION_SCAN_LIMIT = 500;

export type CommunityPostImageDeleteBody = { expectedUpdatedAt?: unknown; reason?: unknown };
export type CommunityPostImageDeleteResult = { status: number; body: Record<string, unknown> };

/** 저장소 처리 결과 — removed: 지움 · retained_*: 다른 참조가 있어 남김 · skipped_*: 지우지 않음 */
export type CommunityPostImageStorageOutcome =
  | "removed"
  | "removal_failed"
  | "retained_referenced_elsewhere"
  | "retained_revision_history"
  | "skipped_not_canonical"
  | "skipped_audit_failed"
  | "skipped_row_delete_failed";

type PostRow = Record<string, unknown> & {
  id: string;
  user_id?: string | null;
  origin_kind?: string | null;
  content?: string | null;
  content_blocks?: unknown;
  images?: unknown;
  thumbnail_url?: string | null;
  updated_at?: string | null;
};

function sameImageUrl(a: unknown, target: string): boolean {
  if (typeof a !== "string" || !a.trim()) return false;
  const t = a.trim();
  if (t === target) return true;
  return normalizeToObjectPublicUrl(t) === normalizeToObjectPublicUrl(target);
}

/** 본문 `![](url)` 중 대상 이미지 제거. 바뀌지 않았으면 원문 그대로. */
export function removeImageFromInterleavedContent(content: string, url: string): string {
  let changed = false;
  const next = content.replace(MD_IMG_RE, (whole, raw: string) => {
    if (!sameImageUrl(raw, url)) return whole;
    changed = true;
    return "";
  });
  if (!changed) return content;
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

export function removeImageFromContentBlocks(blocks: unknown, url: string): { blocks: unknown; changed: boolean } {
  if (!Array.isArray(blocks)) return { blocks, changed: false };
  const next = blocks.filter(
    (b) => !(b && typeof b === "object" && (b as { t?: unknown }).t === "img" && sameImageUrl((b as { url?: unknown }).url, url))
  );
  if (next.length === blocks.length) return { blocks, changed: false };
  return { blocks: next.length ? next : null, changed: true };
}

function textMentionsUrl(text: unknown, url: string): boolean {
  if (typeof text !== "string" || !text) return false;
  const n = normalizeToObjectPublicUrl(url) ?? url;
  return text.includes(url) || text.includes(n);
}

/** 다른 곳에서 여전히 이 URL 을 쓰는가 (삭제한 행·수정 후 글 기준). */
async function findRemainingReference(
  sb: SupabaseClient,
  input: { postId: string; imageId: string; url: string; after: PostRow }
): Promise<"none" | "elsewhere" | "revision"> {
  const { postId, imageId, url, after } = input;
  // 수정 후 같은 글 (본문에 다른 표기로 남은 경우 등)
  if (
    textMentionsUrl(after.content, url) ||
    textMentionsUrl(JSON.stringify(after.content_blocks ?? null), url) ||
    (Array.isArray(after.images) && after.images.some((u) => sameImageUrl(u, url))) ||
    sameImageUrl(after.thumbnail_url, url)
  ) {
    return "elsewhere";
  }
  const [rowsRes, imagesRes, thumbRes, revRes] = await Promise.all([
    sb.from("community_post_images").select("id").eq("image_url", url).neq("id", imageId).limit(1),
    sb.from("community_posts").select("id").contains("images", JSON.stringify([url])).limit(1),
    sb.from("community_posts").select("id").eq("thumbnail_url", url).limit(1),
    sb
      .from("community_post_revisions")
      .select("content, content_blocks")
      .eq("post_id", postId)
      .limit(REVISION_SCAN_LIMIT),
  ]);
  // 조회 실패 시 지우지 않는다 (fail-closed)
  if (rowsRes.error || imagesRes.error || thumbRes.error) return "elsewhere";
  if ((rowsRes.data ?? []).length > 0 || (imagesRes.data ?? []).length > 0 || (thumbRes.data ?? []).length > 0) {
    return "elsewhere";
  }
  if (revRes.error) return "revision";
  const revs = (revRes.data ?? []) as Array<{ content?: unknown; content_blocks?: unknown }>;
  if (revs.some((r) => textMentionsUrl(r.content, url) || textMentionsUrl(JSON.stringify(r.content_blocks ?? null), url))) {
    return "revision";
  }
  return "none";
}

export async function deleteCommunityPostImageAsAdmin(
  sb: SupabaseClient,
  req: Request | null,
  input: { actorId: string; postId: string; imageId: string; body: CommunityPostImageDeleteBody }
): Promise<CommunityPostImageDeleteResult> {
  const { postId, imageId, body } = input;
  const expected = typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
  if (!expected) return { status: 400, body: { ok: false, error: "expected_updated_at_required" } };
  const reason = normalizeCommunityAdminReason(body.reason);
  if (!reason) return { status: 400, body: { ok: false, error: "reason_required" } };

  const { data: beforeRaw, error: loadErr } = await sb
    .from("community_posts")
    .select(POST_SELECT)
    .eq("id", postId)
    .maybeSingle();
  if (loadErr) return { status: 500, body: { ok: false, error: "load_failed" } };
  const before = (beforeRaw as PostRow | null) ?? null;
  if (!before) return { status: 404, body: { ok: false, error: "not_found" } };
  if (!sameUpdatedAtInstant(before.updated_at, expected)) {
    return { status: 409, body: { ok: false, error: "conflict", post: before } };
  }

  if (!UUID_RE.test(imageId)) return { status: 404, body: { ok: false, error: "image_not_found" } };
  const { data: imgRaw, error: imgErr } = await sb
    .from("community_post_images")
    .select("id, post_id, image_url, storage_path, sort_order")
    .eq("id", imageId)
    .eq("post_id", postId)
    .maybeSingle();
  if (imgErr) return { status: 500, body: { ok: false, error: "load_failed" } };
  const image = imgRaw as { id: string; image_url?: string | null; storage_path?: string | null; sort_order?: number | null } | null;
  const url = typeof image?.image_url === "string" ? image.image_url.trim() : "";
  if (!image || !url) return { status: 404, body: { ok: false, error: "image_not_found" } };

  // ── 글에서 참조 제거 (images · thumbnail · 본문 마크다운 · 외부 수집 블록)
  const nowIso = new Date().toISOString();
  const beforeImages = Array.isArray(before.images) ? before.images : [];
  const nextImages = beforeImages.filter((u) => !sameImageUrl(u, url));
  const patch: Record<string, unknown> = {
    updated_at: nowIso,
    last_edited_by: input.actorId,
    last_edited_role: "admin",
    last_edit_reason: reason,
    last_admin_edit_at: nowIso,
  };
  if (nextImages.length !== beforeImages.length) patch.images = nextImages;
  if (sameImageUrl(before.thumbnail_url, url)) {
    const first = nextImages.find((u) => typeof u === "string" && u.trim());
    patch.thumbnail_url = typeof first === "string" ? first : null;
  }
  const beforeContent = typeof before.content === "string" ? before.content : "";
  const nextContent = removeImageFromInterleavedContent(beforeContent, url);
  const contentChanged = nextContent !== beforeContent;
  if (contentChanged) {
    patch.content = nextContent;
    patch.summary = summarizeCommunityPostContent(nextContent);
  }
  const blocks = removeImageFromContentBlocks(before.content_blocks, url);
  if (blocks.changed) patch.content_blocks = blocks.blocks;

  const { data: updatedRaw, error: upErr } = await sb
    .from("community_posts")
    .update(patch)
    .eq("id", postId)
    .eq("updated_at", String(before.updated_at))
    .select(POST_SELECT)
    .maybeSingle();
  if (upErr) return { status: 500, body: { ok: false, error: upErr.message } };
  if (!updatedRaw) {
    const { data: fresh } = await sb.from("community_posts").select(POST_SELECT).eq("id", postId).maybeSingle();
    return { status: 409, body: { ok: false, error: "conflict", post: fresh ?? null } };
  }
  const after = updatedRaw as unknown as PostRow;

  const { error: rowDelErr } = await sb.from("community_post_images").delete().eq("id", imageId).eq("post_id", postId);

  // ── 저장소 정리 판단 (감사 기록 전에 결정해 함께 남긴다)
  const canonical = collectCanonicalImagePublicUrls([url]).length > 0;
  let storage: CommunityPostImageStorageOutcome;
  if (rowDelErr) storage = "skipped_row_delete_failed";
  else if (!canonical) storage = "skipped_not_canonical";
  else {
    const ref = await findRemainingReference(sb, { postId, imageId, url, after });
    storage = ref === "elsewhere" ? "retained_referenced_elsewhere" : ref === "revision" ? "retained_revision_history" : "removed";
  }

  const audit = await appendCommunityAdminAudit(sb, req, {
    actorId: input.actorId,
    targetType: "community_post",
    targetId: postId,
    action: "community_post.image_delete",
    reason,
    before: {
      image_id: imageId,
      image_url: url,
      storage_path: image.storage_path ?? null,
      sort_order: image.sort_order ?? null,
      images: beforeImages,
      thumbnail_url: before.thumbnail_url ?? null,
      ...(contentChanged ? { content: beforeContent } : {}),
      ...(blocks.changed ? { content_blocks: before.content_blocks ?? null } : {}),
      user_id: before.user_id ?? null,
      origin_kind: before.origin_kind ?? null,
      updated_at: before.updated_at ?? null,
    },
    after: {
      image_id: imageId,
      image_url: url,
      images: Array.isArray(after.images) ? after.images : nextImages,
      thumbnail_url: after.thumbnail_url ?? null,
      content_changed: contentChanged,
      content_blocks_changed: blocks.changed,
      image_row_deleted: !rowDelErr,
      storage_decision: storage === "removed" ? "remove_unreferenced" : storage,
      updated_at: after.updated_at ?? null,
    },
  });

  if (storage === "removed") {
    if (!audit.ok) {
      storage = "skipped_audit_failed";
    } else {
      const removal = await removeCanonicalImagesFromPublicUrls({
        sb,
        urls: [url],
        context: "admin/community/posts/image-delete",
      });
      if (removal.failed.length > 0) {
        storage = "removal_failed";
        console.error("[admin/community/posts/image-delete] storage cleanup failed", removal.failed);
      }
    }
  }

  if (rowDelErr) {
    return {
      status: 500,
      body: { ok: false, error: "image_row_delete_failed", post: after, auditOk: audit.ok, storage },
    };
  }

  // ── 작성자 알림 (회원 글만 — 외부 수집·운영팀 글 제외)
  if (before.origin_kind !== "imported" && before.origin_kind !== "admin") {
    try {
      await notifyCommunityContentModerated(sb, {
        userId: before.user_id,
        postId,
        kind: "edited",
        reason,
        dedupeId: `${postId}:${String(after.updated_at ?? nowIso)}`,
      });
    } catch (e) {
      console.error("[admin/community/posts/image-delete] author notify", e);
    }
  }

  return { status: 200, body: { ok: true, post: after, imageId, storage, auditOk: audit.ok } };
}
