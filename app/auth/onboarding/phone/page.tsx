import { RegistrationPhoneStep } from "@/components/auth/RegistrationPhoneStep";
import { enforceRegistrationStepPage, registrationStepNext } from "@/lib/auth/registration-step-page.server";

/** 가입 단계 2 — 전화 인증 (동의 → 전화 → 주소). 기존 전화 인증 화면·API 를 그대로 쓴다. */
export default async function AuthOnboardingPhonePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const next = registrationStepNext(params.next);
  await enforceRegistrationStepPage("phone", next);
  return (
    <div className="min-h-screen bg-sam-app">
      <RegistrationPhoneStep next={next} />
    </div>
  );
}
