/**
 * DIBAY INTRO — Phase 1
 * Nominal identity types. Prevent accidental cross-domain substitution.
 *
 * Authored document: mediaRefId only.
 * Device manifest: sealedAssetId authority.
 */

declare const MediaIdBrand: unique symbol;
declare const MediaRefIdBrand: unique symbol;
declare const RuntimeArtifactIdBrand: unique symbol;
declare const SealedAssetIdBrand: unique symbol;
declare const PackIdBrand: unique symbol;
declare const PublishedRevisionIdBrand: unique symbol;

export type MediaId = string & { readonly [MediaIdBrand]: "MediaId" };
export type MediaRefId = string & { readonly [MediaRefIdBrand]: "MediaRefId" };
export type RuntimeArtifactId = string & {
  readonly [RuntimeArtifactIdBrand]: "RuntimeArtifactId";
};
export type SealedAssetId = string & {
  readonly [SealedAssetIdBrand]: "SealedAssetId";
};
export type PackId = string & { readonly [PackIdBrand]: "PackId" };
export type PublishedRevisionId = string & {
  readonly [PublishedRevisionIdBrand]: "PublishedRevisionId";
};

export function asMediaId(value: string): MediaId {
  return value as MediaId;
}
export function asMediaRefId(value: string): MediaRefId {
  return value as MediaRefId;
}
export function asRuntimeArtifactId(value: string): RuntimeArtifactId {
  return value as RuntimeArtifactId;
}
export function asSealedAssetId(value: string): SealedAssetId {
  return value as SealedAssetId;
}
export function asPackId(value: string): PackId {
  return value as PackId;
}
export function asPublishedRevisionId(value: string): PublishedRevisionId {
  return value as PublishedRevisionId;
}
