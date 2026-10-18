"use client";

import { setClientRequiredConsentVersions } from "@/lib/legal/client-required-consent";

/**
 * Hands the server-required consent versions (CMS published ko) to client gates on every
 * document load, before any gate effect runs (B11). Render-time set is idempotent.
 */
export function RequiredConsentVersionsBootstrap({
  versions,
}: {
  versions: { termsVersion: string; privacyVersion: string } | null;
}): null {
  if (versions) setClientRequiredConsentVersions(versions);
  return null;
}
