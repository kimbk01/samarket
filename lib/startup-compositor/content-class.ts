/**
 * REBUILD 14 — content class for StartupPackageEnvelope.
 * Semantic authority only (no runtime host).
 */

export const STARTUP_CONTENT_CLASSES = [
  "OWNER",
  "SYSTEM_BOOTSTRAP",
  "QA",
] as const;

export type StartupContentClass = (typeof STARTUP_CONTENT_CLASSES)[number];

export function isStartupContentClass(
  raw: unknown,
): raw is StartupContentClass {
  return (
    typeof raw === "string" &&
    (STARTUP_CONTENT_CLASSES as readonly string[]).includes(raw)
  );
}

/** Service Apply / Live product generation may only be OWNER. */
export function canBecomeActiveProductGeneration(
  contentClass: StartupContentClass,
): boolean {
  return contentClass === "OWNER";
}

/**
 * Bootstrap may be cold-active only before Owner authority is established.
 * After Owner established, bootstrap reactivation is forbidden (policy in generation-authority).
 */
export function canBootstrapBeColdActive(args: {
  ownerAuthorityEverEstablished: boolean;
}): boolean {
  return !args.ownerAuthorityEverEstablished;
}
