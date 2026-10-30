import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseEnv } from "@/lib/env/runtime";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { isPrivilegedAdminRole, normalizeAdminRole } from "@/lib/auth/admin-policy";
import { isSuspendedMemberAccount } from "@/lib/auth/member-account-state";
import type { ProfileRow } from "@/lib/profile/types";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  isAdminStaffPermissionsSchemaError,
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

  // 같은 요청에서 requireAdminApiUser 가 읽은 profile·membership 을 그대로 쓴다 (재조회 없음).
  const { profile, membership } = admin;

  const sb = createServiceClient();
  if (!sb) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "service_role_missing" }, { status: 500 }),
    };
  }

  // Application authority: active admin_memberships ONLY (requireAdmin 이 같은 판정식으로 통과시킨 행)
  const effectiveRole = normalizeAdminRole(membership.role);
  if (!effectiveRole || !isPrivilegedAdminRole(effectiveRole)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }
  const isSuperAdmin = isSuperAdminRole(effectiveRole);
  // AD-07 (Owner 결정 §5.4): 정지(suspended) 운영자는 모든 관리자 API 차단 — 최고관리자는 잠김 방지를 위해 제외.
  // 판정은 거래 가드(`requireTradeAdmin`)와 같은 `isSuspendedMemberAccount(profile)`.
  if (!isSuperAdmin && isSuspendedMemberAccount(profile)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "admin_actor_suspended" }, { status: 403 }),
    };
  }
  // R6-A2: tier authority = admin_memberships.admin_tier only (no profile-column fallback).
  // NULL tier → loadEffectiveStaffPermissions / adminTierToUiRole canonical default (operator).
  const adminTier = membership?.admin_tier ?? null;

  let permissions: AdminPermissionKey[];
  try {
    permissions = await loadEffectiveStaffPermissions(
      sb,
      admin.userId,
      effectiveRole,
      adminTier
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // v4 W1 API-12: 내부 오류 원문(detail)은 서버 로그만 — 응답은 고정 코드.
    console.error("[requireAdminApiActor] staff permissions load failed", detail);
    // SCHEMA ERROR ≠ valid empty — do not absorb into [] / tier-default.
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: isAdminStaffPermissionsSchemaError(detail)
            ? "admin_permissions_schema_error"
            : "admin_permissions_load_failed",
        },
        { status: 500 }
      ),
    };
  }

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
