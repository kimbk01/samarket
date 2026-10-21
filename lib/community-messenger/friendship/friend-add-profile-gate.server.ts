/**
 * F-6 — 친구 추가 공통 게이트 (가입 완료 + 프로필 필수 항목). 서버 전용.
 * 친구 추가 경로(`POST /friend-requests` 호환 · `POST /relations/friend`)는 반드시 이 함수 하나를 거친다.
 */
import { NextResponse } from "next/server";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export async function gateMessengerFriendAddProfile(userId: string) {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 }),
    };
  }
  const termsGate = await requireSignupCompleteForUser(sb, userId);
  if (!termsGate.ok) return termsGate;
  return requireProfileFieldsForAction(sb, userId, "messenger_add_friend");
}
