import { Suspense } from "react";
import { OnboardingUsernameClient } from "@/components/onboarding/OnboardingUsernameClient";

/**
 * @username(불변) 설정 단계의 강제 화면.
 * - 페이지는 얇게 유지하고, 실제 저장/중복확인은 클라이언트에서 API로 수행한다.
 */
export default function OnboardingUsernamePage() {
  return (
    <Suspense fallback={null}>
      <OnboardingUsernameClient />
    </Suspense>
  );
}

