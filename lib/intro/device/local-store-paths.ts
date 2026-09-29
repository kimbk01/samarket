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
  activeDir: "active",
  candidateMeta: "candidate/meta.json",
  candidatePack: "candidate/pack.json",
  candidateAssetsDir: "candidate/assets",
  readyMeta: "ready/meta.json",
  readyPack: "ready/pack.json",
  readyAssetsDir: "ready/assets",
  activeMeta: "active/meta.json",
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
  /**
   * V2 left this null. V3 Active is a separate authority pointer under active/,
   * not an in-Ready field mutation.
   */
  activePointer: null;
};

/** V3 Active — pointer/authority promotion only. Does not mutate Pack bytes. */
export type IntroActiveMetaV1 = {
  status: "ACTIVE";
  publishedRevisionId: string;
  packId: string;
  packIntegrity: string;
  /** Relative to authority root — points at Ready pack bytes (no rewrite). */
  localPackPath: string;
  localAssetsRoot: string;
  verifiedAssetAuthority: Array<{
    sealedAssetId: string;
    sealedIntegrity: string;
    relativePackPath: string;
  }>;
  compatibilityVersion: string;
  activatedAt: string;
};
