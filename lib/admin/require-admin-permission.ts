import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getCurrentProfile } from "@/lib/auth/server-guards";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import {
  hasActiveAdminMembershipOrLegacyRole,
  loadActiveAdminMembership,
  resolveEffectiveAdminRole,
} from "@/lib/admin/admin-membership";
import type { ProfileRow } from "@/lib/profile/types";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  isSuperAdminRole,
  loadEffectiveStaffPermissions,
  permissionKeyAllowed,
} from "@/lib/admin/admin-user-server";

export type AdminApiActor = {
  userId: string;
  profile: ProfileRow;
  role: string;
  permissions: AdminPermissionKey[];
  isSuperAdmin: boolean;
};

function createServiceClient(): SupabaseClient | null {
  const env = requireSupabaseEnv({ requireServiceKey: true });
  if (!env.ok) return null;
  return createClient(env.url, env.serviceKey, { auth: { persistSession: false } });
}

export async function requireAdminApiActor(): Promise<
  { ok: true; actor: AdminApiActor; sb: SupabaseClient } | { ok: false; response: NextResponse }
> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin;

  const profile = await getCurrentProfile(admin.userId);
  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }

  const sb = createServiceClient();
  if (!sb) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "service_role_missing" }, { status: 500 }),
    };
  }

  // Application authority: active admin_memberships ONLY
  const privileged = await hasActiveAdminMembershipOrLegacyRole(sb, admin.userId).catch(() => false);
  if (!privileged) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }

  const membership = await loadActiveAdminMembership(sb, admin.userId).catch(() => null);
  const effectiveRole = await resolveEffectiveAdminRole(sb, admin.userId).catch(() => null);
  if (!effectiveRole || !isPrivilegedAdminRole(effectiveRole)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }
  const isSuperAdmin = isSuperAdminRole(effectiveRole);
  const adminTier =
    membership?.admin_tier ?? (profile as { admin_tier?: string | null }).admin_tier ?? null;
  const permissions = await loadEffectiveStaffPermissions(
    sb,
    admin.userId,
    effectiveRole,
    adminTier
  ).catch(() => [] as AdminPermissionKey[]);

  return {
    ok: true,
    actor: {
      userId: admin.userId,
      profile,
      role: effectiveRole,
      permissions,
      isSuperAdmin,
    },
    sb,
  };
}

export async function requireAdminPermission(
  key: AdminPermissionKey
): Promise<
  | { ok: true; actor: AdminApiActor; sb: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const base = await requireAdminApiActor();
  if (!base.ok) return base;

  if (base.actor.isSuperAdmin) return base;

  const { actor } = base;
  const allowed = permissionKeyAllowed(actor.permissions, key);
  if (!allowed) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden_permission", permission: key }, { status: 403 }),
    };
  }
  return base;
}

export async function requireSuperAdmin(): Promise<
  | { ok: true; actor: AdminApiActor; sb: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const base = await requireAdminApiActor();
  if (!base.ok) return base;
  if (!base.actor.isSuperAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "super_admin_only" }, { status: 403 }),
    };
  }
  return base;
}
