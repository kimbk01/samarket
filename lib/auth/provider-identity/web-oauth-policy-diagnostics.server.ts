import { createHash, randomBytes } from "node:crypto";

/** Web OAuth provider policy conflict classification — no PII. */
export const WEB_OAUTH_CONFLICT_REASONS = [
  "SAME_PROVIDER_SUBJECT_DIFFERENT_USER",
  "SAME_EMAIL_DIFFERENT_PROVIDER",
  "EXISTING_PROVIDER_IDENTITY_ALREADY_LINKED",
  "AUTH_USER_WITHOUT_PROFILE",
  "PROFILE_WITHOUT_AUTH_USER",
  "PENDING_CONFLICT_STASH",
  "EMAIL_UNVERIFIED_OR_MISSING",
  "POLICY_DATA_INCONSISTENT",
  "UNKNOWN",
] as const;

export type WebOAuthConflictReason = (typeof WEB_OAUTH_CONFLICT_REASONS)[number];

export type WebOAuthPolicyDiag = {
  callbackAttemptId: string;
  provider: string | null;
  policyResult: "allow" | "reject";
  conflictReason: WebOAuthConflictReason | null;
  incomingProviderSubjectHashPrefix: string | null;
  incomingEmailPresent: boolean;
  incomingEmailVerified: boolean;
  existingAuthUserFound: boolean;
  existingProfileFound: boolean;
  existingProviderIdentityFound: boolean;
  sameProviderSubjectMatch: boolean;
  sameNormalizedEmailMatch: boolean;
  conflictingProviderTypes: string[];
  pendingConflictRecordFound: boolean;
  orphanAuthUserDetected: boolean;
  orphanProfileDetected: boolean;
  autoLinkAllowed: false;
  rejectionBranch: string | null;
  /** Session user id hash prefix only (auth.users after exchange). */
  sessionUserIdHashPrefix: string | null;
  /** Matched identity/profile owner hash prefix when different from session. */
  matchedUserIdHashPrefix: string | null;
  resolveStatus: string | null;
};

export function newWebOAuthCallbackAttemptId(): string {
  return `woc-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

/** Stable short fingerprint — never log raw subject/email/userId. */
export function hashPrefixForAuthDiag(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  return createHash("sha256").update(trimmed).digest("hex").slice(0, 8);
}

export function logWebOAuthProviderPolicyDiag(diag: WebOAuthPolicyDiag): void {
  console.info("[auth/web-oauth-policy]", JSON.stringify(diag));
}
