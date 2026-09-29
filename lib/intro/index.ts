/**
 * DIBAY INTRO — Phase 1 public surface.
 * Contracts + pure utilities + fixtures only.
 */

export * from "./contracts";
export * from "./geometry/responsive-mapping";
export * from "./timeline/compute-duration";
export * from "./handoff/decision";
export * from "./validation/issues";
export {
  parseIntroDocument,
  validateDraft,
  validatePublish,
  validatePackManifest,
  validateDeviceCompatibility,
  evaluateDeviceCompatibility,
  type PublishMediaLookup,
} from "./validation/core";
export {
  CANONICAL_INTRO_FIXTURE_DOCUMENT,
  GIF_FIXTURE_METADATA,
  GEOMETRY_FIXTURES,
  TABLET_NO_OVERRIDE_EXPECTED,
  FIXTURE_TRANSITION_TYPES,
} from "./fixtures/canonical-document";
