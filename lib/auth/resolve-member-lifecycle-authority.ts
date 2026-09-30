/**
 * Authoritative member lifecycle for login-deny / product-write.
 *
 * P0-R3: null is never a security semantic.
 * Discriminated result — callers must branch on `kind`.
 *
 * Uses lifecycle cache with mandatory invalidation on moderation —
 * not light-session identity snap.
 */

import {
  peekMemberLifecycleAuthority,
  setMemberLifecycleAuthority,
} from "@/lib/auth/member-lifecycle-authority-cache";
import {
  MEMBER_ACCOUNT_STATE_UNAVAILABLE,
  resolveMemberAccountLifecycle,
  type MemberAccountLifecycle,
  type MemberAccountProfileLike,
} from "@/lib/auth/member-account-state";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export type MemberLifecycleAuthorityUnavailableReason =
  | "empty_user_id"
  | "no_client"
  | "query_error"
  | "malformed_row";

/**
 * RESOLVED — profile row read; lifecycle classified (may be "unknown").
 * PROFILE_NOT_FOUND — authenticated id has no profiles row.
 * AUTHORITY_UNAVAILABLE — client/query/malformed failure (not ACTIVE).
 */
export type MemberLifecycleAuthorityResult =
  | {
      kind: "RESOLVED";
      profile: MemberAccountProfileLike;
      lifecycle: MemberAccountLifecycle;
      source: "cache" | "db";
    }
  | { kind: "PROFILE_NOT_FOUND" }
  | {
      kind: "AUTHORITY_UNAVAILABLE";
      reason: MemberLifecycleAuthorityUnavailableReason;
    };

export { MEMBER_ACCOUNT_STATE_UNAVAILABLE };

export function isMemberLifecycleAuthorityUsable(
  result: MemberLifecycleAuthorityResult
): result is Extract<MemberLifecycleAuthorityResult, { kind: "RESOLVED" }> {
  return result.kind === "RESOLVED";
}

/** True when PRODUCT_WRITE must DENY without evaluating ACTIVE/SUSPENDED/… */
export function isMemberLifecycleAuthorityFailClosed(
  result: MemberLifecycleAuthorityResult
): boolean {
  if (result.kind === "PROFILE_NOT_FOUND" || result.kind === "AUTHORITY_UNAVAILABLE") {
    return true;
  }
  // RESOLVED but unclassifiable status — not ACTIVE.
  return result.lifecycle === "unknown";
}

export type ResolveMemberLifecycleAuthorityOptions = {
  /**
   * PRODUCT_WRITE enforcement must not trust process-local lifecycle cache.
   * Moderation invalidation runs on the admin isolate only — other isolates may
   * still hold a stale ACTIVE row for up to TTL after block/suspend.
   */
  bypassCache?: boolean;
};

export async function resolveMemberLifecycleAuthority(
  userId: string,
  options?: ResolveMemberLifecycleAuthorityOptions
): Promise<MemberLifecycleAuthorityResult> {
  const uid = userId.trim();
  if (!uid) {
    return { kind: "AUTHORITY_UNAVAILABLE", reason: "empty_user_id" };
  }

  if (!options?.bypassCache) {
    const cached = peekMemberLifecycleAuthority(uid);
    if (cached.hit) {
      const lifecycle = resolveMemberAccountLifecycle(cached.profile);
      return {
        kind: "RESOLVED",
        profile: cached.profile,
        lifecycle,
        source: "cache",
      };
    }
  }

  const sb = tryCreateSupabaseServiceClient() ?? (await createSupabaseRouteHandlerClient());
  if (!sb) {
    return { kind: "AUTHORITY_UNAVAILABLE", reason: "no_client" };
  }

  type ProfileLifecycleRow = {
    status?: string | null;
    deleted_at?: string | null;
  };

  let row: ProfileLifecycleRow | null = null;
  let error: { message?: string } | null = null;
  try {
    const res = await sb
      .from("profiles")
      .select("status, deleted_at")
      .eq("id", uid)
      .maybeSingle();
    row = (res.data as ProfileLifecycleRow | null) ?? null;
    error = res.error;
  } catch {
    return { kind: "AUTHORITY_UNAVAILABLE", reason: "query_error" };
  }

  if (error) {
    return { kind: "AUTHORITY_UNAVAILABLE", reason: "query_error" };
  }
  if (!row) {
    return { kind: "PROFILE_NOT_FOUND" };
  }

  const profile: MemberAccountProfileLike = {
    status: row.status ?? null,
    deleted_at: row.deleted_at ?? null,
  };
  const lifecycle = resolveMemberAccountLifecycle(profile);
  setMemberLifecycleAuthority(uid, profile);
  return {
    kind: "RESOLVED",
    profile,
    lifecycle,
    source: "db",
  };
}
