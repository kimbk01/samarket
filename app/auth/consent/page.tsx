import { AuthConsentForm } from "@/components/auth/AuthConsentForm";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function safeNext(input: string | string[] | undefined): string {
  const raw = Array.isArray(input) ? input[0] : input;
  const next = typeof raw === "string" ? raw.trim() : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/mypage";
}

export default async function AuthConsentPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const next = safeNext(params.next);
  const routeSb = await createSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = routeSb ? await routeSb.auth.getUser() : { data: { user: null } };
  if (!user?.id) {
    redirect("/login");
  }
  const readSb = tryCreateSupabaseServiceClient() ?? routeSb;
  if (readSb) {
    const profile = await fetchProfileRowSafe(readSb, user.id);
    if (hasStoreTermsConsent(profile)) {
      redirect(next);
    }
  }
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <AuthConsentForm />
    </div>
  );
}
