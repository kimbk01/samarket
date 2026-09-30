/**
 * REBUILD 14 P6 — SERVICE APPLY pipeline.
 *
 * Saved Draft only → canonical validation → immutable Release →
 * StartupPackageEnvelope → integrity seal → Owner Live generation.
 *
 * Unsaved working state is rejected (SAVE first required).
 * Preview must never call this path.
 */

import {
  authoringContentFingerprint,
  hasUnsavedAuthoringChanges,
  type StartupAuthoringDocument,
} from "@/lib/startup-compositor/admin/authoring-document";
import { validateAuthoringDocument } from "@/lib/startup-compositor/admin/validate";
import { humanizeAuthoringError } from "@/lib/startup-compositor/admin/human-errors";
import type { DraftStore } from "@/lib/startup-compositor/admin/save-draft";
import {
  toStoredGeneration,
  type ImmutableReleaseRecord,
  type StartupLiveRepository,
} from "@/lib/startup-compositor/admin/live-repository";
import {
  STARTUP_PACKAGE_SCHEMA_VERSION,
  envelopeWithoutIntegrityField,
  parseStartupPackageEnvelope,
  type MediaManifestEntry,
  type StartupPackageEnvelope,
} from "@/lib/startup-compositor/envelope";
import {
  computeEnvelopeIntegrity,
  verifyEnvelopeIntegrity,
} from "@/lib/startup-compositor/integrity";
import {
  promoteStagingIfValid,
  stageGeneration,
} from "@/lib/startup-compositor/generation-authority";
import { canBecomeActiveProductGeneration } from "@/lib/startup-compositor/content-class";

export type ServiceApplyResult =
  | {
      readonly ok: true;
      readonly release: ImmutableReleaseRecord;
      readonly envelope: StartupPackageEnvelope;
      readonly liveGenerationId: string;
      readonly idempotentReplay: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly messageKo: string;
      /** Prior Live generation preserved on failure. */
      readonly priorLiveGenerationId: string | null;
    };

export type ServiceApplyArgs = {
  readonly documentId: string;
  /**
   * Optional working document. If provided and diverges from saved Draft,
   * Apply is blocked (SAVE first).
   */
  readonly working?: StartupAuthoringDocument;
  readonly mediaManifest?: readonly MediaManifestEntry[];
  readonly capabilityVersion?: number;
  /** Idempotency: same key + same draftVersion → same release. */
  readonly idempotencyKey?: string;
  /** Test hook: force package seal failure after staging. */
  readonly forceSealFail?: boolean;
};

const inflightApply = new Set<string>();
const idempotencyIndex = new Map<string, string>();

