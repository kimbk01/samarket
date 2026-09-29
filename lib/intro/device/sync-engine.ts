/**
 * DIBAY INTRO — V2 sync transaction (Candidate → READY).
 * Pure orchestration — storage via IntroAuthorityStore adapter.
 * Does NOT activate cold-start Active. Does NOT render Intro.
 */

import type { IntroPackV1 } from "@/lib/intro/contracts/pack";
import { packPayloadForIntegrity } from "@/lib/intro/pack/canonical";
import { ServerLiveStatus } from "@/lib/intro/contracts/status";
import { evaluatePackCompatibility } from "./compatibility";
import { INTRO_FONT_AUTHORITY } from "./fonts";
import type {
  IntroCandidateMetaV1,
  IntroReadyMetaV1,
} from "./local-store-paths";

export type DeviceLiveFetchResult =
  | {
      ok: true;
      kind: typeof ServerLiveStatus.LIVE;
      publishedRevisionId: string;
      packId: string;
      packIntegrity: string;
      packRetrievalUrl: string;
      sealedAssets: Array<{
        sealedAssetId: string;
        sealedIntegrity: string;
        byteLength: number;
        relativePackPath: string;
        retrievalUrl: string;
      }>;
    }
  | {
      ok: true;
      kind: typeof ServerLiveStatus.NO_LIVE_INTRO;
      physicalLiveKind: string;
    }
  | {
      ok: false;
      kind: typeof ServerLiveStatus.FETCH_FAILURE;
      message: string;
    };

export type IntroAuthorityStore = {
  readReadyMeta(): Promise<IntroReadyMetaV1 | null>;
  readCandidateMeta(): Promise<IntroCandidateMetaV1 | null>;
  beginCandidate(meta: IntroCandidateMetaV1): Promise<void>;
  writeCandidatePackJson(bytes: Uint8Array): Promise<void>;
  writeCandidateAsset(args: {
    relativePackPath: string;
    bytes: Uint8Array;
  }): Promise<void>;
  markCandidateFailed(args: {
    failureCode: string;
    meta: IntroCandidateMetaV1;
  }): Promise<void>;
  promoteCandidateToReady(meta: IntroReadyMetaV1): Promise<void>;
  /** Verify bundled Gate E fonts — must not substitute system fonts. */
  assertFontAuthority(
    expected: ReadonlyArray<{ assetId: string; sha256: string }>,
  ): Promise<{ ok: true } | { ok: false; missing: string[] }>;
  /** Record deliberate no-live for next cold authority (does not erase Ready). */
  recordNoLiveMarker(physicalLiveKind: string): Promise<void>;
  clearNoLiveMarker(): Promise<void>;
};

export type SyncDownloaders = {
  downloadBytes(url: string): Promise<Uint8Array>;
  sha256Hex(bytes: Uint8Array): Promise<string>;
};

export type SyncResult =
  | {
      outcome: "READY";
      ready: IntroReadyMetaV1;
      idempotent: boolean;
    }
  | {
      outcome: "ALREADY_READY";
      ready: IntroReadyMetaV1;
    }
  | {
      outcome: "NO_LIVE";
      physicalLiveKind: string;
      priorReadyPreserved: boolean;
    }
  | {
      outcome: "FETCH_FAILURE";
      message: string;
      priorReadyPreserved: boolean;
    }
  | {
      outcome: "CANDIDATE_FAILED";
      failureCode: string;
      priorReadyPreserved: boolean;
    };

function integrityTag(hexOrTagged: string): string {
  return hexOrTagged.startsWith("sha256:")
    ? hexOrTagged
    : `sha256:${hexOrTagged}`;
}

async function hashOf(
  downloaders: SyncDownloaders,
  bytes: Uint8Array,
): Promise<string> {
  const hex = await downloaders.sha256Hex(bytes);
  return integrityTag(hex);
}

function scene1PrerequisitesOk(pack: IntroPackV1): boolean {
  if (!pack.document?.scenes?.length) return false;
  const scene1 = pack.document.scenes[0];
  if (!scene1) return false;
  for (const layer of scene1.layers ?? []) {
    if (layer.type === "IMAGE" || layer.type === "LOGO") {
      const mediaRefId = (layer as { mediaRefId?: string }).mediaRefId;
      if (!mediaRefId) return false;
      const hit = pack.assets.find((a) => a.mediaRefId === mediaRefId);
      if (!hit) return false;
    }
  }
  return true;
}

