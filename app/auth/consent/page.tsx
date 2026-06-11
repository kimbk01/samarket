import { redirect } from "next/navigation";

function safeNextQuery(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const next = typeof raw === "string" ? raw.trim() : "";
  if (next.startsWith("/") && !next.startsWith("//")) {
    return `?next=${encodeURIComponent(next)}`;
  }
  return "";
}

export default async function AuthConsentLegacyRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  redirect(`/auth/onboarding/terms${safeNextQuery(params.next)}`);
}
