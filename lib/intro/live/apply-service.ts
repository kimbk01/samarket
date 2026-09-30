import type { SupabaseClient } from "@supabase/supabase-js";
import { publishIntroDocument } from "@/lib/intro/publish/service";
import { getIntroDocument } from "@/lib/intro/document/service";
import { getLiveStatus, setLiveRelease, type LiveStatus } from "@/lib/intro/live/service";
import { normalizeIntroContentClass } from "@/lib/intro/admin/operator-classification";
import { getSystemStartConfig } from "@/lib/intro/system-start/service";
import { APP_INTRO_STORAGE_BUCKET } from "@/lib/intro/db/authority";
import { parseIntegrity } from "@/lib/intro/media/integrity";
import {
  logicalApplyIntentKey,
  startupEnvelopeStoragePath,
} from "@/lib/intro/live/apply-intent";
import {
  applyServiceFromSavedDraft,
  authoringContentFingerprint,
  type StartupAuthoringDocument,
  type StartupPackageEnvelope,
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
import type { MediaManifestEntry } from "@/lib/startup-compositor/envelope";

/**
 * Owner atomic action: 서비스 적용.
 * Internal: saved Draft → canonical validation → Release → Package → Live pointer.
 * Owner must NEVER need a separate Publish step.
 *
 * P6: also seals ONE StartupPackageEnvelope (systemStart + intro) and promotes
 * ONE Owner Live generation via generation-authority. Historical app_intro_live
 * write remains for transitional device API (hosts still UNWIRED).
 *
 * Logical Apply intent = documentId + draftVersion (server-owned).
 * Client-supplied keys are correlation-only and cannot mint extra Releases.
 * Content class / QA docs are NOT silently reinterpreted as Owner Live.
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
  idempotentReplay: boolean;
  phases: {
    draftValidated: true;
    releaseCreated: true;
    packageVerified: true;
    liveApplied: true;
    startupEnvelopeSealed: true;
    startupEnvelopeStored: true;
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

async function loadMediaManifestFromPack(
  sb: SupabaseClient,
  packageId: string,
  storagePath: string,
): Promise<readonly MediaManifestEntry[]> {
  if (!storagePath) return [];
  const { data: packBlob, error } = await sb.storage
    .from(APP_INTRO_STORAGE_BUCKET)
    .download(storagePath);
  if (error || !packBlob) return [];
  try {
    const packJson = JSON.parse(await packBlob.text()) as {
      assets?: Record<string, { integrity?: string }>;
    };
    const out: MediaManifestEntry[] = [];
    for (const [mediaId, asset] of Object.entries(packJson.assets ?? {})) {
      const raw = typeof asset?.integrity === "string" ? asset.integrity : "";
      const parsed = parseIntegrity(raw);
      if (parsed) {
        out.push({ mediaId, integrityHex: parsed.hex });
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function readStoredStartupEnvelope(
  sb: SupabaseClient,
  packageId: string,
): Promise<StartupPackageEnvelope | null> {
  const path = startupEnvelopeStoragePath(packageId);
  const { data, error } = await sb.storage.from(APP_INTRO_STORAGE_BUCKET).download(path);
  if (error || !data) return null;
  try {
    const parsed = JSON.parse(await data.text()) as StartupPackageEnvelope;
    if (
      parsed?.schemaVersion !== 14 ||
      typeof parsed.integrity !== "string" ||
      typeof parsed.generationId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function persistStartupEnvelope(
  sb: SupabaseClient,
  packageId: string,
  envelope: StartupPackageEnvelope,
): Promise<string> {
  const path = startupEnvelopeStoragePath(packageId);
  const bytes = Buffer.from(JSON.stringify(envelope), "utf8");
  const { error } = await sb.storage.from(APP_INTRO_STORAGE_BUCKET).upload(path, bytes, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(`startup_envelope_store:${error.message}`);
  // Verify round-trip authority (one retry — storage read-after-write).
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: verify, error: vErr } = await sb.storage
      .from(APP_INTRO_STORAGE_BUCKET)
      .download(path);
    if (vErr || !verify) {
      if (attempt === 0) continue;
      throw new Error(`startup_envelope_verify:${vErr?.message ?? "missing"}`);
    }
    const parsed = JSON.parse(await verify.text()) as {
      integrity?: string;
      schemaVersion?: number;
    };
    if (parsed.schemaVersion === 14 && parsed.integrity === envelope.integrity) {
      return path;
    }
    if (attempt === 0) continue;
    throw new Error("startup_envelope_verify_mismatch");
  }
  throw new Error("startup_envelope_verify_mismatch");
}

export async function applyIntroServiceFromDraft(
  sb: SupabaseClient,
  args: {
    documentId: string;
    userId: string;
    /**
     * Optional client correlation id only.
     * Release identity is always logicalApplyIntentKey(documentId, draftVersion).
     */
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
  const idempotencyKey = logicalApplyIntentKey(args.documentId, draftVersion);
  const clientCorrelationKey = args.idempotencyKey?.trim() || null;

  // Ownership trail for DEFECT 010 — actor + draft → live phases (no silent Live mutate).
  console.info(
    JSON.stringify({
      event: "intro_apply_service_begin",
      documentId: args.documentId,
      draftVersion,
      userId: args.userId,
      idempotencyKey,
      clientCorrelationKey,
      at: new Date().toISOString(),
    }),
  );

  // Order: saved Draft → canonical validation (inside publish) → Release → Package → Live.
  const published = await publishIntroDocument(sb, {
    documentId: args.documentId,
    userId: args.userId,
    idempotencyKey,
  });

  // Durable same-intent short-circuit:
  // publish ops are keyed by logicalApplyIntentKey; if package already has a
  // sealed StartupPackageEnvelope, never re-seal a divergent process envelope.
  const storedEnvelope = await readStoredStartupEnvelope(sb, published.packageId);
  const liveBefore = await getLiveStatus(sb);
  const alreadyLiveSameRelease =
    liveBefore.kind === "LIVE" && liveBefore.releaseId === published.releaseId;

  if (storedEnvelope && alreadyLiveSameRelease) {
    console.info(
      JSON.stringify({
        event: "intro_apply_service_committed",
        documentId: args.documentId,
        draftVersion,
        userId: args.userId,
        releaseId: published.releaseId,
        packageId: published.packageId,
        packageIntegrity: published.packageIntegrity,
        startupGenerationId: storedEnvelope.generationId,
        startupEnvelopeIntegrity: storedEnvelope.integrity,
        startupEnvelopePath: startupEnvelopeStoragePath(published.packageId),
        idempotentReplay: true,
        durableReplay: true,
        at: new Date().toISOString(),
      }),
    );
    return {
      documentId: args.documentId,
      draftVersion,
      releaseId: published.releaseId,
      packageId: published.packageId,
      packageIntegrity: published.packageIntegrity,
      live: liveBefore,
      startupEnvelopeIntegrity: storedEnvelope.integrity,
      startupGenerationId: storedEnvelope.generationId,
      idempotentReplay: true,
      phases: {
        draftValidated: true,
        releaseCreated: true,
        packageVerified: true,
        liveApplied: true,
        startupEnvelopeSealed: true,
        startupEnvelopeStored: true,
      },
    };
  }

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

  // Publish replay with envelope already stored: promote Live only, reuse envelope.
  if (storedEnvelope) {
    console.info(
      JSON.stringify({
        event: "intro_apply_service_committed",
        documentId: args.documentId,
        draftVersion,
        userId: args.userId,
        releaseId: published.releaseId,
        packageId: published.packageId,
        packageIntegrity: published.packageIntegrity,
        startupGenerationId: storedEnvelope.generationId,
        startupEnvelopeIntegrity: storedEnvelope.integrity,
        startupEnvelopePath: startupEnvelopeStoragePath(published.packageId),
        idempotentReplay: true,
        durableReplay: true,
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
      startupEnvelopeIntegrity: storedEnvelope.integrity,
      startupGenerationId: storedEnvelope.generationId,
      idempotentReplay: true,
      phases: {
        draftValidated: true,
        releaseCreated: true,
        packageVerified: true,
        liveApplied: true,
        startupEnvelopeSealed: true,
        startupEnvelopeStored: true,
      },
    };
  }

  // First seal for this package: process envelope + durable storage write.
  const ss = await getSystemStartConfig(sb);
  const mediaManifest = await loadMediaManifestFromPack(
    sb,
    published.packageId,
    published.storagePath,
  );
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
      mediaManifest,
    },
  );
  if (!envelopeApply.ok) {
    throw new Error(`startup_envelope_apply_failed:${envelopeApply.reason}`);
  }

  const envelopePath = await persistStartupEnvelope(
    sb,
    published.packageId,
    envelopeApply.envelope,
  );

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
      startupEnvelopePath: envelopePath,
      idempotentReplay: Boolean(envelopeApply.idempotentReplay),
      durableReplay: false,
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
    idempotentReplay: Boolean(envelopeApply.idempotentReplay),
    phases: {
      draftValidated: true,
      releaseCreated: true,
      packageVerified: true,
      liveApplied: true,
      startupEnvelopeSealed: true,
      startupEnvelopeStored: true,
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
