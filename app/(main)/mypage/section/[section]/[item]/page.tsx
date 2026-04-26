import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { findMypageMobileItem } from "@/lib/mypage/mypage-mobile-nav-registry";
import { loadMypageServer } from "@/lib/my/load-mypage-server";
import { MyPageItemRouteClient } from "@/components/mypage/MyPageItemRouteClient";

export const dynamic = "force-dynamic";

export default function MypageSectionItemPage({
  params,
}: {
  params: Promise<{ section: string; item: string }>;
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={5} />}>
      <MypageSectionItemPageBody params={params} />
    </Suspense>
  );
}

async function MypageSectionItemPageBody({
  params,
}: {
  params: Promise<{ section: string; item: string }>;
}) {
  const { section: s, item: i } = await params;
  const meta = findMypageMobileItem(s, i);
  if (!meta) notFound();

  const initialMyPageData = await loadMypageServer();

  return (
    <MyPageItemRouteClient initialMyPageData={initialMyPageData} section={s} item={i} itemLabel={meta.label} />
  );
}
