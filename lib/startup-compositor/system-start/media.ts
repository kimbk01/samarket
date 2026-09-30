/**
 * REBUILD 14 P3 — System Start media resolve (active generation manifest only).
 * Renderer consumes media identity/metadata — not URLs / storage / network.
 */

import type { StartupPackageEnvelope } from "@/lib/startup-compositor/envelope";

export type ResolvedMediaRef = {
  readonly mediaId: string;
  readonly integrityHex: string;
  readonly generationId: string;
  /** width/height; required for brand, optional for background */
  readonly intrinsicAspect: number | null;
};

export type MediaAvailabilityEntry = {
  readonly integrityHex: string;
  readonly intrinsicAspect: number | null;
  /** Bytes present for this active generation (no network). */
  readonly bytesPresent: boolean;
};

export type MediaResolveResult =
  | { readonly ok: true; readonly value: ResolvedMediaRef }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolve mediaId against the envelope's own mediaManifest only.
 * Cross-generation maps / foreign ids → rejected.
 */
export function resolveActiveGenerationMedia(args: {
  readonly envelope: StartupPackageEnvelope;
  readonly mediaId: string;
  readonly availability: ReadonlyMap<string, MediaAvailabilityEntry> | Record<string, MediaAvailabilityEntry>;
}): MediaResolveResult {
  const mediaId = String(args.mediaId || "").trim();
  if (!mediaId) return { ok: false, reason: "media_id_empty" };

  const entry = args.envelope.mediaManifest.find((m) => m.mediaId === mediaId);
  if (!entry) {
    return { ok: false, reason: "media_not_in_active_generation_manifest" };
  }

  const avail: MediaAvailabilityEntry | undefined =
    args.availability instanceof Map
      ? args.availability.get(mediaId)
      : (args.availability as Record<string, MediaAvailabilityEntry>)[mediaId];

  if (!avail) {
    return { ok: false, reason: "media_availability_missing" };
  }
  if (avail.integrityHex.toLowerCase() !== entry.integrityHex.toLowerCase()) {
    return { ok: false, reason: "media_integrity_mismatch" };
  }
  if (!avail.bytesPresent) {
    return { ok: false, reason: "media_bytes_absent" };
  }

  return {
    ok: true,
    value: {
      mediaId,
      integrityHex: entry.integrityHex,
      generationId: args.envelope.generationId,
      intrinsicAspect: avail.intrinsicAspect,
    },
  };
}

/** Reject any attempt to pull media from a different generation envelope. */
export function assertSameGenerationMedia(
  envelope: StartupPackageEnvelope,
  generationId: string,
): boolean {
  return envelope.generationId === generationId;
}
