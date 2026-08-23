/**
 * Canonical image asset lifecycle — delete / replace / URL collection (server-only).
 *
 * SOFT DELETE entities retain storage objects until hard delete.
 * HARD DELETE removes original + all canonical derivatives.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  POST_IMAGES_BUCKET,
  STORE_PRODUCT_IMAGES_BUCKET,
  type CanonicalImageBucket,
} from "@/lib/media/canonical-image-contract";
import {
  isEligibleCanonicalOriginalStoragePath,
  parseSupabasePublicObjectUrl,
} from "@/lib/media/canonical-image-path";
import {
  canonicalStoragePathsForOriginal,
  removeCanonicalImageAsset,
} from "@/lib/media/canonical-image-upload.server";

const ALLOWED_BUCKETS = new Set<CanonicalImageBucket>([
  POST_IMAGES_BUCKET,
  STORE_PRODUCT_IMAGES_BUCKET,
]);

export type CanonicalImageRemovalResult = {
  attempted: string[];
  removed: string[];
  failed: { path: string; message: string }[];
};

export function isAllowedCanonicalImageBucket(
  bucket: string
): bucket is CanonicalImageBucket {
  return ALLOWED_BUCKETS.has(bucket as CanonicalImageBucket);
}

export function collectCanonicalImagePublicUrls(urls: Iterable<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    const u = typeof raw === "string" ? raw.trim() : "";
    if (!u) continue;
    const parsed = parseSupabasePublicObjectUrl(u);
    if (!parsed || !isAllowedCanonicalImageBucket(parsed.bucket)) continue;
    if (!isEligibleCanonicalOriginalStoragePath(parsed.path)) continue;
    out.add(u);
  }
  return [...out];
}

export function diffRemovedImageUrls(
  before: Iterable<string | null | undefined>,
  after: Iterable<string | null | undefined>
): string[] {
  const next = new Set(collectCanonicalImagePublicUrls(after));
  return collectCanonicalImagePublicUrls(before).filter((u) => !next.has(u));
}

export function collectPostRowImageUrls(row: {
  images?: unknown;
  thumbnail_url?: unknown;
}): string[] {
  const urls: string[] = [];
  const thumb =
    typeof row.thumbnail_url === "string" ? row.thumbnail_url.trim() : "";
  if (thumb) urls.push(thumb);
  if (Array.isArray(row.images)) {
    for (const x of row.images) {
      if (typeof x === "string" && x.trim()) urls.push(x.trim());
    }
  }
  return collectCanonicalImagePublicUrls(urls);
}

/** Best-effort storage removal with structured logging (non-throwing). */
export async function removeCanonicalImageAssetLogged(input: {
  sb: SupabaseClient;
  bucket: CanonicalImageBucket;
  originalPath: string;
  context: string;
}): Promise<CanonicalImageRemovalResult> {
  const paths = canonicalStoragePathsForOriginal(input.originalPath, input.bucket);
  const result: CanonicalImageRemovalResult = {
    attempted: paths,
    removed: [],
    failed: [],
  };
  try {
    await removeCanonicalImageAsset({
      sb: input.sb,
      bucket: input.bucket,
      originalPath: input.originalPath,
    });
    result.removed = paths;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[canonical-image-lifecycle] remove failed", {
      context: input.context,
      bucket: input.bucket,
      originalPath: input.originalPath,
      error: msg,
    });
    result.failed.push({ path: input.originalPath, message: msg });
  }
  return result;
}

export async function removeCanonicalImagesFromPublicUrls(input: {
  sb: SupabaseClient;
  urls: Iterable<string | null | undefined>;
  context: string;
}): Promise<CanonicalImageRemovalResult> {
  const merged: CanonicalImageRemovalResult = {
    attempted: [],
    removed: [],
    failed: [],
  };
  for (const url of collectCanonicalImagePublicUrls(input.urls)) {
    const parsed = parseSupabasePublicObjectUrl(url);
    if (!parsed) continue;
    const one = await removeCanonicalImageAssetLogged({
      sb: input.sb,
      bucket: parsed.bucket,
      originalPath: parsed.path,
      context: input.context,
    });
    merged.attempted.push(...one.attempted);
    merged.removed.push(...one.removed);
    merged.failed.push(...one.failed);
  }
  return merged;
}
