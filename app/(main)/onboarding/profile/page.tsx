import { Suspense } from "react";
import { OnboardingProfileClient } from "@/components/onboarding/OnboardingProfileClient";

export const dynamic = "force-dynamic";

/**
 * 닉네임/필수 프로필 미완 단계의 강제 화면.
 * 초기 닉네임은 클라이언트에서 `/api/me/profile` 로 한 번 조회한다 (페이지를 가볍게 유지).
 */
export default function OnboardingProfilePage() {
  return (
    <Suspense fallback={null}>
      <OnboardingProfileClient initialNickname="" />
    </Suspense>
  );
}
