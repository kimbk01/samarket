/**
 * DIBAY INTRO — Phase 1
 * Pack / device compatibility structural contracts (pure; no pack building).
 */

import type { PackId, PublishedRevisionId, SealedAssetId } from "./identities";

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
