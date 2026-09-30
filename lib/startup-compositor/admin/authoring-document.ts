/**
 * REBUILD 14 P6 — ONE Admin authoring document authority.
 *
 * System Start + Intro share one draft lineage. No second System Start store
 * and no separate Intro Live document at the authoring layer.
 */

import {
  createEmptyV0Document,
  type IntroDocumentV1,
} from "@/lib/intro/contracts/document";
import {
  parseSystemStartIR,
  type SystemStartIR,
} from "@/lib/startup-compositor/system-start-ir";
import type { StartupContentClass } from "@/lib/startup-compositor/content-class";

export const STARTUP_AUTHORING_SCHEMA_VERSION = 14 as const;

export type StartupAuthoringDocument = {
  readonly schemaVersion: typeof STARTUP_AUTHORING_SCHEMA_VERSION;
  readonly documentId: string;
  readonly title: string;
  readonly contentClass: StartupContentClass;
  readonly draftVersion: number;
  /** Fingerprint of last durable save (empty = never saved). */
  readonly savedFingerprint: string;
  readonly systemStart: SystemStartIR;
  readonly intro: IntroDocumentV1;
  /** When false, Apply builds envelope with intro.present=false. */
  readonly introEnabled: boolean;
};

export type AuthoringParseResult =
  | { readonly ok: true; readonly value: StartupAuthoringDocument }
  | { readonly ok: false; readonly reason: string };

export function defaultSystemStartIR(): SystemStartIR {
  return {
    backgroundColor: "#0B3D91",
    backgroundImageMediaId: null,
    brandAssetEnabled: false,
    brandAssetMediaId: null,
    brandSizePreset: "M",
    brandXNorm: 0.5,
    brandYNorm: 0.42,
    minVisibleMs: 1000,
  };
}

export function createEmptyAuthoringDocument(args: {
  readonly documentId: string;
  readonly title?: string;
  readonly contentClass?: StartupContentClass;
}): StartupAuthoringDocument {
  const title = args.title?.trim() || "Startup";
  return {
    schemaVersion: STARTUP_AUTHORING_SCHEMA_VERSION,
    documentId: args.documentId,
    title,
    contentClass: args.contentClass ?? "OWNER",
    draftVersion: 0,
    savedFingerprint: "",
    systemStart: defaultSystemStartIR(),
    intro: createEmptyV0Document(title),
    introEnabled: true,
  };
}

/** Stable fingerprint of editable content (excludes draftVersion / savedFingerprint). */
export function authoringContentFingerprint(doc: StartupAuthoringDocument): string {
  return JSON.stringify({
    title: doc.title,
    contentClass: doc.contentClass,
    systemStart: doc.systemStart,
    intro: doc.intro,
    introEnabled: doc.introEnabled,
  });
}

export function hasUnsavedAuthoringChanges(doc: StartupAuthoringDocument): boolean {
  if (!doc.savedFingerprint) return true;
  return authoringContentFingerprint(doc) !== doc.savedFingerprint;
}

export function parseAuthoringDocument(raw: unknown): AuthoringParseResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "authoring_not_object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== STARTUP_AUTHORING_SCHEMA_VERSION) {
    return { ok: false, reason: "authoring_schema_unsupported" };
  }
  if (typeof o.documentId !== "string" || !o.documentId.trim()) {
    return { ok: false, reason: "authoring_document_id_invalid" };
  }
  if (typeof o.title !== "string" || !o.title.trim()) {
    return { ok: false, reason: "authoring_title_invalid" };
  }
  const contentClass = o.contentClass;
  if (
    contentClass !== "OWNER" &&
    contentClass !== "QA" &&
    contentClass !== "SYSTEM_BOOTSTRAP"
  ) {
    return { ok: false, reason: "authoring_content_class_invalid" };
  }
  const draftVersion = Number(o.draftVersion);
  if (!Number.isInteger(draftVersion) || draftVersion < 0) {
    return { ok: false, reason: "authoring_draft_version_invalid" };
  }
  const ss = parseSystemStartIR(o.systemStart);
  if (!ss.ok) return { ok: false, reason: ss.reason };
  if (!o.intro || typeof o.intro !== "object") {
    return { ok: false, reason: "authoring_intro_missing" };
  }
  return {
    ok: true,
    value: {
      schemaVersion: STARTUP_AUTHORING_SCHEMA_VERSION,
      documentId: o.documentId.trim(),
      title: o.title.trim(),
      contentClass,
      draftVersion,
      savedFingerprint:
        typeof o.savedFingerprint === "string" ? o.savedFingerprint : "",
      systemStart: ss.value,
      intro: o.intro as IntroDocumentV1,
      introEnabled: o.introEnabled !== false,
    },
  };
}
