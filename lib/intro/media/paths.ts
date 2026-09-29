import {
  APP_INTRO_STORAGE_BUCKET,
  AppIntroStorageSubspace,
} from "@/lib/intro/db/authority";

export const INTRO_MEDIA_BUCKET = APP_INTRO_STORAGE_BUCKET;

export const PROCESS_RECIPE = {
  GIF_B2_SHARP_OMGGIF_V1: "GIF_B2_SHARP_OMGGIF_V1",
  STATIC_ORIENT_ALPHA_V1: "STATIC_ORIENT_ALPHA_V1",
} as const;

export type ProcessRecipeVersion =
  (typeof PROCESS_RECIPE)[keyof typeof PROCESS_RECIPE];

/**
 * Canonical immutable source object path.
 * No original filename, no attempt number, no document UUID.
 */
export function buildSourceStoragePath(args: {
  mediaId: string;
  sourceGenerationId: string;
}): string {
  return `${AppIntroStorageSubspace.SOURCE}${args.mediaId}/${args.sourceGenerationId}/original`;
}

/**
 * Canonical immutable runtime artifact path.
 */
export function buildRuntimeStoragePath(args: {
  mediaId: string;
  runtimeArtifactId: string;
  ext: string;
}): string {
  const ext = args.ext.replace(/^\./, "").toLowerCase();
  return `${AppIntroStorageSubspace.RUNTIME}${args.mediaId}/${args.runtimeArtifactId}/runtime.${ext}`;
}

export function assertSourcePath(path: string): void {
  if (!path.startsWith(AppIntroStorageSubspace.SOURCE)) {
    throw new Error("SOURCE_PATH_INVALID");
  }
  if (
    path.includes("..") ||
    path.includes(AppIntroStorageSubspace.RUNTIME) ||
    path.includes(AppIntroStorageSubspace.SEALED) ||
    path.includes(AppIntroStorageSubspace.PACKS)
  ) {
    throw new Error("SOURCE_PATH_TRAVERSAL");
  }
}

export function isForbiddenClientUploadPrefix(path: string): boolean {
  return (
    path.startsWith(AppIntroStorageSubspace.RUNTIME) ||
    path.startsWith(AppIntroStorageSubspace.SEALED) ||
    path.startsWith(AppIntroStorageSubspace.PACKS) ||
    path.startsWith(AppIntroStorageSubspace.TMP)
  );
}
