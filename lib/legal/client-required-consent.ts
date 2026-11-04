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
  /** Still-valid consent versions after a 「notice」 revision (server list). Absent = current only. */
  acceptedTermsVersions?: readonly string[];
  acceptedPrivacyVersions?: readonly string[];
};

/** Server → client / API payload — versions and accepted lists only (no `source`). */
export function requiredConsentForClient(v: ClientRequiredConsentVersions): ClientRequiredConsentVersions {
  return {
    termsVersion: v.termsVersion,
    privacyVersion: v.privacyVersion,
    ...(v.acceptedTermsVersions ? { acceptedTermsVersions: v.acceptedTermsVersions } : {}),
    ...(v.acceptedPrivacyVersions ? { acceptedPrivacyVersions: v.acceptedPrivacyVersions } : {}),
  };
}

let current: ClientRequiredConsentVersions | null = null;
const listeners = new Set<(next: ClientRequiredConsentVersions, prev: ClientRequiredConsentVersions | null) => void>();

function normalizeList(raw: unknown, currentVersion: string): readonly string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  return list.includes(currentVersion) ? list : undefined;
}

function normalize(input: unknown): ClientRequiredConsentVersions | null {
  if (!input || typeof input !== "object") return null;
  const v = input as {
    termsVersion?: unknown;
    privacyVersion?: unknown;
    acceptedTermsVersions?: unknown;
    acceptedPrivacyVersions?: unknown;
  };
  const termsVersion = typeof v.termsVersion === "string" ? v.termsVersion.trim() : "";
  const privacyVersion = typeof v.privacyVersion === "string" ? v.privacyVersion.trim() : "";
  if (!termsVersion || !privacyVersion) return null;
  const acceptedTermsVersions = normalizeList(v.acceptedTermsVersions, termsVersion);
  const acceptedPrivacyVersions = normalizeList(v.acceptedPrivacyVersions, privacyVersion);
  return {
    termsVersion,
    privacyVersion,
    ...(acceptedTermsVersions ? { acceptedTermsVersions } : {}),
    ...(acceptedPrivacyVersions ? { acceptedPrivacyVersions } : {}),
  };
}

function sameVersions(a: ClientRequiredConsentVersions, b: ClientRequiredConsentVersions): boolean {
  return (
    a.termsVersion === b.termsVersion &&
    a.privacyVersion === b.privacyVersion &&
    (a.acceptedTermsVersions ?? []).join("\n") === (b.acceptedTermsVersions ?? []).join("\n") &&
    (a.acceptedPrivacyVersions ?? []).join("\n") === (b.acceptedPrivacyVersions ?? []).join("\n")
  );
}

export function getClientRequiredConsentVersions(): ClientRequiredConsentVersions | null {
  return current;
}

/** Returns true when the versions changed (an Admin publish became visible to this client). */
export function setClientRequiredConsentVersions(input: unknown): boolean {
  const next = normalize(input);
  if (!next) return false;
  const prev = current;
  if (prev && sameVersions(prev, next)) {
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
