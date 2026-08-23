/**
 * Pure backfill planning helpers (testable, no I/O).
 */
import {
  POST_IMAGE_UPLOAD_SURFACES,
  STORE_PRODUCT_UPLOAD_SURFACES,
  type CanonicalImageSurface,
} from "@/lib/media/canonical-image-contract";
import {
  derivativeStoragePath,
  isCanonicalDerivativePath,
  isEligibleCanonicalOriginalStoragePath,
} from "@/lib/media/canonical-image-path";

export const BACKFILL_ALLOWED_BUCKETS = ["post-images", "store-product-images"] as const;

export type BackfillBucket = (typeof BACKFILL_ALLOWED_BUCKETS)[number];

export function assertBackfillBucket(bucket: string): BackfillBucket {
  if (!BACKFILL_ALLOWED_BUCKETS.includes(bucket as BackfillBucket)) {
    throw new Error(`bucket_not_allowed:${bucket}`);
  }
  return bucket as BackfillBucket;
}

export function surfacesForBackfillBucket(bucket: BackfillBucket): CanonicalImageSurface[] {
  return bucket === "store-product-images"
    ? [...STORE_PRODUCT_UPLOAD_SURFACES]
    : [...POST_IMAGE_UPLOAD_SURFACES];
}

export type BackfillCandidate = {
  originalPath: string;
  missingSurfaces: CanonicalImageSurface[];
  derivativePaths: Partial<Record<CanonicalImageSurface, string>>;
};

export type BackfillScanSummary = {
  eligibleOriginals: number;
  alreadyComplete: number;
  excludedDerivativeObjects: number;
  invalidObjects: number;
  missingThumb: number;
  missingFeed: number;
  missingDetail: number;
  missingHero: number;
  samples: BackfillCandidate[];
};

export function classifyStorageObjectPath(path: string): "derivative" | "invalid" | "original" {
  if (isCanonicalDerivativePath(path)) return "derivative";
  if (!isEligibleCanonicalOriginalStoragePath(path)) return "invalid";
  return "original";
}

export function planBackfillCandidate(input: {
  originalPath: string;
  bucket: BackfillBucket;
  existingDerivativePaths: Set<string>;
}): BackfillCandidate | null {
  const kind = classifyStorageObjectPath(input.originalPath);
  if (kind !== "original") return null;

  const surfaces = surfacesForBackfillBucket(input.bucket);
  const missingSurfaces: CanonicalImageSurface[] = [];
  const derivativePaths: Partial<Record<CanonicalImageSurface, string>> = {};

  for (const surface of surfaces) {
    const dPath = derivativeStoragePath(input.originalPath, surface);
    derivativePaths[surface] = dPath;
    if (!input.existingDerivativePaths.has(dPath)) {
      missingSurfaces.push(surface);
    }
  }

  if (missingSurfaces.length === 0) return null;

  return {
    originalPath: input.originalPath,
    missingSurfaces,
    derivativePaths,
  };
}

export function summarizeBackfillCandidates(candidates: BackfillCandidate[]): BackfillScanSummary {
  const summary: BackfillScanSummary = {
    eligibleOriginals: candidates.length,
    alreadyComplete: 0,
    excludedDerivativeObjects: 0,
    invalidObjects: 0,
    missingThumb: 0,
    missingFeed: 0,
    missingDetail: 0,
    missingHero: 0,
    samples: candidates.slice(0, 10),
  };

  for (const c of candidates) {
    if (c.missingSurfaces.includes("thumb")) summary.missingThumb += 1;
    if (c.missingSurfaces.includes("feed")) summary.missingFeed += 1;
    if (c.missingSurfaces.includes("detail")) summary.missingDetail += 1;
    if (c.missingSurfaces.includes("hero")) summary.missingHero += 1;
  }

  return summary;
}
