import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";

export type SignupCompleteGateResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/**
 * mutation API — DIBAY 약관·개인정보 동의 미완 시 403.
 * @id·프로필·주소는 기능별 profile-requirements gate.
 */
export async function requireSignupCompleteForUser(
  sb: SupabaseClient,
  userId: string
): Promise<SignupCompleteGateResult> {
  const status = await getOnboardingStatus(sb, userId);
  if (status.signupComplete) {
    return { ok: true };
  }
  return {
    ok: false,
    response: NextResponse.json(
      {
        ok: false,
        error: "signup_incomplete",
        code: "signup_incomplete",
        onboardingStatus: status.onboardingStatus,
      },
      { status: 403 }
    ),
  };
}
