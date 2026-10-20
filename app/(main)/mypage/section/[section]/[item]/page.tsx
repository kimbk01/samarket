import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { MyStateSkeleton } from "@/components/mypage/ds/MyStateView";
import { findMypageMobileItem } from "@/lib/mypage/mypage-mobile-nav-registry";
import { resolveMypageSectionLegacyHubRedirect } from "@/lib/mypage/mypage-section-legacy-redirect";
import { loadMypageServerShell } from "@/lib/my/load-mypage-server";
import { isMypageItemWithoutHubWait, mypageItemScreenTemplate } from "@/lib/mypage/mypage-item-hub-wait";
import { MyPageItemRouteClient } from "@/components/mypage/MyPageItemRouteClient";

function sectionFallbackTemplate(section: string, item: string) {
  const template = mypageItemScreenTemplate(section, item);
  return template === "static" ? "list" : template;
}

/**
 * Legacy hub redirects must run outside Suspense so Next issues a real HTTP redirect
 * (App CS: settings/support → /mypage/customer-center).
 */
export default async function MypageSectionItemPage({
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

  return (
    <Suspense fallback={<MyStateSkeleton template={sectionFallbackTemplate(s, i)} rows={5} />}>
      <MypageSectionItemPageBody section={s} item={i} />
    </Suspense>
  );
}

async function MypageSectionItemPageBody({
  section: s,
  item: i,
}: {
  section: string;
  item: string;
}) {
  const meta = findMypageMobileItem(s, i);
  if (!meta) notFound();

  /**
   * 설정·정적 화면은 내정보 데이터를 기다리지 않는다(S10~S19). 그 외는 core 만(`loadMypageServerShell` —
   * 허브 extras·대시보드 개수·주소 스냅샷 대기 제거, 최종 설계 §1.7).
   */
  const initialMyPageData = isMypageItemWithoutHubWait(s, i) ? null : await loadMypageServerShell();

  return (
    <MyPageItemRouteClient
      initialMyPageData={initialMyPageData}
      section={s}
      item={i}
      itemLabelKey={meta.labelKey}
    />
  );
}
