import { redirect } from "next/navigation";
import { buildProfileSetupHref } from "@/lib/auth/profile-setup-flow";
import { sanitizeNextPath } from "@/lib/auth/safe-next-path";

function safeNext(input: string | string[] | undefined): string | null {
  const raw = Array.isArray(input) ? input[0] : input;
  return sanitizeNextPath(typeof raw === "string" ? raw : null);
}

export default async function OnboardingAddressPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  redirect(buildProfileSetupHref({ next: safeNext(params.next) }));
}
