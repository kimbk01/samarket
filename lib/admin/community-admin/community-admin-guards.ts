/**
 * 커뮤니티 Admin API 서버 게이트 (설계 v2 §E-1). 클라이언트에서 import 금지.
 * 반환 형태는 기존 `requireAdminApiUser` 와 호환되도록 `userId` 를 함께 준다.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireAdminApiActor,
  requireSuperAdmin,
  type AdminApiActor,
} from "@/lib/admin/require-admin-permission";
import { isSuspendedMemberAccount } from "@/lib/auth/member-account-state";
import {
  COMMUNITY_ADMIN_AREA_PERMISSIONS,
  communityAreaAllowed,
  type CommunityAdminArea,
} from "@/lib/admin/community-admin/community-admin-permissions";

export type CommunityAdminGate =
  | { ok: true; userId: string; actor: AdminApiActor; sb: SupabaseClient }
  | { ok: false; response: NextResponse };

export async function requireCommunityAdmin(area: CommunityAdminArea): Promise<CommunityAdminGate> {
  const base = await requireAdminApiActor();
  if (!base.ok) return base;
  if (!communityAreaAllowed(base.actor.permissions, area, base.actor.isSuperAdmin)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "forbidden_permission",
          permission: COMMUNITY_ADMIN_AREA_PERMISSIONS[area].join("|"),
          area,
        },
        { status: 403 }
      ),
    };
  }
  // Owner 결정 (홍보 권한): 정지된 운영자는 홍보 조치를 할 수 없다.
  // 차단·탈퇴는 로그인 단계에서, 권한 회수(비활성 멤버십)는 관리자 확인 단계에서 이미 막힌다.
  if (area === "promotion" && !base.actor.isSuperAdmin && isSuspendedMemberAccount(base.actor.profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "forbidden_permission", permission: "ads", area, reason: "admin_account_suspended" },
        { status: 403 }
      ),
    };
  }
  return { ...base, userId: base.actor.userId };
}

/** 영구 삭제 등 최고 관리자 전용 */
export async function requireCommunitySuperAdmin(): Promise<CommunityAdminGate> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  return { ...gate, userId: gate.actor.userId };
}
