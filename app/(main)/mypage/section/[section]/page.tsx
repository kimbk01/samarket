import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MyRouteSkeleton } from "@/components/mypage/ds/MyStateView";
import { MyInfoIaCategoryScreen } from "@/components/mypage/myinfo/MyInfoIaCategoryScreen";
import { findMypageIaCategory } from "@/lib/mypage/mypage-ia";
import { findMypageMobileSection } from "@/lib/mypage/mypage-mobile-nav-registry";
import { loadMypageOwnerStoreGateSeedServer } from "@/lib/my/load-mypage-owner-store-gate-seed";
import { loadMypageAdminMenuSeedServer } from "@/lib/my/load-mypage-admin-menu-seed";

export default function MypageSectionListPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return (
    /** 분류 화면 = 카드 행 목록 — 같은 구조 스켈레톤(피드 스켈레톤 금지) */
    <Suspense fallback={<MyRouteSkeleton template="list" listVariant="text" rows={5} />}>
      <MypageSectionListPageBody params={params} />
    </Suspense>
  );
}

/**
 * L1 분류 화면 (`lib/mypage/mypage-ia.ts`). 분류에 없는 옛 섹션(메신저 등)은 내정보 홈으로.
 * 매장 행·관리자 행이 첫 그림에 맞게 나오도록 홈과 같은 소형 시드만 서버에서 읽는다.
 */
async function MypageSectionListPageBody({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: raw } = await params;
  const category = findMypageIaCategory(raw);
  if (!category) {
    if (findMypageMobileSection(raw)) redirect("/mypage");
    notFound();
  }
  const [ownerStoreGateSeed, adminMenuSeed] = await Promise.all([
    category.id === "store" ? loadMypageOwnerStoreGateSeedServer() : Promise.resolve(null),
    category.id === "settings" ? loadMypageAdminMenuSeedServer() : Promise.resolve(null),
  ]);
  return (
    <MyInfoIaCategoryScreen
      category={category}
      ownerStoreGateSeed={ownerStoreGateSeed}
      adminMenuSeed={adminMenuSeed}
    />
  );
}
