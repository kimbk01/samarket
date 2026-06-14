import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";
import { MYPAGE_PROFILE_EDIT_HREF } from "@/lib/mypage/mypage-mobile-nav-registry";

function safeNext(input: string | string[] | undefined): string | null {
  const raw = Array.isArray(input) ? input[0] : input;
  return sanitizeNextPath(typeof raw === "string" ? raw : null);
}

/** 레거시 주소 온보딩 — 내정보 프로필 편집(주소 강조)으로 위임 */
export default async function OnboardingAddressPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const next = safeNext(params.next);
  const qs = new URLSearchParams({ required: "address" });
  if (next) qs.set("next", next);
  redirect(`${MYPAGE_PROFILE_EDIT_HREF}?${qs.toString()}`);
}
