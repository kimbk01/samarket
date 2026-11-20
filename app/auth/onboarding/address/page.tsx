import { RegistrationAddressStep } from "@/components/auth/RegistrationAddressStep";
import { enforceRegistrationStepPage, registrationStepNext } from "@/lib/auth/registration-step-page.server";

/** 가입 단계 3 — 대표 주소 등록 (동의 → 전화 → 주소). 기존 주소 등록 흐름을 그대로 쓴다. */
export default async function AuthOnboardingAddressPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const next = registrationStepNext(params.next);
  await enforceRegistrationStepPage("address", next);
  return (
    <div className="min-h-screen bg-sam-app">
      <RegistrationAddressStep next={next} />
    </div>
  );
}
