import type { SupabaseClient } from "@supabase/supabase-js";
import { publishIntroDocument } from "@/lib/intro/publish/service";
import { getIntroDocument } from "@/lib/intro/document/service";
import { getLiveStatus, setLiveRelease, type LiveStatus } from "@/lib/intro/live/service";
import { normalizeIntroContentClass } from "@/lib/intro/admin/operator-classification";
import { getSystemStartConfig } from "@/lib/intro/system-start/service";
import {
  applyServiceFromSavedDraft,
  authoringContentFingerprint,
  type StartupAuthoringDocument,
} from "@/lib/startup-compositor";
import {
  getProcessDraftStore,
  getProcessLiveRepository,
} from "@/lib/startup-compositor/admin/process-live-singleton";
import { STARTUP_AUTHORING_SCHEMA_VERSION } from "@/lib/startup-compositor/admin/authoring-document";
import {
  parseSystemStartIR,
  type SystemStartIR,
} from "@/lib/startup-compositor/system-start-ir";

/**
 * Owner atomic action: 서비스 적용.
 * Internal: saved Draft → canonical validation → Release → Package → Live pointer.
 * Owner must NEVER need a separate Publish step.
 *
 * P6: also seals ONE StartupPackageEnvelope (systemStart + intro) and promotes
 * ONE Owner Live generation via generation-authority. Historical app_intro_live
 * write remains for transitional device API (hosts still UNWIRED).
 */
export type ApplyServiceResult = {
  documentId: string;
  draftVersion: number;
  releaseId: string;
  packageId: string;
  packageIntegrity: string;
  live: LiveStatus;
  startupEnvelopeIntegrity: string;
  startupGenerationId: string;
  phases: {
    draftValidated: true;
    releaseCreated: true;
    packageVerified: true;
    liveApplied: true;
    startupEnvelopeSealed: true;
  };
};

function toSystemStartIR(next: {
  backgroundColor: string;
  backgroundImageMediaId: string | null;
  brandAssetEnabled: boolean;
  brandAssetMediaId: string | null;
  brandSizePreset: SystemStartIR["brandSizePreset"];
  brandXNorm: number;
  brandYNorm: number;
  minVisibleMs: number;
}): SystemStartIR {
  const parsed = parseSystemStartIR({
    backgroundColor: next.backgroundColor,
    backgroundImageMediaId: next.backgroundImageMediaId,
    brandAssetEnabled: next.brandAssetEnabled,
    brandAssetMediaId: next.brandAssetMediaId,
    brandSizePreset: next.brandSizePreset,
    brandXNorm: next.brandXNorm,
    brandYNorm: next.brandYNorm,
    minVisibleMs: next.minVisibleMs,
  });
  if (!parsed.ok) {
    throw new Error(`system_start_ir_invalid:${parsed.reason}`);
  }
  return parsed.value;
}

export async function applyIntroServiceFromDraft(
  sb: SupabaseClient,
  args: {
    documentId: string;
    userId: string;
    /** Optional; defaults to apply_<doc>_<draftVersion>_<ms> */
    idempotencyKey?: string;
  },
): Promise<ApplyServiceResult> {
  const row = await getIntroDocument(sb, args.documentId);
  if (!row) throw new Error("document_not_found");

  const contentClass = normalizeIntroContentClass(row.content_class);
  if (contentClass !== "OWNER") {
    throw new Error(`apply_forbidden_content_class:${contentClass}`);
  }

  const draftVersion = row.draft_version;
  const idempotencyKey =
    args.idempotencyKey?.trim() ||
    `apply_${args.documentId}_${draftVersion}_${Date.now()}`;

  // Ownership trail for DEFECT 010 — actor + draft → live phases (no silent Live mutate).
  console.info(
    JSON.stringify({
      event: "intro_apply_service_begin",
      documentId: args.documentId,
      draftVersion,
      userId: args.userId,
      idempotencyKey,
      at: new Date().toISOString(),
    }),
  );

  // Order: saved Draft → canonical validation (inside publish) → Release → Package → Live.
  const published = await publishIntroDocument(sb, {
    documentId: args.documentId,
    userId: args.userId,
    idempotencyKey,
  });

  const live = await setLiveRelease(sb, {
    releaseId: published.releaseId,
    userId: args.userId,
    expectedSourceDraftVersion: draftVersion,
  });

  if (live.kind !== "LIVE") {
    throw new Error("live_not_set_after_apply");
  }
  if (live.releaseId !== published.releaseId) {
    throw new Error("live_release_mismatch_after_apply");
  }

  // P6 ONE StartupPackageEnvelope + ONE generation pointer (Admin pipeline).
  const ss = await getSystemStartConfig(sb);
  const authoringBase: Omit<StartupAuthoringDocument, "savedFingerprint"> = {
    schemaVersion: STARTUP_AUTHORING_SCHEMA_VERSION,
    documentId: args.documentId,
    title: row.title || "Startup",
    contentClass: "OWNER",
    draftVersion,
    systemStart: toSystemStartIR(ss.nextBuild),
    intro: row.document,
    introEnabled: true,
  };
  const savedDoc: StartupAuthoringDocument = {
    ...authoringBase,
    savedFingerprint: authoringContentFingerprint({
      ...authoringBase,
      savedFingerprint: "",
    }),
  };
  const draftStore = getProcessDraftStore();
  draftStore.put(savedDoc);
  const envelopeApply = applyServiceFromSavedDraft(
    draftStore,
    getProcessLiveRepository(),
    {
      documentId: args.documentId,
      idempotencyKey: `envelope_${idempotencyKey}`,
    },
  );
  if (!envelopeApply.ok) {
    throw new Error(`startup_envelope_apply_failed:${envelopeApply.reason}`);
  }

  console.info(
    JSON.stringify({
      event: "intro_apply_service_committed",
      documentId: args.documentId,
      draftVersion,
      userId: args.userId,
      releaseId: published.releaseId,
      packageId: published.packageId,
      packageIntegrity: published.packageIntegrity,
      startupGenerationId: envelopeApply.liveGenerationId,
      startupEnvelopeIntegrity: envelopeApply.envelope.integrity,
      at: new Date().toISOString(),
    }),
  );

  return {
    documentId: args.documentId,
    draftVersion,
    releaseId: published.releaseId,
    packageId: published.packageId,
    packageIntegrity: published.packageIntegrity,
    live,
    startupEnvelopeIntegrity: envelopeApply.envelope.integrity,
    startupGenerationId: envelopeApply.liveGenerationId,
    phases: {
      draftValidated: true,
      releaseCreated: true,
      packageVerified: true,
      liveApplied: true,
      startupEnvelopeSealed: true,
    },
  };
}

export async function assertLiveMatchesDraft(
  sb: SupabaseClient,
  documentId: string,
  draftVersion: number,
): Promise<boolean> {
  const live = await getLiveStatus(sb);
  if (live.kind !== "LIVE") return false;
  const { data: rev } = await sb
    .from("app_intro_revisions")
    .select("document_id, source_draft_version")
    .eq("published_revision_id", live.releaseId)
    .maybeSingle();
  return (
    rev?.document_id === documentId &&
    rev?.source_draft_version === draftVersion
  );
}
