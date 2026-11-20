import type { SupabaseClient } from "@supabase/supabase-js";
import { POST_IMAGES_BUCKET } from "@/lib/media/canonical-image-contract";
import { parseSupabasePublicObjectUrl } from "@/lib/media/canonical-image-path";
import { canonicalStoragePathsForOriginal } from "@/lib/media/canonical-image-upload.server";

/**
 * 커뮤니티 글 사진 정리 (Owner 승인 ③ 2026-10-31 · docs/audit/philife-editor-storage-design-2026-10-31.md §5).
 * 참조 판정은 DB 함수(`community_post_image_*`) 하나 — 63개 열 어디에든 파일 이름이 있으면 지우지 않는다.
 * 저장소 삭제 오류는 결과에 그대로 남긴다(조용히 성공 처리 금지).
 */

/** 매일 정리는 이 시각 이후 올린 파일만 — 그 전 파일(기존 고아)은 Owner 승인 ④ 백업 절차로만 처리 */
export const COMMUNITY_POST_IMAGE_GC_CREATED_AFTER = "2026-10-31T00:00:00Z";
/** 작성 중 파일을 지우지 않도록 업로드 후 72시간이 지난 것만 */
export const COMMUNITY_POST_IMAGE_GC_MIN_AGE = "72 hours";
export const COMMUNITY_POST_IMAGE_GC_LIMIT = 200;
/** 즉시 정리 요청은 올린 지 24시간 이내 본인 파일만 */
export const COMMUNITY_POST_IMAGE_DISCARD_MAX_AGE = "24 hours";

const ORIGINAL_RE = /^[0-9a-f-]{36}\/community\/(import\/)?[0-9a-f-]{36}\.(webp|jpe?g|png|gif)$/i;

/** 공개 주소 → 커뮤니티 글 사진 원본 경로(그 밖 주소는 null) */
export function communityPostImagePathFromUrl(url: string): string | null {
  const parsed = parseSupabasePublicObjectUrl((url ?? "").trim());
  if (!parsed || parsed.bucket !== POST_IMAGES_BUCKET) return null;
  return ORIGINAL_RE.test(parsed.path) ? parsed.path : null;
}

export type CommunityImageRemoveResult = { removed: string[]; failed: { path: string; error: string }[] };

/** 원본 + 파생 3개 삭제 — 오류는 경로별로 돌려준다 */
export async function removeCommunityPostImageOriginals(
  sb: SupabaseClient,
  originals: readonly string[]
): Promise<CommunityImageRemoveResult> {
  const out: CommunityImageRemoveResult = { removed: [], failed: [] };
  for (const original of originals) {
    const paths = canonicalStoragePathsForOriginal(original, POST_IMAGES_BUCKET);
    const { error } = await sb.storage.from(POST_IMAGES_BUCKET).remove(paths);
    if (error) out.failed.push({ path: original, error: error.message || "remove_failed" });
    else out.removed.push(...paths);
  }
  return out;
}

async function rpcNames(
  sb: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<{ ok: true; names: string[] } | { ok: false; error: string }> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const names = ((data ?? []) as { name?: unknown }[])
    .map((r) => (typeof r.name === "string" ? r.name : ""))
    .filter(Boolean);
  return { ok: true, names };
}

/**
 * 삭제한 글의 사진 보관 기간 — Owner 2026-11-20 「30일 뒤 삭제」. 기준 시각 = `community_posts.deleted_at`(트리거)
 * (감사 docs/audit/lounge-paste-images-2026-11-20.md §11 O2 · 마이그레이션 20271120090000)
 */
export const COMMUNITY_DELETED_POST_IMAGE_RETENTION_DAYS = 30;
/** 하루 1회 처리하는 삭제 글 수 — 참조 판정 1회(약 1.5초) 안에 끝나도록 */
export const COMMUNITY_DELETED_POST_IMAGE_PURGE_LIMIT = 50;

/** 주어진 원본 경로 중 어디에서도 참조되지 않는 것 */
export function findUnreferencedCommunityImages(sb: SupabaseClient, originals: readonly string[]) {
  return rpcNames(sb, "community_post_image_unreferenced", { p_names: [...originals] });
}

/** 주어진 글(본문·사진 열·첨부 표·수정 기록)을 빼고 판정 — 삭제 30일 지난 글의 사진 정리용 */
export function findUnreferencedCommunityImagesExcludingPosts(
  sb: SupabaseClient,
  originals: readonly string[],
  excludePostIds: readonly string[]
) {
  return rpcNames(sb, "community_post_image_unreferenced_excluding_posts", {
    p_names: [...originals],
    p_exclude_post_ids: [...excludePostIds],
  });
}

/** 본인·24시간 이내·미참조만 */
export function findDiscardableCommunityImages(sb: SupabaseClient, ownerUserId: string, originals: readonly string[]) {
  return rpcNames(sb, "community_post_image_discardable", {
    p_owner: ownerUserId,
    p_names: [...originals],
    p_max_age: COMMUNITY_POST_IMAGE_DISCARD_MAX_AGE,
  });
}

/** 매일 정리 후보 */
export function findCommunityImageGcCandidates(sb: SupabaseClient) {
  return rpcNames(sb, "community_post_image_gc_candidates", {
    p_created_after: COMMUNITY_POST_IMAGE_GC_CREATED_AFTER,
    p_min_age: COMMUNITY_POST_IMAGE_GC_MIN_AGE,
    p_limit: COMMUNITY_POST_IMAGE_GC_LIMIT,
  });
}

