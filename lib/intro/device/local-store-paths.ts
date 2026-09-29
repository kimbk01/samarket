/**
 * DIBAY INTRO — V2 local store path contract (cross-platform identity).
 *
 * Android base: filesDir/intro/authority/v1/
 * iOS base: Application Support/intro/authority/v1/
 * Relative layout identical; absolute roots may differ.
 */

export const INTRO_AUTHORITY_RELATIVE_ROOT = "intro/authority/v1" as const;

export const INTRO_STORE_LAYOUT = {
  candidateDir: "candidate",
  readyDir: "ready",
  candidateMeta: "candidate/meta.json",
  candidatePack: "candidate/pack.json",
  candidateAssetsDir: "candidate/assets",
  readyMeta: "ready/meta.json",
  readyPack: "ready/pack.json",
  readyAssetsDir: "ready/assets",
  fontsDir: "fonts",
} as const;

export type IntroCandidateMetaV1 = {
  status: "CANDIDATE" | "FAILED" | "VERIFYING";
  publishedRevisionId: string;
  packId: string;
  packIntegrity: string;
  downloadState: string;
  compatibilityState: string;
  verificationState: string;
  failureCode?: string;
  localStagingRoot: string;
  createdAt: string;
  updatedAt: string;
  sealedAssetIds: string[];
};

export type IntroReadyMetaV1 = {
  status: "READY";
  publishedRevisionId: string;
  packId: string;
  packIntegrity: string;
  sealedAssets: Array<{
    sealedAssetId: string;
    sealedIntegrity: string;
    relativePackPath: string;
    byteLength: number;
  }>;
  promotedAt: string;
  /** Active pointer reserved inert for V3/V4 — never used for cold start in V2. */
  activePointer: null;
};