/** Test-only: clear process-local Apply locks / idempotency index. */
export function __resetServiceApplyStateForTests(): void {
  inflightApply.clear();
  idempotencyIndex.clear();
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildStartupPackageEnvelope(args: {
  readonly generationId: string;
  readonly draft: StartupAuthoringDocument;
  readonly mediaManifest?: readonly MediaManifestEntry[];
  readonly capabilityVersion?: number;
}): StartupPackageEnvelope {
  const withoutIntegrity = {
    schemaVersion: STARTUP_PACKAGE_SCHEMA_VERSION,
    generationId: args.generationId,
    contentClass: args.draft.contentClass,
    systemStart: args.draft.systemStart,
    intro: args.draft.introEnabled
      ? {
          present: true as const,
          document: args.draft.intro as unknown as Record<string, unknown>,
        }
      : { present: false as const },
    mediaManifest: [...(args.mediaManifest ?? [])],
    capabilityVersion: args.capabilityVersion ?? 1,
  };
  const integrity = computeEnvelopeIntegrity(withoutIntegrity).hex;
  const raw = { ...withoutIntegrity, integrity };
  const parsed = parseStartupPackageEnvelope(raw);
  if (!parsed.ok) {
    throw new Error(`package_seal_failed:${parsed.reason}`);
  }
  return parsed.value;
}

export function applyServiceFromSavedDraft(
  draftStore: DraftStore,
  liveRepo: StartupLiveRepository,
  args: ServiceApplyArgs,
): ServiceApplyResult {
  const priorLive = liveRepo.getActiveGenerationId();
  const lockKey = args.documentId;

  if (inflightApply.has(lockKey)) {
    return {
      ok: false,
      reason: "apply_in_flight",
      messageKo: humanizeAuthoringError("apply_in_flight"),
      priorLiveGenerationId: priorLive,
    };
  }
  inflightApply.add(lockKey);

  try {
    const saved = draftStore.get(args.documentId);
    if (!saved || saved.draftVersion < 1 || !saved.savedFingerprint) {
      return {
        ok: false,
        reason: "apply_requires_saved_draft",
        messageKo: humanizeAuthoringError("apply_requires_saved_draft"),
        priorLiveGenerationId: priorLive,
      };
    }

    if (args.working) {
      if (
        hasUnsavedAuthoringChanges(args.working) ||
        authoringContentFingerprint(args.working) !== saved.savedFingerprint
      ) {
        return {
          ok: false,
          reason: "apply_unsaved_divergence",
          messageKo: humanizeAuthoringError("apply_unsaved_divergence"),
          priorLiveGenerationId: priorLive,
        };
      }
    }

    if (!canBecomeActiveProductGeneration(saved.contentClass)) {
      return {
        ok: false,
        reason: `apply_forbidden_content_class:${saved.contentClass}`,
        messageKo: humanizeAuthoringError(
          `apply_forbidden_content_class:${saved.contentClass}`,
        ),
        priorLiveGenerationId: priorLive,
      };
    }

    const v = validateAuthoringDocument(saved);
    if (!v.ok) {
      return {
        ok: false,
        reason: v.reason,
        messageKo: v.messageKo,
        priorLiveGenerationId: priorLive,
      };
    }

    const idemKey =
      args.idempotencyKey?.trim() ||
      `apply_${saved.documentId}_v${saved.draftVersion}`;
    const existingReleaseId = idempotencyIndex.get(idemKey);
    if (existingReleaseId) {
      const existing = liveRepo.getRelease(existingReleaseId);
      if (existing) {
        return {
          ok: true,
          release: existing,
          envelope: existing.envelope,
          liveGenerationId:
            liveRepo.getActiveGenerationId() ?? existing.generationId,
          idempotentReplay: true,
        };
      }
    }

    const generationId = newId("gen");
    const releaseId = newId("rel");

    let envelope: StartupPackageEnvelope;
    try {
      if (args.forceSealFail) {
        throw new Error("package_seal_failed:forced");
      }
      envelope = buildStartupPackageEnvelope({
        generationId,
        draft: saved,
        mediaManifest: args.mediaManifest,
        capabilityVersion: args.capabilityVersion,
      });
    } catch {
      return {
        ok: false,
        reason: "package_seal_failed",
        messageKo: humanizeAuthoringError("package_seal_failed"),
        priorLiveGenerationId: priorLive,
      };
    }

    const sealOk = verifyEnvelopeIntegrity({
      envelopeWithoutIntegrityField: envelopeWithoutIntegrityField(envelope),
      expectedHex: envelope.integrity,
    });
    if (!sealOk) {
      return {
        ok: false,
        reason: "staging_integrity_fail",
        messageKo: humanizeAuthoringError("staging_integrity_fail"),
        priorLiveGenerationId: priorLive,
      };
    }

    let authority = liveRepo.getAuthority();
    authority = stageGeneration(authority, toStoredGeneration(envelope));
    const promoted = promoteStagingIfValid(authority, { integrityOk: true });
    if (!promoted.ok) {
      liveRepo.setAuthority(promoted.next);
      return {
        ok: false,
        reason: promoted.reason,
        messageKo: humanizeAuthoringError(promoted.reason),
        priorLiveGenerationId: priorLive,
      };
    }

    const record: ImmutableReleaseRecord = {
      releaseId,
      generationId,
      contentClass: "OWNER",
      draftDocumentId: saved.documentId,
      draftVersion: saved.draftVersion,
      envelope,
      createdAtIso: new Date().toISOString(),
      immutable: true,
    };
    liveRepo.putRelease(record);
    liveRepo.setAuthority(promoted.next);
    idempotencyIndex.set(idemKey, releaseId);

    return {
      ok: true,
      release: record,
      envelope,
      liveGenerationId: generationId,
      idempotentReplay: false,
    };
  } finally {
    inflightApply.delete(lockKey);
  }
}
