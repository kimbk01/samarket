/**
 * DIBAY INTRO — Phase 1 / C-R1 / Phase 3
 * GIF runtime format contract + B2 processing path names.
 * Phase 3 executable processor: lib/intro/media/processor/gif-b2.ts
 * (sharp animated decode/composite → omggif.GifWriter).
 */

export const GifRuntimeFormat = {
  CANONICAL_ANIMATED_GIF: "CANONICAL_ANIMATED_GIF",
} as const;
export type GifRuntimeFormat =
  (typeof GifRuntimeFormat)[keyof typeof GifRuntimeFormat];

export const GifRuntimeAuthority = {
  MODEL_B_CANONICAL_ANIMATED_GIF_BYTES:
    "MODEL_B_CANONICAL_ANIMATED_GIF_BYTES",
} as const;
export type GifRuntimeAuthority =
  (typeof GifRuntimeAuthority)[keyof typeof GifRuntimeAuthority];

/** Selected B2 processing path semantics (contract names — not executable). */
export const GifProcessingPath = {
  /** sharp animated page decode/composite → omggif.GifWriter encode */
  B2_SHARP_PAGES_OMGGIF_ENCODE: "B2_SHARP_PAGES_OMGGIF_ENCODE",
} as const;
export type GifProcessingPath =
  (typeof GifProcessingPath)[keyof typeof GifProcessingPath];

/** Proven failed path — must not be reintroduced as fallback. */
export const GifForbiddenPath = {
  SHARP_CGIF_ENCODE: "SHARP_CGIF_ENCODE",
} as const;

export const GifFixtureClass = {
  MULTI_FRAME: "multi-frame",
  ALPHA: "alpha",
  LOOP: "loop",
  VARIED_DELAY: "varied-delay",
  DISPOSAL_SENSITIVE: "disposal-sensitive",
} as const;
export type GifFixtureClass =
  (typeof GifFixtureClass)[keyof typeof GifFixtureClass];

/** Fixture 05 remains mandatory for disposal-sensitive conformance. */
export const GIF_MANDATORY_DISPOSAL_FIXTURE_ID = "05" as const;

export type GifRuntimeContract = {
  runtimeFormat: typeof GifRuntimeFormat.CANONICAL_ANIMATED_GIF;
  authority: typeof GifRuntimeAuthority.MODEL_B_CANONICAL_ANIMATED_GIF_BYTES;
  processingPath: typeof GifProcessingPath.B2_SHARP_PAGES_OMGGIF_ENCODE;
  forbiddenPaths: readonly (typeof GifForbiddenPath.SHARP_CGIF_ENCODE)[];
  mandatoryFixtureClasses: readonly GifFixtureClass[];
  mandatoryDisposalFixtureId: typeof GIF_MANDATORY_DISPOSAL_FIXTURE_ID;
  /** Phase 1 must never claim processor PASS. */
  processorPassClaimed: false;
};

export const GIF_RUNTIME_CONTRACT: GifRuntimeContract = {
  runtimeFormat: GifRuntimeFormat.CANONICAL_ANIMATED_GIF,
  authority: GifRuntimeAuthority.MODEL_B_CANONICAL_ANIMATED_GIF_BYTES,
  processingPath: GifProcessingPath.B2_SHARP_PAGES_OMGGIF_ENCODE,
  forbiddenPaths: [GifForbiddenPath.SHARP_CGIF_ENCODE],
  mandatoryFixtureClasses: [
    GifFixtureClass.MULTI_FRAME,
    GifFixtureClass.ALPHA,
    GifFixtureClass.LOOP,
    GifFixtureClass.VARIED_DELAY,
    GifFixtureClass.DISPOSAL_SENSITIVE,
  ],
  mandatoryDisposalFixtureId: GIF_MANDATORY_DISPOSAL_FIXTURE_ID,
  processorPassClaimed: false,
};
