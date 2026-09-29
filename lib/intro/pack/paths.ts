/**
 * DIBAY INTRO — V1 sealed / pack storage path builders.
 * Canonical namespace only: dibay-intro / authority/v1/{sealed|packs}/...
 */

import { AppIntroStorageSubspace } from "@/lib/intro/db/authority";

export function buildSealedStoragePath(args: {
  publishedRevisionId: string;
  sealedAssetId: string;
  ext: string;
}): string {
  const ext = args.ext.replace(/^\./, "").toLowerCase();
  return `${AppIntroStorageSubspace.SEALED}${args.publishedRevisionId}/${args.sealedAssetId}/runtime.${ext}`;
}

export function buildPackRootPrefix(packId: string): string {
  return `${AppIntroStorageSubspace.PACKS}${packId}/`;
}

export function buildPackManifestStoragePath(packId: string): string {
  return `${buildPackRootPrefix(packId)}pack.json`;
}

export function buildPackAssetStoragePath(args: {
  packId: string;
  sealedAssetId: string;
  ext: string;
}): string {
  const ext = args.ext.replace(/^\./, "").toLowerCase();
  return `${buildPackRootPrefix(args.packId)}assets/${args.sealedAssetId}.${ext}`;
}

export function packRelativeAssetPath(args: {
  sealedAssetId: string;
  ext: string;
}): string {
  const ext = args.ext.replace(/^\./, "").toLowerCase();
  return `assets/${args.sealedAssetId}.${ext}`;
}

export function assertSealedPath(path: string): void {
  if (!path.startsWith(AppIntroStorageSubspace.SEALED)) {
    throw new Error("SEALED_PATH_INVALID");
  }
  if (path.includes("..")) {
    throw new Error("SEALED_PATH_TRAVERSAL");
  }
}

export function assertPackPath(path: string): void {
  if (!path.startsWith(AppIntroStorageSubspace.PACKS)) {
    throw new Error("PACK_PATH_INVALID");
  }
  if (path.includes("..")) {
    throw new Error("PACK_PATH_TRAVERSAL");
  }
}
