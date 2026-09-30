/**
 * REBUILD 14 P6 — ONE Owner Live pointer repository.
 *
 * Exactly one active generation. No Preview pointer. No QA→Owner.
 * Durable implementation may later bind storage/DB; P6 ships memory + interface.
 */

import type { StartupContentClass } from "@/lib/startup-compositor/content-class";
import type { StartupPackageEnvelope } from "@/lib/startup-compositor/envelope";
import type {
  GenerationAuthorityState,
  StoredGeneration,
} from "@/lib/startup-compositor/generation-authority";
import { createEmptyAuthorityState } from "@/lib/startup-compositor/generation-authority";

export type ImmutableReleaseRecord = {
  readonly releaseId: string;
  readonly generationId: string;
  readonly contentClass: StartupContentClass;
  readonly draftDocumentId: string;
  readonly draftVersion: number;
  readonly envelope: StartupPackageEnvelope;
  readonly createdAtIso: string;
  /** Past releases are immutable — no mutation API. */
  readonly immutable: true;
};

export type StartupLiveRepository = {
  getAuthority(): GenerationAuthorityState;
  setAuthority(next: GenerationAuthorityState): void;
  getRelease(releaseId: string): ImmutableReleaseRecord | null;
  getReleaseByGeneration(generationId: string): ImmutableReleaseRecord | null;
  putRelease(record: ImmutableReleaseRecord): void;
  /** Returns prior Live generation id if any (for failed-apply leave-prior proofs). */
  getActiveGenerationId(): string | null;
};

export function createMemoryLiveRepository(): StartupLiveRepository {
  let authority = createEmptyAuthorityState();
  const releases = new Map<string, ImmutableReleaseRecord>();
  const byGeneration = new Map<string, string>();

  return {
    getAuthority: () => authority,
    setAuthority: (next) => {
      authority = next;
    },
    getRelease: (id) => releases.get(id) ?? null,
    getReleaseByGeneration: (gid) => {
      const rid = byGeneration.get(gid);
      return rid ? releases.get(rid) ?? null : null;
    },
    putRelease: (record) => {
      if (releases.has(record.releaseId)) {
        // Immutability: refuse overwrite of past release contents.
        const existing = releases.get(record.releaseId)!;
        if (
          existing.envelope.integrity !== record.envelope.integrity ||
          existing.generationId !== record.generationId
        ) {
          throw new Error("immutable_release_mutation_forbidden");
        }
        return;
      }
      releases.set(record.releaseId, record);
      byGeneration.set(record.generationId, record.releaseId);
    },
    getActiveGenerationId: () => authority.active?.generationId ?? null,
  };
}

export function toStoredGeneration(
  envelope: StartupPackageEnvelope,
): StoredGeneration {
  return {
    generationId: envelope.generationId,
    contentClass: envelope.contentClass,
    integrityHex: envelope.integrity,
  };
}
