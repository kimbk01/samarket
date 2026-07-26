import { redirectLegacyOwnerPage } from "@/lib/business/redirect-legacy-owner-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy Owner URL — redirect-only. Canonical: /stores/owner/* */
export default async function LegacyOwnerRedirectPage({ searchParams }: PageProps) {
  return redirectLegacyOwnerPage("/my/business/products", searchParams);
}
