/**
 * 묶음 4 · O-03 — 매장 PATCH 에서 `profile_image_url`·`gallery_images_json` 이 바뀌면, 빠진 이전 파일 중
 * 다른 행(매장·상품·배너·공지·상품권 — 고아 GC 와 같은 참조 소스)에서 더 이상 참조되지 않는 것만 Storage 에서 지운다.
 * 상품 PATCH 와 같은 안전장치: 이 매장 업로드 폴더 원본만(`filterStoreOwnedImageUrls`) · 같은 삭제 함수
 * (`removeCanonicalImagesFromPublicUrls`, 원본+파생본). 참조 조회 실패 = 삭제 안 함(fail-closed).
 * 교체 시점 동작이며 기존 고아 일괄 삭제가 아니다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  diffRemovedImageUrls,
  removeCanonicalImagesFromPublicUrls,
} from "@/lib/media/canonical-image-lifecycle.server";
import { filterStoreOwnedImageUrls } from "@/lib/stores/store-owned-image-urls";
import { filterUnreferencedStoreImageUrls } from "@/lib/stores/store-product-images-orphan-gc";
import { loadStoreImageReferencedPaths } from "@/lib/stores/store-product-images-orphan-gc.server";

/** 매장 프로필·갤러리 값에서 이미지 URL 문자열 (갤러리 항목은 문자열 또는 `{ url }`·`{ src }`). */
export function collectStoreProfileImageUrls(profileImageUrl: unknown, galleryImagesJson: unknown): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  };
  push(profileImageUrl);
  if (Array.isArray(galleryImagesJson)) {
    for (const item of galleryImagesJson) {
      if (typeof item === "string") push(item);
      else if (item && typeof item === "object") {
        const o = item as { url?: unknown; src?: unknown };
        push(o.url);
        push(o.src);
      }
    }
  }
  return out;
}

export type StoreProfileImageCleanupResult =
  | { status: "none" }
  | { status: "reference_check_failed"; candidates: number }
  | { status: "done"; candidates: number; kept_referenced: number; removed: number; failed: number };

export async function cleanupReplacedStoreProfileImages(input: {
  sb: SupabaseClient;
  storeId: string;
  before: { profile_image_url: unknown; gallery_images_json: unknown };
  after: { profile_image_url: unknown; gallery_images_json: unknown };
}): Promise<StoreProfileImageCleanupResult> {
  const { sb, storeId } = input;
  const removed = filterStoreOwnedImageUrls(
    storeId,
    diffRemovedImageUrls(
      collectStoreProfileImageUrls(input.before.profile_image_url, input.before.gallery_images_json),
      collectStoreProfileImageUrls(input.after.profile_image_url, input.after.gallery_images_json)
    )
  );
  if (removed.length === 0) return { status: "none" };

  // 저장 후의 참조 상태(이 매장 행의 새 값 포함)로 판정 — 다른 행이 같은 파일을 쓰면 보존.
  const refs = await loadStoreImageReferencedPaths(sb, storeId);
  if (!refs.ok) {
    console.error("[PATCH store] image cleanup skipped — reference check failed", storeId);
    return { status: "reference_check_failed", candidates: removed.length };
  }
  const unreferenced = filterUnreferencedStoreImageUrls(storeId, removed, refs.paths);
  if (unreferenced.length === 0) {
    return { status: "done", candidates: removed.length, kept_referenced: removed.length, removed: 0, failed: 0 };
  }
  const removal = await removeCanonicalImagesFromPublicUrls({
    sb,
    urls: unreferenced,
    context: "owner/store/replace-image",
  });
  if (removal.failed.length > 0) {
    console.error("[PATCH store] storage cleanup partial failure", removal.failed);
  }
  return {
    status: "done",
    candidates: removed.length,
    kept_referenced: removed.length - unreferenced.length,
    removed: removal.removed.length,
    failed: removal.failed.length,
  };
}
