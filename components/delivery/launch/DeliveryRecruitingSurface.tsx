"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { buildMemberSupportContext, type SupportContext } from "@/lib/support/support-context";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { DeliveryRecruitingHeroLayout } from "@/components/delivery/launch/DeliveryRecruitingHeroLayout";
import type { DeliveryLaunchPublicState } from "@/lib/delivery/launch/delivery-launch-contract";

/**
 * 배달 매장 모집 — 큰 배너 + 고객센터 FAB(입점 문의) (Owner 2026-11-10).
 * mode 가 recruiting 일 때만 StoresHomeHub 가 그린다 → 정식 운영으로 바꾸면 셋 다 함께 사라진다.
 */

export const DELIVERY_STORE_APPLY_PATH = "/stores/owner/apply";
/** 비로그인 「문의하기」 → 로그인 후 배달 화면으로 돌아와 입점 문의 창을 이어서 연다 */
export const DELIVERY_RECRUITING_INQUIRY_QUERY = "recruitInquiry";

const PARTNERSHIP_SUPPORT_CONTEXT: SupportContext = buildMemberSupportContext({
  enabled: true,
  category: "STORE_PARTNERSHIP",
  sourceSurface: "delivery_recruiting",
});

/** 문의 열기 — 비로그인은 로그인 화면으로(돌아오면 이어서 열림) */
function useOpenPartnershipInquiry(): () => void {
  const router = useRouter();
  const membership = useClientMembershipState("delivery-recruiting");
  return useCallback(() => {
    if (membership.status !== "member") {
      router.push(buildLoginHref(`/stores?${DELIVERY_RECRUITING_INQUIRY_QUERY}=1`));
      return;
    }
    navigateToSupportCenter(PARTNERSHIP_SUPPORT_CONTEXT);
  }, [membership.status, router]);
}

export function DeliveryRecruitingHero({ state }: { state: DeliveryLaunchPublicState }) {
  const router = useRouter();
  const openInquiry = useOpenPartnershipInquiry();
  return (
    <DeliveryRecruitingHeroLayout
      state={state}
      renderActions={({ applyLabel, inquiryLabel, applyClassName, inquiryClassName }) => (
        <>
          <button
            type="button"
            onClick={() => router.push(DELIVERY_STORE_APPLY_PATH)}
            className={applyClassName}
            data-delivery-recruiting-cta="apply"
          >
            {applyLabel}
          </button>
          <button type="button" onClick={openInquiry} className={inquiryClassName} data-delivery-recruiting-cta="inquiry">
            {inquiryLabel}
          </button>
        </>
      )}
    />
  );
}

/** 흐린 목록 위 안내 띠 */
export function DeliveryRecruitingRibbon() {
  const { t } = useI18n();
  return (
    <div className="pointer-events-none sticky top-2 z-[2] flex justify-center py-2" data-delivery-recruiting-ribbon>
      <span className="rounded-full bg-sam-fg px-3 py-1.5 text-[12px] font-bold text-sam-surface shadow-sm">
        {t("delivery_recruiting_ribbon")}
      </span>
    </div>
  );
}

/**
 * 매장 모집 중 배달 첫 화면 — 기존 고객센터 FAB 를 켠다(누르면 기존 고객센터 팝업, 유형 「매장 입점 문의」).
 * 별도 모집 팝업은 만들지 않는다 (Owner 2026-11-10: 「FAB 고객센터는 원래 있던 것, 앱에서 팝업 형식으로 나오는 부분」).
 * 비로그인이 「문의하기」로 로그인하고 돌아오면(`?recruitInquiry=1`) 입점 문의 창을 이어서 연다.
 */
export function DeliveryRecruitingOverlays({ state }: { state: DeliveryLaunchPublicState }) {
  const router = useRouter();
  const membership = useClientMembershipState("delivery-recruiting");

  useEffect(() => {
    if (membership.status !== "member") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(DELIVERY_RECRUITING_INQUIRY_QUERY) !== "1") return;
    url.searchParams.delete(DELIVERY_RECRUITING_INQUIRY_QUERY);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
    navigateToSupportCenter(PARTNERSHIP_SUPPORT_CONTEXT);
  }, [membership.status, router]);

  return <SupportContextProvider value={{ ...PARTNERSHIP_SUPPORT_CONTEXT, enabled: state.fabEnabled }}>{null}</SupportContextProvider>;
}
