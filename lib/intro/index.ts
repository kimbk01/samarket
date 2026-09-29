/**
 * DIBAY INTRO — public surface.
 * Phase 1: contracts + pure utilities + fixtures.
 * Phase 2: additive DB/storage/security authority constants (no processor).
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
export * from "./db/authority";
export * from "./db/alignment";
