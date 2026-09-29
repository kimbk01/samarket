/**
 * DIBAY INTRO — V3 Ready → Active atomic promotion (pointer only).
 * Does not rebuild Pack, rewrite document, or re-encode media.
 */

import type { IntroActiveMetaV1, IntroReadyMetaV1 } from "./local-store-paths";
import { INTRO_STORE_LAYOUT } from "./local-store-paths";

export const INTRO_COMPATIBILITY_VERSION = "intro-pack-v1/r1" as const;

export type IntroActiveStore = {
  readReadyMeta(): Promise<IntroReadyMetaV1 | null>;
  readActiveMeta(): Promise<IntroActiveMetaV1 | null>;
  /**
   * Atomic Active write. On failure previous Active must remain.
   * Implementation must not mutate Ready Pack bytes.
   */
  promoteReadyToActive(meta: IntroActiveMetaV1): Promise<void>;
};

export type ActivateResult =
  | {
      outcome: "ACTIVATED";
      active: IntroActiveMetaV1;
      idempotent: boolean;
    }
  | {
      outcome: "ALREADY_ACTIVE";
      active: IntroActiveMetaV1;
    }
  | {
      outcome: "NO_READY";
    }
  | {
      outcome: "ACTIVATE_FAILED";
      reason: string;
      priorActivePreserved: boolean;
    };

export function buildActiveMetaFromReady(
  ready: IntroReadyMetaV1,
  activatedAt: string,
): IntroActiveMetaV1 {
  return {
    status: "ACTIVE",
    publishedRevisionId: ready.publishedRevisionId,
    packId: ready.packId,
    packIntegrity: ready.packIntegrity,
    localPackPath: INTRO_STORE_LAYOUT.readyPack,
    localAssetsRoot: INTRO_STORE_LAYOUT.readyAssetsDir,
    verifiedAssetAuthority: ready.sealedAssets.map((a) => ({
      sealedAssetId: a.sealedAssetId,
      sealedIntegrity: a.sealedIntegrity,
      relativePackPath: a.relativePackPath,
    })),
    compatibilityVersion: INTRO_COMPATIBILITY_VERSION,
    activatedAt,
  };
}

function sameActiveIdentity(
  a: IntroActiveMetaV1,
  ready: IntroReadyMetaV1,
): boolean {
  return (
    a.publishedRevisionId === ready.publishedRevisionId &&
    a.packId === ready.packId &&
    a.packIntegrity === ready.packIntegrity
  );
}

/**
 * Promote verified Ready → Active.
 * Idempotent when Active already matches Ready identity.
 * Failed activation must leave previous Active authoritative.
 */
export async function promoteReadyToActiveAuthority(args: {
  store: IntroActiveStore;
  now?: () => string;
}): Promise<ActivateResult> {
  const now = args.now ?? (() => new Date().toISOString());
  const ready = await args.store.readReadyMeta();
  if (!ready) return { outcome: "NO_READY" };

  const prior = await args.store.readActiveMeta();
  if (prior && sameActiveIdentity(prior, ready)) {
    return { outcome: "ALREADY_ACTIVE", active: prior };
  }

  const meta = buildActiveMetaFromReady(ready, now());
  try {
    await args.store.promoteReadyToActive(meta);
    return {
      outcome: "ACTIVATED",
      active: meta,
      idempotent: false,
    };
  } catch (err) {
    return {
      outcome: "ACTIVATE_FAILED",
      reason: err instanceof Error ? err.message : "activate_failed",
      priorActivePreserved: prior != null,
    };
  }
}
