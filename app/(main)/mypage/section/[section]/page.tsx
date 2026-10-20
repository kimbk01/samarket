import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MyRouteSkeleton } from "@/components/mypage/ds/MyStateView";
import { findMypageMobileSection } from "@/lib/mypage/mypage-mobile-nav-registry";
import { MyPageSectionMenuClient } from "@/components/mypage/MyPageSectionMenuClient";

export default function MypageSectionListPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return (
    /** 섹션 메뉴 = 카드 행 목록 — 같은 구조 스켈레톤(피드 스켈레톤 금지) */
    <Suspense fallback={<MyRouteSkeleton template="list" listVariant="text" rows={5} />}>
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
