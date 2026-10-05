/**
 * Sensitive Auth mutation target protection for Member Control Center.
 * Aligns password writers with delete/moderation Super Admin protection.
 * Authority: active admin_memberships only — profiles.role is not consulted.
 *
 * Fail-closed: only a *confirmed* empty membership row may classify as general_member.
 * DB / table / permission / lookup failures deny password mutation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminMembershipRow } from "@/lib/admin/admin-membership";
import { isSuperAdminRole } from "@/lib/admin/admin-user-server";

export type MemberAuthTargetClass = "general_member" | "admin" | "super_admin";

export type MemberAuthTargetLookupError =
  | "membership_lookup_failed"
  | "membership_unavailable";

export type MemberAuthTargetClassification =
  | { ok: true; targetClass: MemberAuthTargetClass }
  | {
      ok: false;
      error: MemberAuthTargetLookupError;
      status: 503;
      detail: string;
    };

export type MemberPasswordTargetGuard =
  | { ok: true; targetClass: MemberAuthTargetClass }
  | {
      ok: false;
      error:
        | "forbidden_super_admin_target"
        | "forbidden_other_super_admin_target"
        | "forbidden_admin_target"
        | MemberAuthTargetLookupError;
      status: 403 | 503;
      targetClass?: MemberAuthTargetClass;
      detail?: string;
    };

function isMissingMembershipTable(message: string | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return m.includes("admin_memberships") && (m.includes("does not exist") || m.includes("schema cache"));
}

function isMembershipPermissionError(message: string | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return (
    m.includes("permission denied") ||
    m.includes("row-level security") ||
    m.includes("rls") ||
    m.includes("not authorized") ||
    m.includes("42501")
  );
}

/**
 * Probe active membership without collapsing infrastructure failure into "no row".
 * Confirmed null = no active membership (general member).
 */
async function probeActiveAdminMembershipForAuthTarget(
  sb: SupabaseClient,
  targetUserId: string,
): Promise<
  | { kind: "confirmed"; membership: AdminMembershipRow | null }
  | { kind: "unavailable"; detail: string }
  | { kind: "failed"; detail: string }
> {
  const uid = String(targetUserId ?? "").trim();
  if (!uid) {
    return { kind: "failed", detail: "invalid_target_user_id" };
  }

  try {
    const { data, error } = await sb
      .from("admin_memberships")
      .select(
        "id, user_id, role, status, admin_tier, granted_at, granted_by, revoked_at, revoked_by, revoke_reason, bootstrap_seed",
      )
      .eq("user_id", uid)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      const detail = String(error.message ?? "membership_query_error");
      if (isMissingMembershipTable(detail) || isMembershipPermissionError(detail)) {
        return { kind: "unavailable", detail };
      }
      return { kind: "failed", detail };
    }

    return { kind: "confirmed", membership: (data as AdminMembershipRow | null) ?? null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (isMissingMembershipTable(detail) || isMembershipPermissionError(detail)) {
      return { kind: "unavailable", detail };
    }
    return { kind: "failed", detail };
  }
}

function targetClassFromMembership(membership: AdminMembershipRow | null): MemberAuthTargetClass {
  if (isSuperAdminRole(membership?.role)) return "super_admin";
  if (membership?.role === "admin") return "admin";
  return "general_member";
}

/**
 * Classify password-target privilege.
 * Failures do not become general_member.
 */
export async function classifyMemberAuthTarget(
  sb: SupabaseClient,
  targetUserId: string,
): Promise<MemberAuthTargetClassification> {
  const probe = await probeActiveAdminMembershipForAuthTarget(sb, targetUserId);
  if (probe.kind === "unavailable") {
    return {
      ok: false,
      error: "membership_unavailable",
      status: 503,
      detail: probe.detail.slice(0, 300),
    };
  }
  if (probe.kind === "failed") {
    return {
      ok: false,
      error: "membership_lookup_failed",
      status: 503,
      detail: probe.detail.slice(0, 300),
    };
  }
  return { ok: true, targetClass: targetClassFromMembership(probe.membership) };
}

/**
 * Password / sensitive Auth credential changes:
 * - GENERAL MEMBER (confirmed no membership) → allowed (caller must already hold `users` / SA)
 * - ADMIN → Super Admin actor only
 * - SUPER ADMIN → Super Admin actor + self only (other SA protected)
 * - Membership probe failure → blocked (fail-closed)
 */
export async function assertMemberPasswordChangeAllowed(
  sb: SupabaseClient,
  input: { targetUserId: string; actorUserId: string; actorIsSuperAdmin: boolean },
): Promise<MemberPasswordTargetGuard> {
  const classified = await classifyMemberAuthTarget(sb, input.targetUserId);
  if (!classified.ok) {
    return {
      ok: false,
      error: classified.error,
      status: classified.status,
      detail: classified.detail,
    };
  }

  const { targetClass } = classified;
  if (targetClass === "super_admin") {
    if (!input.actorIsSuperAdmin) {
      return { ok: false, error: "forbidden_super_admin_target", status: 403, targetClass };
    }
    if (input.actorUserId !== input.targetUserId) {
      return { ok: false, error: "forbidden_other_super_admin_target", status: 403, targetClass };
    }
    return { ok: true, targetClass };
  }
  if (targetClass === "admin" && !input.actorIsSuperAdmin) {
    return { ok: false, error: "forbidden_admin_target", status: 403, targetClass };
  }
  return { ok: true, targetClass };
}
