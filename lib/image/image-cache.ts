/**
 * DIBAY Image V2 — in-session thumbnail load memory (Phase 1 adapter).
 * Delegates to `lib/media/thumbnail-loaded-url-memory`.
 */
import {
  isThumbnailUrlLoaded,
  markThumbnailUrlLoaded,
  probeBrowserCachedImageComplete,
} from "@/lib/media/thumbnail-loaded-url-memory";

/** @see markThumbnailUrlLoaded */
export function imageMarkThumbnailLoaded(url: string | null | undefined): void {
  markThumbnailUrlLoaded(url);
}

/** @see isThumbnailUrlLoaded */
export function imageIsThumbnailLoaded(url: string | null | undefined): boolean {
  return isThumbnailUrlLoaded(url);
}

/** @see probeBrowserCachedImageComplete */
export function imageProbeBrowserCachedComplete(url: string | null | undefined): boolean {
  return probeBrowserCachedImageComplete(url);
}
