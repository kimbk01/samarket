/**
 * DIBAY INTRO — V2 device compatibility gate (no silent downgrade).
 */

import {
  INTRO_FONT_SPEC_VERSION,
  INTRO_PACK_SCHEMA_VERSION,
  INTRO_PACK_SUPPORTED_ACTIONS,
  INTRO_PACK_SUPPORTED_MEDIA_RUNTIME_FORMATS,
  INTRO_PACK_SUPPORTED_TRANSITIONS,
  INTRO_PROTOCOL_VERSION,
  INTRO_RENDER_SPEC_VERSION,
  type DeviceCompatibilityDecision,
  type IntroPackV1,
} from "@/lib/intro/contracts/pack";

export const DEVICE_SUPPORTED = {
  schemaVersions: [INTRO_PACK_SCHEMA_VERSION] as const,
  protocolVersions: [INTRO_PROTOCOL_VERSION] as const,
  renderSpecVersions: [INTRO_RENDER_SPEC_VERSION] as const,
  fontSpecVersions: [INTRO_FONT_SPEC_VERSION] as const,
  mediaRuntimeFormats: [...INTRO_PACK_SUPPORTED_MEDIA_RUNTIME_FORMATS] as const,
  transitions: [...INTRO_PACK_SUPPORTED_TRANSITIONS] as const,
  actions: [...INTRO_PACK_SUPPORTED_ACTIONS] as const,
};

export function evaluatePackCompatibility(
  pack: IntroPackV1,
): DeviceCompatibilityDecision {
  if (!DEVICE_SUPPORTED.schemaVersions.includes(pack.schemaVersion as 1)) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_SCHEMA",
      detail: String(pack.schemaVersion),
    };
  }
  if (!DEVICE_SUPPORTED.protocolVersions.includes(pack.protocolVersion as 1)) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_PROTOCOL",
      detail: String(pack.protocolVersion),
    };
  }
  if (
    !DEVICE_SUPPORTED.renderSpecVersions.includes(pack.renderSpecVersion as 1)
  ) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_RENDER",
      detail: String(pack.renderSpecVersion),
    };
  }
  if (!DEVICE_SUPPORTED.fontSpecVersions.includes(pack.fontSpecVersion as 1)) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_FONT",
      detail: String(pack.fontSpecVersion),
    };
  }

  for (const t of pack.compatibility.supportedTransitions) {
    if (!(DEVICE_SUPPORTED.transitions as readonly string[]).includes(t)) {
      return {
        ok: false,
        activate: "REJECT",
        reason: "UNKNOWN_TRANSITION",
        detail: t,
      };
    }
  }
  for (const a of pack.compatibility.supportedActions) {
    if (!(DEVICE_SUPPORTED.actions as readonly string[]).includes(a)) {
      return {
        ok: false,
        activate: "REJECT",
        reason: "UNKNOWN_ACTION",
        detail: a,
      };
    }
  }
  for (const f of pack.compatibility.supportedMediaRuntimeFormats) {
    if (!(DEVICE_SUPPORTED.mediaRuntimeFormats as readonly string[]).includes(f)) {
      return {
        ok: false,
        activate: "REJECT",
        reason: "UNKNOWN_MEDIA_RUNTIME_FORMAT",
        detail: f,
      };
    }
  }

  // GIF structural recognition required even if Scene does not use GIF yet.
  if (
    !(DEVICE_SUPPORTED.mediaRuntimeFormats as readonly string[]).includes(
      "CANONICAL_ANIMATED_GIF",
    )
  ) {
    return {
      ok: false,
      activate: "REJECT",
      reason: "UNKNOWN_MEDIA_RUNTIME_FORMAT",
      detail: "CANONICAL_ANIMATED_GIF",
    };
  }

  return { ok: true, activate: "CANDIDATE_ALLOWED" };
}
