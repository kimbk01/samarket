/**
 * DIBAY INTRO — V1 Pack / device compatibility contracts.
 *
 * Freeze BEFORE Publish implementation.
 * Pack is the device-consumable authority for later V2/V3/V4.
 * No DB / Admin API / React / Next.js / WebView / cold-start network at runtime.
 */

import type { IntroDocumentV1 } from "./document";
import type { PackId, PublishedRevisionId, SealedAssetId } from "./identities";

/** Protocol generations — never attempt numbers. */
export const INTRO_PACK_SCHEMA_VERSION = 1 as const;
export const INTRO_PROTOCOL_VERSION = 1 as const;
export const INTRO_RENDER_SPEC_VERSION = 1 as const;
export const INTRO_FONT_SPEC_VERSION = 1 as const;
export const INTRO_TIMELINE_SPEC_VERSION = 1 as const;
export const INTRO_PACK_MANIFEST_VERSION = 1 as const;
export const INTRO_AUTHORITY_GENERATION = 1 as const;

export const INTRO_PACK_SUPPORTED_TRANSITIONS = [
  "CUT",
  "FADE",
  "SLIDE",
] as const;

export const INTRO_PACK_SUPPORTED_ACTIONS = [
  "CONTINUE",
  "FINISH_INTRO",
  "APPROVED_INTERNAL_ROUTE",
] as const;

export const INTRO_PACK_SUPPORTED_MEDIA_RUNTIME_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "CANONICAL_ANIMATED_GIF",
] as const;

export const INTRO_PACK_REQUIRED_FONTS = [
  "Pretendard-Regular.otf",
  "Pretendard-Medium.otf",
  "Pretendard-SemiBold.otf",
  "Pretendard-Bold.otf",
] as const;

/**
 * Structural pack manifest (Phase 1 validation surface).
 * Full runtime pack is IntroPackV1.
 */
export type PackManifestStructuralV1 = {
  readonly schemaVersion: number;
  readonly protocolVersion: number;
  readonly renderSpecVersion: number;
  readonly fontSpecVersion: number;
  readonly packId: PackId | string;
  readonly publishedRevisionId: PublishedRevisionId | string;
  readonly documentIntegrity: {
    readonly documentId: string;
    readonly documentDigest: string;
  };
  readonly sealedAssets: ReadonlyArray<{
    readonly sealedAssetId: SealedAssetId | string;
    readonly mediaRefId: string;
    readonly integrity: string;
  }>;
};

/**
 * One sealed asset entry inside the canonical Pack.
 * Device retrieval authority = sealedAssetId + integrity (+ relativePackPath).
 * runtimeArtifactId / mediaId are provenance only — never Library "latest".
 */
export type IntroPackAssetEntryV1 = {
  readonly sealedAssetId: string;
  readonly mediaRefId: string;
  /** Provenance only. */
  readonly mediaId: string;
  /** Provenance only — captured READY generation. */
  readonly runtimeArtifactId: string;
  readonly runtimeIntegrity: string;
  readonly sealedIntegrity: string;
  readonly kind: "IMAGE" | "LOGO" | "GIF";
  readonly format: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  /** Pack-relative path under assets/ — local device activation. */
  readonly relativePackPath: string;
  readonly animationMetadata: Record<string, unknown> | null;
};

/**
 * Canonical device Pack V1 — self-contained for native cold Intro later.
 * Integrity authority:
 * - documentIntegrity.documentDigest = sha256 of canonical authored snapshot
 * - assetSetIntegrity = sha256 of ordered sealedAssetId+sealedIntegrity pairs
 * - packIntegrity = sha256 of canonical pack payload EXCLUDING packIntegrity itself
 * Archive/container timestamps are NOT authority (we store deterministic JSON + asset bytes).
 */
export type IntroPackV1 = {
  readonly manifestVersion: typeof INTRO_PACK_MANIFEST_VERSION;
  readonly schemaVersion: typeof INTRO_PACK_SCHEMA_VERSION;
  readonly protocolVersion: typeof INTRO_PROTOCOL_VERSION;
  readonly renderSpecVersion: typeof INTRO_RENDER_SPEC_VERSION;
  readonly fontSpecVersion: typeof INTRO_FONT_SPEC_VERSION;
  readonly timelineSpecVersion: typeof INTRO_TIMELINE_SPEC_VERSION;
  readonly authorityGeneration: typeof INTRO_AUTHORITY_GENERATION;
  readonly packId: string;
  readonly publishedRevisionId: string;
  readonly documentId: string;
  readonly sourceDraftVersion: number;
  readonly documentIntegrity: {
    readonly documentId: string;
    readonly documentDigest: string;
  };
  readonly assetSetIntegrity: string;
  /** Filled after hashing; consumers verify this field. */
  readonly packIntegrity: string;
  /**
   * Exact captured IntroDocumentV1 semantics (ordered scenes, layers, CTA, tablet overrides).
   * mediaRefId remains; device resolves via assets[].mediaRefId → sealedAssetId.
   */
  readonly document: IntroDocumentV1;
  readonly assets: ReadonlyArray<IntroPackAssetEntryV1>;
  readonly compatibility: {
    readonly supportedTransitions: readonly string[];
    readonly supportedActions: readonly string[];
    readonly supportedMediaRuntimeFormats: readonly string[];
    readonly requiredFonts: readonly string[];
  };
};

export type DeviceCompatibilityInput = {
  readonly candidate: {
    readonly schemaVersion: number | string;
    readonly protocolVersion: number | string;
    readonly renderSpecVersion: number | string;
    readonly fontSpecVersion: number | string;
    readonly mediaRuntimeFormat: string;
    readonly transitions: readonly string[];
    readonly actions: readonly string[];
  };
  readonly device: {
    readonly supportedSchemaVersions: readonly (number | string)[];
    readonly supportedProtocolVersions: readonly (number | string)[];
    readonly supportedRenderSpecVersions: readonly (number | string)[];
    readonly supportedFontSpecVersions: readonly (number | string)[];
    readonly supportedMediaRuntimeFormats: readonly string[];
    readonly supportedTransitions: readonly string[];
    readonly supportedActions: readonly string[];
  };
};

export type DeviceCompatibilityDecision =
  | { readonly ok: true; readonly activate: "CANDIDATE_ALLOWED" }
  | {
      readonly ok: false;
      readonly activate: "REJECT";
      readonly reason:
        | "UNKNOWN_SCHEMA"
        | "UNKNOWN_PROTOCOL"
        | "UNKNOWN_RENDER"
        | "UNKNOWN_FONT"
        | "UNKNOWN_MEDIA_RUNTIME_FORMAT"
        | "UNKNOWN_TRANSITION"
        | "UNKNOWN_ACTION";
      readonly detail: string;
    };

/** Captured READY media pin at Publish prepare — never re-resolve "latest READY". */
export type CapturedRuntimeMediaPinV1 = {
  readonly mediaRefId: string;
  readonly mediaId: string;
  readonly runtimeArtifactId: string;
  readonly runtimeIntegrity: string;
  readonly format: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly storageBucket: string;
  readonly storagePath: string;
  readonly animationMetadata: Record<string, unknown> | null;
  readonly kind: "IMAGE" | "LOGO" | "GIF";
};