/** 글 한 건의 사진 주소 전부(images · thumbnail · 본문 `![](url)` · 서식 블록 img) */
export function collectCommunityPostRowImageUrls(row: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const add = (u: unknown) => {
    if (typeof u === "string" && u.trim()) out.add(u.trim());
  };
  if (Array.isArray(row.images)) row.images.forEach(add);
  add(row.thumbnail_url);
  const content = typeof row.content === "string" ? row.content : "";
  for (const m of content.matchAll(/https?:\/\/[^\s)"'<>]+\/storage\/v1\/object\/public\/post-images\/[^\s)"'<>]+/g)) add(m[0]);
  if (Array.isArray(row.content_blocks)) {
    for (const b of row.content_blocks as { t?: unknown; url?: unknown }[]) if (b && b.t === "img") add(b.url);
  }
  return [...out];
}

export type DeletedPostImagePurgeResult =
  | {
      ok: true;
      posts: string[];
      skippedOpenReports: string[];
      originals: string[];
      removed: string[];
      failed: { path: string; error: string }[];
    }
  | { ok: false; error: string };

/**
 * 삭제한 지 30일 지난 글의 사진을 저장소에서 지운다 (Owner 2026-11-20 「30일 뒤 삭제」).
 * - 대상: status=deleted · deleted_at 이 30일 전보다 이전 · 아직 정리 안 함(deleted_images_purged_at null). 처리 안 된 신고가 있는 글은 다음 날로 미룬다
 *   (관리자 영구 삭제와 같은 조건 — 신고 처리 근거를 지우지 않는다).
 * - 사진: 글의 사진 열·대표·본문·서식 블록·첨부 표·수정 기록 전부. 대상 글들을 뺀 나머지 어디에서든 쓰이면 지우지 않는다.
 * - 저장소 삭제가 모두 성공한 글만 정리 완료 표시(실패하면 다음 날 다시).
 * - 글 행은 지우지 않는다(복구·감사 기록 보존). 복구되면 트리거가 표시를 지운다(사진은 이미 지워졌으면 돌아오지 않음).
 */
export async function purgeExpiredDeletedPostImages(
  sb: SupabaseClient,
  now: Date = new Date()
): Promise<DeletedPostImagePurgeResult> {
  const cutoff = new Date(now.getTime() - COMMUNITY_DELETED_POST_IMAGE_RETENTION_DAYS * 86_400_000).toISOString();
  const postsRes = await sb
    .from("community_posts")
    .select("id, images, thumbnail_url, content, content_blocks")
    .eq("status", "deleted")
    .lt("deleted_at", cutoff)
    .is("deleted_images_purged_at", null)
    .order("deleted_at", { ascending: true })
    .limit(COMMUNITY_DELETED_POST_IMAGE_PURGE_LIMIT);
  if (postsRes.error) return { ok: false, error: postsRes.error.message };
  const rows = (postsRes.data ?? []) as Record<string, unknown>[];
  if (!rows.length) return { ok: true, posts: [], skippedOpenReports: [], originals: [], removed: [], failed: [] };
  const ids = rows.map((r) => String(r.id));

  const [reportsRes, attachRes, revisionsRes] = await Promise.all([
    sb.from("community_reports").select("target_id").eq("target_type", "post").in("target_id", ids).in("status", ["open", "reviewing"]),
    sb.from("community_post_images").select("post_id, image_url").in("post_id", ids),
    sb.from("community_post_revisions").select("post_id, content, content_blocks").in("post_id", ids),
  ]);
  const firstErr = [reportsRes, attachRes, revisionsRes].find((r) => r.error);
  if (firstErr?.error) return { ok: false, error: firstErr.error.message };

  const openReports = new Set(((reportsRes.data ?? []) as { target_id: string }[]).map((r) => String(r.target_id)));
  const due = ids.filter((id) => !openReports.has(id));
  const skippedOpenReports = ids.filter((id) => openReports.has(id));
  if (!due.length) return { ok: true, posts: [], skippedOpenReports, originals: [], removed: [], failed: [] };

  const urlsByPost = new Map<string, Set<string>>(due.map((id) => [id, new Set<string>()]));
  const addAll = (postId: string, urls: string[]) => urlsByPost.get(postId) && urls.forEach((u) => urlsByPost.get(postId)!.add(u));
  for (const r of rows) addAll(String(r.id), collectCommunityPostRowImageUrls(r));
  for (const a of (attachRes.data ?? []) as { post_id: string; image_url?: string }[]) {
    if (a.image_url) addAll(String(a.post_id), [a.image_url]);
  }
  for (const v of (revisionsRes.data ?? []) as Record<string, unknown>[]) addAll(String(v.post_id), collectCommunityPostRowImageUrls(v));

  const originalsByPost = new Map<string, string[]>();
  for (const [postId, urls] of urlsByPost) {
    originalsByPost.set(postId, [...new Set([...urls].map(communityPostImagePathFromUrl).filter((x): x is string => Boolean(x)))]);
  }
  const allOriginals = [...new Set([...originalsByPost.values()].flat())];

  let removed: string[] = [];
  let failed: { path: string; error: string }[] = [];
  if (allOriginals.length) {
    const unref = await findUnreferencedCommunityImagesExcludingPosts(sb, allOriginals, due);
    if (!unref.ok) return { ok: false, error: unref.error };
    const res = await removeCommunityPostImageOriginals(sb, unref.names);
    removed = res.removed;
    failed = res.failed;
  }

  const failedOriginals = new Set(failed.map((f) => f.path));
  const done = due.filter((id) => !(originalsByPost.get(id) ?? []).some((o) => failedOriginals.has(o)));
  if (done.length) {
    const mark = await sb
      .from("community_posts")
      .update({ deleted_images_purged_at: now.toISOString() })
      .in("id", done)
      .eq("status", "deleted");
    if (mark.error) return { ok: false, error: mark.error.message };
  }
  return { ok: true, posts: done, skippedOpenReports, originals: allOriginals, removed, failed };
}
