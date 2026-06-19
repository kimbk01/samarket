import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { findMypageMobileItem } from "@/lib/mypage/mypage-mobile-nav-registry";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import { loadMypageServer } from "@/lib/my/load-mypage-server";
import { MyPageItemRouteClient } from "@/components/mypage/MyPageItemRouteClient";

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
  const hubRedirect = resolveMypageSectionLegacyHubRedirect(s, i);
  if (hubRedirect) {
    redirect(hubRedirect);
  }
  if (s === "store" && i === "manage") {
    redirect("/stores/owner/apply");
  }
  const meta = findMypageMobileItem(s, i);
  if (!meta) notFound();

  const initialMyPageData = await loadMypageServer();

  return (
    <MyPageItemRouteClient
      initialMyPageData={initialMyPageData}
      section={s}
      item={i}
      itemLabelKey={meta.labelKey}
    />
  );
}
