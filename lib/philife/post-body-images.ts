import { isDibayPostImageUrl } from "@/lib/community/imported-content-blocks";
import { extractImageUrlsFromInterleavedContent } from "@/lib/philife/interleaved-body-markdown";

/**
 * 커뮤니티 native 글의 `images` SSOT — 회원 POST/PATCH · 관리자 PATCH 공용.
 *
 * - 본문 `![](url)` 순서가 우선(대표 썸네일 = 본문 첫 이미지).
 * - 본문에 없는 후보(구 클라이언트 첨부 줄·갤러리 전용 글)는 뒤에 보존.
 * - 이전 본문에 있었는데 새 본문에서 지운 이미지는 후보에서도 제외(삭제 의도 반영).
 */
export const COMMUNITY_MEMBER_POST_MAX_IMAGES = 10;

function normalizeCandidate(u: unknown): string {
  return typeof u === "string" ? u.trim() : "";
}

function isSafeImageUrlString(u: string): boolean {
  return (
    u.length > 0 &&
    u.length < 2048 &&
    (u.startsWith("https://") || u.startsWith("http://")) &&
    !/\s|["'<>]/.test(u)
  );
}

export function mergePostBodyImages(input: {
  content: string;
  previousContent?: string | null;
  candidates: readonly unknown[];
}): string[] {
  const body = extractImageUrlsFromInterleavedContent(input.content);
  const bodySet = new Set(body);
  const removedFromBody = new Set(
    extractImageUrlsFromInterleavedContent(input.previousContent ?? "").filter((u) => !bodySet.has(u))
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of body) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  for (const raw of input.candidates) {
    const u = normalizeCandidate(raw);
    if (!u || seen.has(u) || removedFromBody.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export type MemberPostImagesResult =
  | { ok: true; images: string[] }
  | { ok: false; error: "image_not_allowed" | "too_many_images"; message: string };

/**
 * 회원 native 글 — 이미지 URL 검증 + 10장 제한(조용히 자르지 않음).
 * 허용: 본인 폴더의 DIBAY `post-images` 공개 URL. 수정 시 이미 저장돼 있던 URL 은 유지 허용.
 */
export function resolveMemberPostImages(input: {
  userId: string;
  content: string;
  candidates: unknown;
  previousContent?: string | null;
  previousImages?: readonly unknown[] | null;
  max?: number;
}): MemberPostImagesResult {
  const candidates = Array.isArray(input.candidates) ? input.candidates : [];
  const merged = mergePostBodyImages({
    content: input.content,
    previousContent: input.previousContent,
    candidates,
  });
  const grandfathered = new Set<string>([
    ...extractImageUrlsFromInterleavedContent(input.previousContent ?? ""),
    ...(input.previousImages ?? []).map(normalizeCandidate).filter(Boolean),
  ]);
  const ownPrefix = `/storage/v1/object/public/post-images/${input.userId.trim()}/`;
  for (const u of merged) {
    if (grandfathered.has(u)) continue;
    if (!isSafeImageUrlString(u) || !isDibayPostImageUrl(u) || !u.includes(ownPrefix)) {
      return {
        ok: false,
        error: "image_not_allowed",
        message: "업로드가 완료되지 않았거나 사용할 수 없는 이미지가 있습니다. 해당 사진을 삭제하거나 다시 올려 주세요.",
      };
    }
  }
  const max = input.max ?? COMMUNITY_MEMBER_POST_MAX_IMAGES;
  if (merged.length > max) {
    return {
      ok: false,
      error: "too_many_images",
      message: `사진은 ${max}장까지 올릴 수 있습니다.`,
    };
  }
  return { ok: true, images: merged };
}
