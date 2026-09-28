import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpeningRevisionPayload, OpeningRuntimeManifest } from "@/lib/opening-show/runtime-contract";
import { OPENING_RUNTIME_SCENE_DURATION_MS } from "@/lib/opening-show/runtime-contract";
import { parseOpeningDocument } from "@/lib/opening-show/document";

function isPayload(raw: unknown): raw is OpeningRevisionPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.documentVersion !== "number") return false;
  if (!Array.isArray(rec.scenes) || !Array.isArray(rec.assets)) return false;
  if (typeof rec.checksum !== "string" || !rec.checksum) return false;
  return true;
}

export async function loadOpeningRuntimeManifest(
  sb: SupabaseClient
): Promise<
  | { ok: true; live: false }
  | { ok: true; live: true; manifest: OpeningRuntimeManifest }
  | { ok: false; error: string }
> {
  const { data: liveShow, error: liveError } = await sb
    .from("opening_shows")
    .select("id, live_revision_id")
    .not("live_revision_id", "is", null)
    .maybeSingle();
  if (liveError) return { ok: false, error: liveError.message };
  if (!liveShow?.live_revision_id) return { ok: true, live: false };

  const { data: revision, error: revError } = await sb
    .from("opening_revisions")
    .select("id, revision_number, payload")
    .eq("id", liveShow.live_revision_id)
    .maybeSingle();
  if (revError) return { ok: false, error: revError.message };
  if (!revision) return { ok: true, live: false };
  if (!isPayload(revision.payload)) return { ok: false, error: "invalid_payload" };

  const parsed = parseOpeningDocument({
    version: revision.payload.documentVersion,
    scenes: revision.payload.scenes,
  });
  if (!parsed) return { ok: false, error: "invalid_payload" };

  const assets = revision.payload.assets.map((asset) => ({
    mediaId: asset.mediaId,
    url: asset.url,
    sha256: asset.sha256,
    bytes: asset.bytes,
    mime: "image/webp" as const,
  }));

  return {
    ok: true,
    live: true,
    manifest: {
      revisionId: revision.id,
      revisionNumber: revision.revision_number,
      documentVersion: parsed.version,
      sceneDurationMs: revision.payload.sceneDurationMs || OPENING_RUNTIME_SCENE_DURATION_MS,
      checksum: revision.payload.checksum,
      scenes: parsed.scenes,
      assets,
    },
  };
}
