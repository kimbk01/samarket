/**
 * R14-P6 — logical Apply intent identity.
 *
 * Same saved Draft version = same Apply intent.
 * Client Date.now() / hub unique keys MUST NOT create additional Releases.
 * Intentional re-Apply after draft edit uses a new draftVersion → new intent.
 */

export function logicalApplyIntentKey(
  documentId: string,
  draftVersion: number,
): string {
  return `apply_${documentId}_v${draftVersion}`;
}

/** Canonical stored StartupPackageEnvelope path under a published pack id. */
export function startupEnvelopeStoragePath(packageId: string): string {
  return `authority/v1/packs/${packageId}/startup-envelope.json`;
}

/** Legacy Intro-shaped pack.json — asset seal / transitional retrieval only. */
export function legacyIntroPackStoragePath(packageId: string): string {
  return `authority/v1/packs/${packageId}/pack.json`;
}
