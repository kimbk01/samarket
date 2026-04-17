import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { findMypageMobileSection } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageSectionMenuClient } from "@/components/mypage/MyPageSectionMenuClient";

export default function MypageSectionListPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <MypageSectionListPageBody params={params} />
    </Suspense>
  );
}

async function MypageSectionListPageBody({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: raw } = await params;
  const section = findMypageMobileSection(raw);
  if (!section) notFound();

  return <MyPageSectionMenuClient section={section} />;
}
