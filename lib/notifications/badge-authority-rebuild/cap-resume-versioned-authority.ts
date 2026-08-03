/**
 * Gate 3 Step 11 — Cap resume / prefs paint gate (pure).
 *
 * Policy A (chosen): versionless Cap prefs NEVER final-commit App Icon.
 * Resume NEVER re-applies Cap prefs as authority.
 *
 * Final App Icon publish path:
 *   resolveMemberAppIconAuthority → authorityVersion → commit → Native absolute echo
 *
 * Cap `capacitor.badge` is echo cache only — not authority.
 */

import {
  parseMemberAppIconAuthorityVersion,
  publishMemberAppIconAuthority,
  type MemberAppIconAuthority,
  type PublishAppIconResult,
} from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";

export const CAP_RESUME_VERSIONED_AUTHORITY = "cap_resume_versioned_authority_v1" as const;

export type AppIconLifecycle = "cold" | "warm" | "resume";

export type CapBadgeCachePaintRejectReason =
  | "VERSION_REQUIRED"
  | "RESUME_FORBIDDEN"
  | "MEMBER_KEY_REQUIRED"
  | "CANONICAL_ALREADY_COMMITTED"
  | "WARM_FORBIDDEN"
  | "VERSIONLESS_FORBIDDEN"
  | "TEMPORARY_PAINT_NOT_FINAL";

export type CapBadgeCachePaintDecision =
  | { allow: false; reason: CapBadgeCachePaintRejectReason; role: "none" }
  | { allow: true; role: "temporary_paint_only" };

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Approach A — Cap prefs cannot final-publish.
 * Resume / warm: always reject.
 * Cold temporary paint: only if versioned + memberKey + no canonical commit yet.
 * Versionless: always reject (never silently accepted).
 */
export function evaluateCapBadgeCacheForAppIcon(input: {
  authorityVersion?: string | null;
  memberKey?: string | null;
  lifecycle: AppIconLifecycle;
  canonicalCommitted: boolean;
}): CapBadgeCachePaintDecision {
  if (input.lifecycle === "resume") {
    return { allow: false, reason: "RESUME_FORBIDDEN", role: "none" };
  }
  if (input.lifecycle === "warm") {
    return { allow: false, reason: "WARM_FORBIDDEN", role: "none" };
  }
  if (input.canonicalCommitted) {
    return { allow: false, reason: "CANONICAL_ALREADY_COMMITTED", role: "none" };
  }
  const version = trim(input.authorityVersion);
  if (!version) {
    return { allow: false, reason: "VERSION_REQUIRED", role: "none" };
  }
  if (!parseMemberAppIconAuthorityVersion(version)) {
    return { allow: false, reason: "VERSIONLESS_FORBIDDEN", role: "none" };
  }
  const memberKey = trim(input.memberKey);
  if (!memberKey.startsWith("user:")) {
    return { allow: false, reason: "MEMBER_KEY_REQUIRED", role: "none" };
  }
  // Cold + versioned: temporary OS paint only — still not a final authority commit.
  return { allow: true, role: "temporary_paint_only" };
}

/** Final commit requires parseable ai1|rev|… version — never versionless. */
export function assertVersionedAppIconFinalCommit(
  authorityVersion: string | null | undefined
): { ok: true } | { ok: false; reason: "VERSION_REQUIRED" } {
  const v = trim(authorityVersion);
  if (!v || !parseMemberAppIconAuthorityVersion(v)) {
    return { ok: false, reason: "VERSION_REQUIRED" };
  }
  return { ok: true };
}

/**
 * Cap cache snapshot attempting to overwrite committed canonical — always gated.
 * Versionless / resume-shaped inputs cannot replace newer canonical.
 */
export function attemptAppIconFinalCommitFromCapCache(input: {
  cachedTotal: number;
  authorityVersion?: string | null;
  memberKey?: string | null;
  lifecycle: AppIconLifecycle;
  current: MemberAppIconAuthority | null;
}): PublishAppIconResult | { ok: false; reason: CapBadgeCachePaintRejectReason } {
  const decision = evaluateCapBadgeCacheForAppIcon({
    authorityVersion: input.authorityVersion,
    memberKey: input.memberKey,
    lifecycle: input.lifecycle,
    canonicalCommitted: input.current != null,
  });
  if (!decision.allow) {
    return { ok: false, reason: decision.reason };
  }
  // temporary_paint_only is never a final commit into authority store.
  void input.cachedTotal;
  return { ok: false, reason: "TEMPORARY_PAINT_NOT_FINAL" };
}

/**
 * After canonical commit, Cap prefs re-paint must not win over newer snapshot.
 */
export function capCacheCannotOverwriteCanonical(input: {
  cached: MemberAppIconAuthority | null;
  canonical: MemberAppIconAuthority;
}): PublishAppIconResult {
  const versionGate = assertVersionedAppIconFinalCommit(input.canonical.authorityVersion);
  if (!versionGate.ok) return { ok: false, reason: "PARTIAL_SNAPSHOT" };
  return publishMemberAppIconAuthority(input.canonical, input.cached);
}

/** Resume / warm final path: rebuild+commit only — Cap prefs ignored. */
export function resumeAppIconFinalSource(): "canonical_builder_only" {
  return "canonical_builder_only";
}

export function coldAppIconFinalSource(): "canonical_builder_only" {
  return "canonical_builder_only";
}

export function warmAppIconFinalSource(): "canonical_builder_only" {
  return "canonical_builder_only";
}