/**
 * Deterministic sync transaction.
 * READY only after pack + all sealed assets + compatibility + fonts + Scene1.
 */
export async function runIntroForegroundSync(args: {
  store: IntroAuthorityStore;
  downloaders: SyncDownloaders;
  fetchLive: () => Promise<DeviceLiveFetchResult>;
  now?: () => string;
}): Promise<SyncResult> {
  const now = args.now ?? (() => new Date().toISOString());
  const priorReady = await args.store.readReadyMeta();

  const live = await args.fetchLive();
  if (!live.ok) {
    return {
      outcome: "FETCH_FAILURE",
      message: live.message,
      priorReadyPreserved: priorReady != null,
    };
  }

  if (live.kind === ServerLiveStatus.NO_LIVE_INTRO) {
    await args.store.recordNoLiveMarker(live.physicalLiveKind);
    return {
      outcome: "NO_LIVE",
      physicalLiveKind: live.physicalLiveKind,
      priorReadyPreserved: priorReady != null,
    };
  }

  await args.store.clearNoLiveMarker();

  if (
    priorReady &&
    priorReady.publishedRevisionId === live.publishedRevisionId &&
    priorReady.packId === live.packId &&
    priorReady.packIntegrity === live.packIntegrity
  ) {
    return { outcome: "ALREADY_READY", ready: priorReady };
  }

  const createdAt = now();
  const candidateMeta: IntroCandidateMetaV1 = {
    status: "CANDIDATE",
    publishedRevisionId: live.publishedRevisionId,
    packId: live.packId,
    packIntegrity: live.packIntegrity,
    downloadState: "STARTED",
    compatibilityState: "PENDING",
    verificationState: "PENDING",
    localStagingRoot: "candidate",
    createdAt,
    updatedAt: createdAt,
    sealedAssetIds: live.sealedAssets.map((a) => a.sealedAssetId),
  };
  await args.store.beginCandidate(candidateMeta);

  let packBytes: Uint8Array;
  try {
    packBytes = await args.downloaders.downloadBytes(live.packRetrievalUrl);
  } catch {
    await args.store.markCandidateFailed({
      failureCode: "PACK_DOWNLOAD_FAILED",
      meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
    });
    return {
      outcome: "CANDIDATE_FAILED",
      failureCode: "PACK_DOWNLOAD_FAILED",
      priorReadyPreserved: priorReady != null,
    };
  }

  let pack: IntroPackV1;
  try {
    pack = JSON.parse(new TextDecoder().decode(packBytes)) as IntroPackV1;
  } catch {
    await args.store.markCandidateFailed({
      failureCode: "PACK_PARSE_FAILED",
      meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
    });
    return {
      outcome: "CANDIDATE_FAILED",
      failureCode: "PACK_PARSE_FAILED",
      priorReadyPreserved: priorReady != null,
    };
  }

  if (
    pack.packId !== live.packId ||
    pack.publishedRevisionId !== live.publishedRevisionId
  ) {
    await args.store.markCandidateFailed({
      failureCode: "PACK_IDENTITY_MISMATCH",
      meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
    });
    return {
      outcome: "CANDIDATE_FAILED",
      failureCode: "PACK_IDENTITY_MISMATCH",
      priorReadyPreserved: priorReady != null,
    };
  }

  const payloadUtf8 = new TextEncoder().encode(packPayloadForIntegrity(pack));
  const computedIntegrity = integrityTag(
    await args.downloaders.sha256Hex(payloadUtf8),
  );
  if (
    computedIntegrity !== live.packIntegrity ||
    pack.packIntegrity !== live.packIntegrity
  ) {
    await args.store.markCandidateFailed({
      failureCode: "PACK_INTEGRITY_FAILED",
      meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
    });
    return {
      outcome: "CANDIDATE_FAILED",
      failureCode: "PACK_INTEGRITY_FAILED",
      priorReadyPreserved: priorReady != null,
    };
  }

  await args.store.writeCandidatePackJson(packBytes);

  const compat = evaluatePackCompatibility(pack);
  if (!compat.ok) {
    await args.store.markCandidateFailed({
      failureCode: `COMPAT_${compat.reason}`,
      meta: {
        ...candidateMeta,
        status: "FAILED",
        compatibilityState: "REJECTED",
        updatedAt: now(),
      },
    });
    return {
      outcome: "CANDIDATE_FAILED",
      failureCode: `COMPAT_${compat.reason}`,
      priorReadyPreserved: priorReady != null,
    };
  }

  const fonts = await args.store.assertFontAuthority(INTRO_FONT_AUTHORITY);
  if (!fonts.ok) {
    await args.store.markCandidateFailed({
      failureCode: "FONT_AUTHORITY_MISSING",
      meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
    });
    return {
      outcome: "CANDIDATE_FAILED",
      failureCode: "FONT_AUTHORITY_MISSING",
      priorReadyPreserved: priorReady != null,
    };
  }

  const verifiedAssets: IntroReadyMetaV1["sealedAssets"] = [];
  for (const asset of live.sealedAssets) {
    let bytes: Uint8Array;
    try {
      bytes = await args.downloaders.downloadBytes(asset.retrievalUrl);
    } catch {
      await args.store.markCandidateFailed({
        failureCode: `ASSET_DOWNLOAD_FAILED:${asset.sealedAssetId}`,
        meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
      });
      return {
        outcome: "CANDIDATE_FAILED",
        failureCode: `ASSET_DOWNLOAD_FAILED:${asset.sealedAssetId}`,
        priorReadyPreserved: priorReady != null,
      };
    }
    if (bytes.byteLength !== asset.byteLength) {
      await args.store.markCandidateFailed({
        failureCode: `ASSET_LENGTH_MISMATCH:${asset.sealedAssetId}`,
        meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
      });
      return {
        outcome: "CANDIDATE_FAILED",
        failureCode: `ASSET_LENGTH_MISMATCH:${asset.sealedAssetId}`,
        priorReadyPreserved: priorReady != null,
      };
    }
    const digest = await hashOf(args.downloaders, bytes);
    if (digest !== asset.sealedIntegrity) {
      await args.store.markCandidateFailed({
        failureCode: `ASSET_INTEGRITY_FAILED:${asset.sealedAssetId}`,
        meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
      });
      return {
        outcome: "CANDIDATE_FAILED",
        failureCode: `ASSET_INTEGRITY_FAILED:${asset.sealedAssetId}`,
        priorReadyPreserved: priorReady != null,
      };
    }
    await args.store.writeCandidateAsset({
      relativePackPath: asset.relativePackPath,
      bytes,
    });
    verifiedAssets.push({
      sealedAssetId: asset.sealedAssetId,
      sealedIntegrity: asset.sealedIntegrity,
      relativePackPath: asset.relativePackPath,
      byteLength: asset.byteLength,
    });
  }

  // Every pack asset must be present
  for (const packAsset of pack.assets) {
    const hit = verifiedAssets.find(
      (a) => a.sealedAssetId === packAsset.sealedAssetId,
    );
    if (!hit) {
      await args.store.markCandidateFailed({
        failureCode: `MISSING_SEALED_ASSET:${packAsset.sealedAssetId}`,
        meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
      });
      return {
        outcome: "CANDIDATE_FAILED",
        failureCode: `MISSING_SEALED_ASSET:${packAsset.sealedAssetId}`,
        priorReadyPreserved: priorReady != null,
      };
    }
  }

  if (!scene1PrerequisitesOk(pack)) {
    await args.store.markCandidateFailed({
      failureCode: "SCENE1_PREREQUISITES_FAILED",
      meta: { ...candidateMeta, status: "FAILED", updatedAt: now() },
    });
    return {
      outcome: "CANDIDATE_FAILED",
      failureCode: "SCENE1_PREREQUISITES_FAILED",
      priorReadyPreserved: priorReady != null,
    };
  }

  const readyMeta: IntroReadyMetaV1 = {
    status: "READY",
    publishedRevisionId: live.publishedRevisionId,
    packId: live.packId,
    packIntegrity: live.packIntegrity,
    sealedAssets: verifiedAssets,
    promotedAt: now(),
    activePointer: null,
  };
  await args.store.promoteCandidateToReady(readyMeta);

  return {
    outcome: "READY",
    ready: readyMeta,
    idempotent: false,
  };
}
