import { redirectLegacyOwnerPage } from "@/lib/business/redirect-legacy-owner-page";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** 옛 매장 운영 허브 URL — 캐노니컬 `/stores/owner` (쿼리 전체 보존). */
export default async function MypageBusinessRoute({ searchParams }: PageProps) {
  return redirectLegacyOwnerPage("/mypage/business", searchParams);
}
