import { redirect } from "next/navigation";
import { getOnboardingStatus } from "@/lib/auth/get-onboarding-status";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import {
  isRegistrationStepPath,
  registrationStepHref,
  type DibayRegistrationStep,
} from "@/lib/auth/dibay-registration-steps";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

/**
 * 단계 화면 `next` — 내부 경로만. 로그인 직후 목적지는 `resolvePostLoginRoute` 가 이미 fresh-landing 검증을 했고,
 * 행동 게이트(같은 세션)에서 온 `next` 는 원래 화면(채팅방 등)으로 돌아가야 하므로 여기서는 내부 경로 검증만 한다.
 * 가입 단계 화면 자신은 `next` 로 받지 않는다(순환 방지).
 */
export function registrationStepNext(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const safe = sanitizeNextPath(typeof raw === "string" ? raw : null);
  if (!safe || isRegistrationStepPath(safe) || safe.startsWith("/auth/") || safe.startsWith("/login")) {
    return POST_LOGIN_PATH;
  }
  return safe;
}

/**
 * 가입 단계 화면(전화·주소) 진입 — 들어올 때마다 단계를 다시 계산해 자기 단계가 아니면 맞는 곳으로 보낸다
 * (뒤로가기·주소 흐름 복귀·다른 기기에서 완료). 비로그인 → 로그인. 판정 = `getOnboardingStatus` (DB 함수 1회).
 */
export async function enforceRegistrationStepPage(
  expected: Exclude<DibayRegistrationStep, "terms">,
  next: string,
): Promise<void> {
  const routeSb = await createSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = routeSb ? await routeSb.auth.getUser() : { data: { user: null } };
  if (!user?.id) {
    redirect("/login");
  }
  const readSb = tryCreateSupabaseServiceClient() ?? routeSb;
  if (!readSb) return;
  const status = await getOnboardingStatus(readSb, user.id);
  const step = status.registrationNextStep;
  if (step === expected) return;
  if (step === null) {
    redirect(next);
  }
  redirect(registrationStepHref(step, next) ?? next);
}
