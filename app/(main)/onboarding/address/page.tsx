import { Suspense } from "react";
import { OnboardingAddressClient } from "@/components/onboarding/OnboardingAddressClient";

export default function OnboardingAddressPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingAddressClient />
    </Suspense>
  );
}
