import { redirect } from "next/navigation";
import { REGISTRATION_DONE_DEFAULT_PATH, resolveRegistrationReturnPath } from "@/lib/auth/dibay-registration-steps";

/** 돌아갈 화면 — 가입 흐름 단일 판정(외부 이동 거부) · 전체 감사 A3 */
function safeNextQuery(input: string | string[] | undefined): string {
  const next = resolveRegistrationReturnPath(input);
  return next === REGISTRATION_DONE_DEFAULT_PATH ? "" : `?next=${encodeURIComponent(next)}`;
}

export default async function AuthConsentLegacyRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  redirect(`/auth/onboarding/terms${safeNextQuery(params.next)}`);
}
