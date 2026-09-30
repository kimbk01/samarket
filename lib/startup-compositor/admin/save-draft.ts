/**
 * REBUILD 14 P6 — SAVE = durable Draft only.
 *
 * Does NOT publish, apply, change Owner Live, or change active generation.
 */

import {
  authoringContentFingerprint,
  type StartupAuthoringDocument,
} from "@/lib/startup-compositor/admin/authoring-document";
import { validateAuthoringDocument } from "@/lib/startup-compositor/admin/validate";
import { humanizeAuthoringError } from "@/lib/startup-compositor/admin/human-errors";

export type SaveDraftResult =
  | {
      readonly ok: true;
      readonly document: StartupAuthoringDocument;
      readonly createdRelease: false;
      readonly changedLive: false;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly messageKo: string;
    };

export type DraftStore = {
  get(documentId: string): StartupAuthoringDocument | null;
  put(doc: StartupAuthoringDocument): void;
};

/** In-memory draft store for tests / local authority. */
export function createMemoryDraftStore(
  seed: readonly StartupAuthoringDocument[] = [],
): DraftStore {
  const map = new Map<string, StartupAuthoringDocument>();
  for (const d of seed) map.set(d.documentId, d);
  return {
    get: (id) => map.get(id) ?? null,
    put: (doc) => {
      map.set(doc.documentId, doc);
    },
  };
}

const inflightSaves = new Set<string>();

export function saveAuthoringDraft(
  store: DraftStore,
  working: StartupAuthoringDocument,
): SaveDraftResult {
  if (inflightSaves.has(working.documentId)) {
    return {
      ok: false,
      reason: "save_in_flight",
      messageKo: humanizeAuthoringError("save_in_flight"),
    };
  }
  inflightSaves.add(working.documentId);
  try {
    const v = validateAuthoringDocument(working);
    if (!v.ok) {
      return { ok: false, reason: v.reason, messageKo: v.messageKo };
    }
    const nextVersion = working.draftVersion + 1;
    const fingerprint = authoringContentFingerprint(working);
    const saved: StartupAuthoringDocument = {
      ...working,
      draftVersion: nextVersion,
      savedFingerprint: fingerprint,
    };
    store.put(saved);
    return {
      ok: true,
      document: saved,
      createdRelease: false,
      changedLive: false,
    };
  } finally {
    inflightSaves.delete(working.documentId);
  }
}
