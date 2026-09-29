/**
 * DIBAY INTRO — Phase 1
 * Pure deterministic timeline calculation.
 *
 * TOTAL = Σ scene.durationMs + Σ inter-scene transitionAfter.durationMs
 * Outgoing scene owns transition via transitionAfter.
 * Last scene.transitionAfter must be null (duration contribution 0).
 */

import type { IntroDocumentV1, TransitionV1 } from "../contracts/document";

export const CANONICAL_TIMELINE_8100_PARTS = [
  2500, 300, 3000, 300, 2000,
] as const;
export const CANONICAL_TIMELINE_8100_MS = 8100 as const;

export function transitionDurationMs(
  transition: TransitionV1 | null | undefined,
): number {
  if (transition == null) return 0;
  return transition.durationMs;
}

/**
 * computeIntroDurationMs — locked Gate B TOTAL derivation.
 */
export function computeIntroDurationMs(document: IntroDocumentV1): number {
  const scenes = document.scenes;
  if (scenes.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i]!;
    total += scene.durationMs;
    if (i < scenes.length - 1) {
      total += transitionDurationMs(scene.transitionAfter);
    }
  }
  return total;
}

export function assertCanonical8100(document: IntroDocumentV1): void {
  const actual = computeIntroDurationMs(document);
  if (actual !== CANONICAL_TIMELINE_8100_MS) {
    throw new Error(
      `TIMELINE_DIVERGENCE: expected ${CANONICAL_TIMELINE_8100_MS}ms, got ${actual}ms`,
    );
  }
}
