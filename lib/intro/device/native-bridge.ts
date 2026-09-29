/**
 * DIBAY INTRO — Capacitor native Intro authority bridge (V2 + V3 Active).
 */

import { registerPlugin } from "@capacitor/core";

export type NativeReadyIdentity = {
  status: "READY" | "NONE";
  publishedRevisionId?: string;
  packId?: string;
  packIntegrity?: string;
  sealedAssetIds?: string[];
  sealedIntegrities?: string[];
  activePointer?: null;
};

export type NativeCandidateIdentity = {
  status: "CANDIDATE" | "FAILED" | "NONE";
  publishedRevisionId?: string;
  packId?: string;
  packIntegrity?: string;
  failureCode?: string;
};

export type NativeActiveIdentity = {
  status: "ACTIVE" | "NONE";
  publishedRevisionId?: string;
  packId?: string;
  packIntegrity?: string;
  localPackPath?: string;
  localAssetsRoot?: string;
  compatibilityVersion?: string;
  activatedAt?: string;
};

export type DibayIntroAuthorityPlugin = {
  getAuthorityStatus(): Promise<{
    baseDir: string;
    ready: NativeReadyIdentity;
    candidate: NativeCandidateIdentity;
    active: NativeActiveIdentity;
    noLiveMarker: string | null;
    fontAuthorityOk: boolean;
    fontMissing: string[];
  }>;
  beginCandidate(options: { metaJson: string }): Promise<{ ok: boolean }>;
  writeCandidatePack(options: {
    base64: string;
  }): Promise<{ ok: boolean }>;
  writeCandidateAsset(options: {
    relativePackPath: string;
    base64: string;
  }): Promise<{ ok: boolean }>;
  markCandidateFailed(options: {
    metaJson: string;
    failureCode: string;
  }): Promise<{ ok: boolean }>;
  promoteCandidateToReady(options: {
    metaJson: string;
  }): Promise<{ ok: boolean }>;
  promoteReadyToActive(options: {
    metaJson: string;
  }): Promise<{ ok: boolean }>;
  assertFontAuthority(): Promise<{
    ok: boolean;
    missing: string[];
  }>;
  recordNoLiveMarker(options: {
    physicalLiveKind: string;
  }): Promise<{ ok: boolean }>;
  clearNoLiveMarker(): Promise<{ ok: boolean }>;
};

export const DibayIntroAuthority =
  registerPlugin<DibayIntroAuthorityPlugin>("DibayIntroAuthority");
