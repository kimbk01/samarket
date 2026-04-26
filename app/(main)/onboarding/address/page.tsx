import { Suspense } from "react";
import { OnboardingAddressClient } from "@/components/onboarding/OnboardingAddressClient";

export const dynamic = "force-dynamic";

export default function OnboardingAddressPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingAddressClient />
    </Suspense>
  );
}
