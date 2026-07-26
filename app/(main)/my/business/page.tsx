import { redirectLegacyOwnerPage } from "@/lib/business/redirect-legacy-owner-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy Owner hub — redirect-only. Canonical: /stores/owner */
export default async function LegacyOwnerHubRedirectPage({ searchParams }: PageProps) {
  return redirectLegacyOwnerPage("/my/business", searchParams);
}
