/**
 * REBUILD 14 — ONE active generation authority + bootstrap lifecycle policy.
 *
 * Frozen rules:
 * - SYSTEM_BOOTSTRAP = first-install seed only (same envelope schema).
 * - After Owner verified established → bootstrap NEVER reactivates.
 * - Failed staging G(n+1) → keep last known good Owner G(n).
 * - Active Owner corrupt at cold → FATAL_OWNER_LOCAL_CORRUPTION (not bootstrap).
 * - Storage history ≠ presentation authority; exactly ONE active pointer.
 */

import type { StartupContentClass } from "@/lib/startup-compositor/content-class";
import { canBecomeActiveProductGeneration } from "@/lib/startup-compositor/content-class";

export type GenerationId = string;

export type StoredGeneration = {
  readonly generationId: GenerationId;
  readonly contentClass: StartupContentClass;
  readonly integrityHex: string;
};

export type ActiveGenerationPointer = {
  readonly generationId: GenerationId;
  readonly contentClass: StartupContentClass;
};

export type GenerationAuthorityState = {
  /** True after any Owner generation was successfully verified + atomically promoted. */
  readonly ownerAuthorityEverEstablished: boolean;
  readonly active: ActiveGenerationPointer | null;
  /** Immutable verified history (not active authority). */
  readonly verifiedHistory: readonly StoredGeneration[];
  readonly staging: StoredGeneration | null;
};

export type ResolveColdActiveResult =
  | {
      readonly kind: "ACTIVE";
      readonly pointer: ActiveGenerationPointer;
    }
  | {
      readonly kind: "FATAL_OWNER_LOCAL_CORRUPTION";
      readonly generationId: GenerationId;
    }
  | {
      readonly kind: "USE_BOOTSTRAP_SEED";
      readonly reason: "owner_never_established";
    }
  | {
      readonly kind: "FATAL_BOOTSTRAP";
      readonly reason: string;
    };

export type PromoteStagingResult =
  | { readonly ok: true; readonly next: GenerationAuthorityState }
  | { readonly ok: false; readonly reason: string; readonly next: GenerationAuthorityState };

export function createEmptyAuthorityState(): GenerationAuthorityState {
  return {
    ownerAuthorityEverEstablished: false,
    active: null,
    verifiedHistory: [],
    staging: null,
  };
}

/** Stage candidate; does not touch active pointer. */
export function stageGeneration(
  state: GenerationAuthorityState,
  candidate: StoredGeneration,
): GenerationAuthorityState {
  return { ...state, staging: candidate };
}

/**
 * Verify staging then atomically switch active pointer.
 * QA cannot become active. Bootstrap cannot promote as Owner Live after Owner established
 * (bootstrap cold seed is handled separately via establishBootstrapSeed).
 */
export function promoteStagingIfValid(
  state: GenerationAuthorityState,
  args: { integrityOk: boolean },
): PromoteStagingResult {
  if (!state.staging) {
    return { ok: false, reason: "staging_empty", next: state };
  }
  if (!args.integrityOk) {
    return {
      ok: false,
      reason: "staging_integrity_fail",
      next: { ...state, staging: null },
    };
  }
  const staged = state.staging;
  if (!canBecomeActiveProductGeneration(staged.contentClass)) {
    return {
      ok: false,
      reason: `staging_content_class_forbidden:${staged.contentClass}`,
      next: { ...state, staging: null },
    };
  }
  const pointer: ActiveGenerationPointer = {
    generationId: staged.generationId,
    contentClass: staged.contentClass,
  };
  const history = [
    ...state.verifiedHistory.filter((g) => g.generationId !== staged.generationId),
    staged,
  ];
  return {
    ok: true,
    next: {
      ownerAuthorityEverEstablished: true,
      active: pointer,
      verifiedHistory: history,
      staging: null,
    },
  };
}

/**
 * First-install / pre-Owner: activate SYSTEM_BOOTSTRAP seed as active pointer.
 * Forbidden if Owner authority was ever established.
 */
export function establishBootstrapSeed(
  state: GenerationAuthorityState,
  seed: StoredGeneration,
): PromoteStagingResult {
  if (state.ownerAuthorityEverEstablished) {
    return {
      ok: false,
      reason: "bootstrap_reactivation_forbidden",
      next: state,
    };
  }
  if (seed.contentClass !== "SYSTEM_BOOTSTRAP") {
    return {
      ok: false,
      reason: "bootstrap_content_class_required",
      next: state,
    };
  }
  const pointer: ActiveGenerationPointer = {
    generationId: seed.generationId,
    contentClass: "SYSTEM_BOOTSTRAP",
  };
  return {
    ok: true,
    next: {
      ownerAuthorityEverEstablished: false,
      active: pointer,
      verifiedHistory: [seed],
      staging: null,
    },
  };
}

/**
 * Cold resolve policy (structural). Callers supply local integrity of active generation.
 */
export function resolveColdActive(args: {
  state: GenerationAuthorityState;
  activeIntegrityOk: boolean | null;
  bootstrapSeedAvailable: boolean;
}): ResolveColdActiveResult {
  const { state } = args;

  if (state.ownerAuthorityEverEstablished) {
    if (!state.active || state.active.contentClass !== "OWNER") {
      return {
        kind: "FATAL_OWNER_LOCAL_CORRUPTION",
        generationId: state.active?.generationId ?? "unknown",
      };
    }
    if (args.activeIntegrityOk !== true) {
      return {
        kind: "FATAL_OWNER_LOCAL_CORRUPTION",
        generationId: state.active.generationId,
      };
    }
    return { kind: "ACTIVE", pointer: state.active };
  }

  // Owner never established
  if (state.active?.contentClass === "SYSTEM_BOOTSTRAP") {
    if (args.activeIntegrityOk === true) {
      return { kind: "ACTIVE", pointer: state.active };
    }
    if (args.bootstrapSeedAvailable) {
      return { kind: "USE_BOOTSTRAP_SEED", reason: "owner_never_established" };
    }
    return { kind: "FATAL_BOOTSTRAP", reason: "bootstrap_corrupt" };
  }

  if (args.bootstrapSeedAvailable) {
    return { kind: "USE_BOOTSTRAP_SEED", reason: "owner_never_established" };
  }
  return { kind: "FATAL_BOOTSTRAP", reason: "no_seed" };
}

/** Bootstrap must not replace Owner after establishment (policy helper for tests). */
export function wouldBootstrapReactivateAfterOwner(
  state: GenerationAuthorityState,
): boolean {
  return state.ownerAuthorityEverEstablished;
}
