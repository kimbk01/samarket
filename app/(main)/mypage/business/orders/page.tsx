import { redirectLegacyOwnerPage } from "@/lib/business/redirect-legacy-owner-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Legacy Owner URL — redirect-only (쿼리 전체 보존). Canonical: /stores/owner/orders */
export default async function MypageBusinessOrdersPage({ searchParams }: PageProps) {
  return redirectLegacyOwnerPage("/mypage/business/orders", searchParams);
}
