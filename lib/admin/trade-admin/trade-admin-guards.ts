/**
 * 거래 Admin API 서버 게이트 (설계 v2 §G-5 · Owner O-2). 클라이언트에서 import 금지.
 *
 * O-2: 모든 활성 관리자는 거래 Admin 의 모든 업무(게시물·신고·제재·채팅·회원·홍보·포인트·충전·정책)에
 * 같은 권한을 가진다 — super_admin / operator 차이 없음, 세부 권한 키 검사 없음.
 * 유지하는 것: 로그인 · 활성 관리자 멤버십(requireAdminApiActor) · 정지된 관리자 계정 차단 · 감사 기록.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApiActor, type AdminApiActor } from "@/lib/admin/require-admin-permission";
import { isSuspendedMemberAccount } from "@/lib/auth/member-account-state";

export type TradeAdminGate =
  | { ok: true; userId: string; actor: AdminApiActor; sb: SupabaseClient }
  | { ok: false; response: NextResponse };

export async function requireTradeAdmin(): Promise<TradeAdminGate> {
  const base = await requireAdminApiActor();
  if (!base.ok) return base;
  if (!base.actor.isSuperAdmin && isSuspendedMemberAccount(base.actor.profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "forbidden_permission", reason: "admin_account_suspended" },
        { status: 403 }
      ),
    };
  }
  return { ...base, userId: base.actor.userId };
}
