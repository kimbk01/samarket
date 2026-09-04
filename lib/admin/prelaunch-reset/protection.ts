/**
 * CUT H — protection rules (role/type based, not single hardcoded UUID).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrelaunchResetEntityRef } from "@/lib/admin/prelaunch-reset/types";
import { MANUAL_MEMBER_EMAIL_SUFFIX } from "@/lib/auth/manual-member-email";

export async function loadProtectedAdminUserIds(
  sb: SupabaseClient,
  currentAdminUserId: string
): Promise<{ protectedIds: Set<string>; refs: PrelaunchResetEntityRef[] }> {
  const protectedIds = new Set<string>([currentAdminUserId]);
  const refs: PrelaunchResetEntityRef[] = [
    {
      kind: "protected",
      id: currentAdminUserId,
      label: "current_executing_admin",
      reason: "current_admin_excluded",
    },
  ];

  const { data: memberships } = await sb
    .from("admin_memberships")
    .select("user_id, status, admin_tier, role")
    .eq("status", "active")
    .limit(500);

  for (const row of memberships ?? []) {
    const uid = String((row as { user_id?: string }).user_id ?? "").trim();
    if (!uid) continue;
    const tier = String((row as { admin_tier?: string | null }).admin_tier ?? "").toLowerCase();
    const role = String((row as { role?: string | null }).role ?? "").toLowerCase();
    const isMaster =
      tier === "master" ||
      role === "super_admin" ||
      role === "master" ||
      role === "owner";
    if (isMaster) {
      protectedIds.add(uid);
      refs.push({
        kind: "protected",
        id: uid,
        label: "master_or_super_admin_membership",
        reason: "admin_authority_protected",
      });
    } else {
      // Any active admin membership is protected from member wipe
      protectedIds.add(uid);
      refs.push({
        kind: "protected",
        id: uid,
        label: "active_admin_membership",
        reason: "admin_membership_protected",
      });
    }
  }

  return { protectedIds, refs };
}

/** Candidate hint only — NEVER auto-select for delete without explicit IDs. */
export function isManualLocalEmailCandidate(email: string | null | undefined): boolean {
  const e = String(email ?? "").trim().toLowerCase();
  return e.endsWith(MANUAL_MEMBER_EMAIL_SUFFIX);
}

export const PRELAUNCH_PROTECTED_AUTHORITIES = {
  currentAdmin: true,
  activeAdminMemberships: true,
  masterSuperAdmin: true,
  systemConfig: true,
  homeShelvesComposition: true,
  categoryPolicy: true,
  adProductRegistry: true,
  adPlacementRegistry: true,
  auditLogs: true,
  migrations: true,
  roleDefinitions: true,
} as const;
