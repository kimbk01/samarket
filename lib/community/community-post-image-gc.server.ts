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

/** 주어진 원본 경로 중 어디에서도 참조되지 않는 것 */
export function findUnreferencedCommunityImages(sb: SupabaseClient, originals: readonly string[]) {
  return rpcNames(sb, "community_post_image_unreferenced", { p_names: [...originals] });
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
