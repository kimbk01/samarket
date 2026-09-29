import type { SupabaseClient } from "@supabase/supabase-js";
import { publishIntroDocument } from "@/lib/intro/publish/service";
import { getIntroDocument } from "@/lib/intro/document/service";
import { getLiveStatus, setLiveRelease, type LiveStatus } from "@/lib/intro/live/service";

/**
 * Owner atomic action: 서비스 적용.
 * Internal: validate saved Draft → immutable Release → Package → Live pointer.
 * Owner must NEVER need a separate Publish step.
 */
export type ApplyServiceResult = {
  documentId: string;
  draftVersion: number;
  releaseId: string;
  packageId: string;
  packageIntegrity: string;
  live: LiveStatus;
  phases: {
    draftValidated: true;
    releaseCreated: true;
    packageVerified: true;
    liveApplied: true;
  };
};

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

  const draftVersion = row.draft_version;
  const idempotencyKey =
    args.idempotencyKey?.trim() ||
    `apply_${args.documentId}_${draftVersion}_${Date.now()}`;

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

  return {
    documentId: args.documentId,
    draftVersion,
    releaseId: published.releaseId,
    packageId: published.packageId,
    packageIntegrity: published.packageIntegrity,
    live,
    phases: {
      draftValidated: true,
      releaseCreated: true,
      packageVerified: true,
      liveApplied: true,
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
