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
  return { ...base, userId: base.actor.userId };
}

/** 영구 삭제 등 최고 관리자 전용 */
export async function requireCommunitySuperAdmin(): Promise<CommunityAdminGate> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate;
  return { ...gate, userId: gate.actor.userId };
}
