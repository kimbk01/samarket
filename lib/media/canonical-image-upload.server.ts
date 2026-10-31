import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AVATAR_UPLOAD_SURFACES,
  POST_IMAGE_UPLOAD_SURFACES,
  STORE_PRODUCT_UPLOAD_SURFACES,
  type CanonicalImageBucket,
  type CanonicalImageSurface,
} from "@/lib/media/canonical-image-contract";
import {
  derivativeStoragePath,
  storeProductOriginalHasListDerivative,
} from "@/lib/media/canonical-image-path";
import {
  buildCanonicalDerivativeBuffers,
  optimizePostImageOriginalBuffer,
} from "@/lib/media/canonical-image-pipeline.server";

export type CanonicalUploadResult = {
  originalPath: string;
  publicUrl: string;
  derivativePaths: Partial<Record<CanonicalImageSurface, string>>;
};

async function uploadBuffer(
  sb: SupabaseClient,
  bucket: CanonicalImageBucket,
  path: string,
  buf: Buffer,
  contentType: string,
  cacheControl?: string
): Promise<void> {
  const { error } = await sb.storage.from(bucket).upload(path, buf, {
    contentType,
    upsert: false,
    ...(cacheControl ? { cacheControl } : {}),
  });
  if (error) throw error;
}

async function removePaths(
  sb: SupabaseClient,
  bucket: CanonicalImageBucket,
  paths: string[]
): Promise<void> {
  if (!paths.length) return;
  await sb.storage.from(bucket).remove(paths);
}

/**
 * Upload original + canonical derivatives with rollback on partial failure.
 */
export async function uploadCanonicalImageAsset(input: {
  sb: SupabaseClient;
  bucket: CanonicalImageBucket;
  originalPath: string;
  originalBuf: Buffer;
  originalContentType: string;
  surfaces: CanonicalImageSurface[];
  /**
   * 반드시 있어야 하는 파생본 — 생성 실패 시 업로드 전체를 되돌린다(원본만 남기지 않음).
   * IMG-01: 파일명 표식으로 `feed` 존재를 약속한 store 원본은 `feed` 필수.
   */
  requiredSurfaces?: CanonicalImageSurface[];
  /** 저장소 Cache-Control max-age(초). 없으면 기존 기본값(3600) — 호출부별로만 지정 */
  cacheControl?: string;
}): Promise<CanonicalUploadResult> {
  const uploaded: string[] = [];
  const derivativePaths: Partial<Record<CanonicalImageSurface, string>> = {};

  try {
    await uploadBuffer(
      input.sb,
      input.bucket,
      input.originalPath,
      input.originalBuf,
      input.originalContentType,
      input.cacheControl
    );
    uploaded.push(input.originalPath);

    const derivatives = await buildCanonicalDerivativeBuffers({
      buf: input.originalBuf,
      mimeType: input.originalContentType,
      surfaces: input.surfaces,
      bucket: input.bucket,
    });
    const missingRequired = (input.requiredSurfaces ?? []).filter(
      (surface) => !derivatives.some((d) => d.surface === surface)
    );
    if (missingRequired.length) {
      throw new Error(`derivative_missing:${missingRequired.join(",")}`);
    }

    for (const d of derivatives) {
      const dPath = derivativeStoragePath(input.originalPath, d.surface);
      await uploadBuffer(input.sb, input.bucket, dPath, d.buf, d.contentType, input.cacheControl);
      uploaded.push(dPath);
      derivativePaths[d.surface] = dPath;
    }

    const {
      data: { publicUrl },
    } = input.sb.storage.from(input.bucket).getPublicUrl(input.originalPath);

    return {
      originalPath: input.originalPath,
      publicUrl,
      derivativePaths,
    };
  } catch (e) {
    await removePaths(input.sb, input.bucket, uploaded);
    throw e;
  }
}

/**
 * 커뮤니티 글 사진 캐시 (D14) — 경로가 매번 새 uuid·`upsert:false` 라 같은 주소의 내용이 바뀌지 않는다.
 * 기존 파일(3600)은 그대로 두며 주소도 같아 호환된다.
 */
export const COMMUNITY_POST_IMAGE_CACHE_CONTROL = "31536000";

/** post-images: optimize original + thumb/feed/detail derivatives. */
export async function uploadPostImageWithDerivatives(input: {
  sb: SupabaseClient;
  originalPath: string;
  rawBuf: Buffer;
  mimeType: string;
  surfaces?: CanonicalImageSurface[];
  cacheControl?: string;
}): Promise<CanonicalUploadResult> {
  const optimized = await optimizePostImageOriginalBuffer({
    buf: input.rawBuf,
    mimeType: input.mimeType,
  });
  const path =
    optimized.ext === "webp"
      ? input.originalPath.replace(/\.[^./]+$/, ".webp")
      : input.originalPath;

  return uploadCanonicalImageAsset({
    sb: input.sb,
    bucket: "post-images",
    originalPath: path,
    originalBuf: optimized.buf,
    originalContentType: optimized.contentType,
    surfaces: input.surfaces ?? POST_IMAGE_UPLOAD_SURFACES,
    cacheControl: input.cacheControl,
  });
}

/** store-product-images: primary already processed — add hero + list(feed) derivatives (IMG-01). */
export async function uploadStoreProductWithHeroDerivative(input: {
  sb: SupabaseClient;
  originalPath: string;
  primaryBuf: Buffer;
  primaryContentType: string;
}): Promise<CanonicalUploadResult> {
  return uploadCanonicalImageAsset({
    sb: input.sb,
    bucket: "store-product-images",
    originalPath: input.originalPath,
    originalBuf: input.primaryBuf,
    originalContentType: input.primaryContentType,
    surfaces: STORE_PRODUCT_UPLOAD_SURFACES,
    requiredSurfaces: storeProductOriginalHasListDerivative(input.originalPath) ? ["feed"] : [],
  });
}

/** Avatar: thumb derivative only (small display). */
export async function uploadAvatarWithDerivatives(input: {
  sb: SupabaseClient;
  originalPath: string;
  rawBuf: Buffer;
  mimeType: string;
}): Promise<CanonicalUploadResult> {
  const optimized = await optimizePostImageOriginalBuffer({
    buf: input.rawBuf,
    mimeType: input.mimeType,
    maxEdge: 1024,
  });
  const path = input.originalPath.replace(/\.[^./]+$/, ".webp");

  return uploadCanonicalImageAsset({
    sb: input.sb,
    bucket: "post-images",
    originalPath: path,
    originalBuf: optimized.buf,
    originalContentType: optimized.contentType,
    surfaces: AVATAR_UPLOAD_SURFACES,
  });
}

/** All storage paths for an original asset (original + canonical derivatives). */
export function canonicalStoragePathsForOriginal(
  originalPath: string,
  bucket: CanonicalImageBucket
): string[] {
  const surfaces =
    bucket === "store-product-images"
      ? STORE_PRODUCT_UPLOAD_SURFACES
      : POST_IMAGE_UPLOAD_SURFACES;
  return [
    originalPath,
    ...surfaces.map((surface) => derivativeStoragePath(originalPath, surface)),
  ];
}

/** Remove original + derivatives (idempotent — missing paths are ignored). */
export async function removeCanonicalImageAsset(input: {
  sb: SupabaseClient;
  bucket: CanonicalImageBucket;
  originalPath: string;
}): Promise<void> {
  const paths = canonicalStoragePathsForOriginal(input.originalPath, input.bucket);
  await removePaths(input.sb, input.bucket, paths);
}
