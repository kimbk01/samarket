/**
 * REBUILD 14 — StartupPackageEnvelope v14 (ONE envelope / ONE generation identity).
 */

import {
  isStartupContentClass,
  type StartupContentClass,
} from "@/lib/startup-compositor/content-class";
import { parseIntroEnvelope, type IntroEnvelope } from "@/lib/startup-compositor/intro-envelope";
import {
  parseSystemStartIR,
  type SystemStartIR,
} from "@/lib/startup-compositor/system-start-ir";

export const STARTUP_PACKAGE_SCHEMA_VERSION = 14 as const;

export type MediaManifestEntry = {
  readonly mediaId: string;
  readonly integrityHex: string;
};

export type StartupPackageEnvelope = {
  readonly schemaVersion: typeof STARTUP_PACKAGE_SCHEMA_VERSION;
  readonly generationId: string;
  readonly contentClass: StartupContentClass;
  readonly systemStart: SystemStartIR;
  readonly intro: IntroEnvelope;
  readonly mediaManifest: readonly MediaManifestEntry[];
  readonly capabilityVersion: number;
  readonly integrity: string;
};

export type EnvelopeValidation =
  | { readonly ok: true; readonly value: StartupPackageEnvelope }
  | { readonly ok: false; readonly reason: string };

function parseMediaManifest(raw: unknown): MediaManifestEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MediaManifestEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if (typeof o.mediaId !== "string" || !o.mediaId) return null;
    if (typeof o.integrityHex !== "string" || o.integrityHex.length !== 64) {
      return null;
    }
    out.push({
      mediaId: o.mediaId,
      integrityHex: o.integrityHex.toLowerCase(),
    });
  }
  return out;
}

/** Fail-closed structural validation of envelope v14. */
export function parseStartupPackageEnvelope(raw: unknown): EnvelopeValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "envelope_not_object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== STARTUP_PACKAGE_SCHEMA_VERSION) {
    return { ok: false, reason: "schema_version_unsupported" };
  }
  if (typeof o.generationId !== "string" || !o.generationId.trim()) {
    return { ok: false, reason: "generation_id_invalid" };
  }
  if (!isStartupContentClass(o.contentClass)) {
    return { ok: false, reason: "content_class_invalid" };
  }
  const ss = parseSystemStartIR(o.systemStart);
  if (!ss.ok) return { ok: false, reason: ss.reason };
  const intro = parseIntroEnvelope(o.intro);
  if (!intro.ok) return { ok: false, reason: intro.reason };
  const mediaManifest = parseMediaManifest(o.mediaManifest ?? []);
  if (!mediaManifest) return { ok: false, reason: "media_manifest_invalid" };
  const capabilityVersion = Number(o.capabilityVersion);
  if (!Number.isInteger(capabilityVersion) || capabilityVersion < 1) {
    return { ok: false, reason: "capability_version_invalid" };
  }
  if (typeof o.integrity !== "string" || o.integrity.length !== 64) {
    return { ok: false, reason: "integrity_invalid" };
  }

  return {
    ok: true,
    value: {
      schemaVersion: STARTUP_PACKAGE_SCHEMA_VERSION,
      generationId: o.generationId.trim(),
      contentClass: o.contentClass,
      systemStart: ss.value,
      intro: intro.value,
      mediaManifest,
      capabilityVersion,
      integrity: o.integrity.toLowerCase(),
    },
  };
}

export function envelopeWithoutIntegrityField(
  envelope: StartupPackageEnvelope,
): Omit<StartupPackageEnvelope, "integrity"> {
  const { integrity: _i, ...rest } = envelope;
  return rest;
}
