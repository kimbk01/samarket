/**
 * Client copy of the server's required consent versions (B11).
 *
 * Authority stays on the server (`resolveRequiredConsentVersions`, CMS published ko). The client
 * receives it from the root layout (`RequiredConsentVersionsBootstrap`) and from every
 * `/api/me/signup-status` response, so client gates judge consent with the same versions the
 * server enforces — never with STORE_* constants after an Admin publish.
 *
 * `null` = not known yet → callers fall back to existing STORE_* behavior and the server decides.
 */

export type ClientRequiredConsentVersions = {
  termsVersion: string;
  privacyVersion: string;
};

let current: ClientRequiredConsentVersions | null = null;
const listeners = new Set<(next: ClientRequiredConsentVersions, prev: ClientRequiredConsentVersions | null) => void>();

function normalize(input: unknown): ClientRequiredConsentVersions | null {
  if (!input || typeof input !== "object") return null;
  const v = input as { termsVersion?: unknown; privacyVersion?: unknown };
  const termsVersion = typeof v.termsVersion === "string" ? v.termsVersion.trim() : "";
  const privacyVersion = typeof v.privacyVersion === "string" ? v.privacyVersion.trim() : "";
  if (!termsVersion || !privacyVersion) return null;
  return { termsVersion, privacyVersion };
}

export function getClientRequiredConsentVersions(): ClientRequiredConsentVersions | null {
  return current;
}

/** Returns true when the versions changed (an Admin publish became visible to this client). */
export function setClientRequiredConsentVersions(input: unknown): boolean {
  const next = normalize(input);
  if (!next) return false;
  const prev = current;
  if (prev && prev.termsVersion === next.termsVersion && prev.privacyVersion === next.privacyVersion) {
    return false;
  }
  current = next;
  if (prev) {
    for (const l of listeners) l(next, prev);
  }
  return Boolean(prev);
}

export function subscribeClientRequiredConsentVersions(
  listener: (next: ClientRequiredConsentVersions, prev: ClientRequiredConsentVersions | null) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper */
export function resetClientRequiredConsentVersionsForTests(): void {
  current = null;
  listeners.clear();
}
