"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { buildMemberSupportContext, type SupportContext } from "@/lib/support/support-context";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { DeliveryRecruitingHeroLayout } from "@/components/delivery/launch/DeliveryRecruitingHeroLayout";
import {
  manilaTodayYmd,
  resolveDeliveryLaunchTexts,
  type DeliveryLaunchPublicState,
} from "@/lib/delivery/launch/delivery-launch-contract";

/**
 * 배달 매장 모집 — 큰 배너 + 모집 팝업 + 고객센터 FAB(입점 문의) (Owner 2026-11-10 · 설계 v2 §4-2·4-3).
 * mode 가 recruiting 일 때만 StoresHomeHub 가 그린다 → 정식 운영으로 바꾸면 셋 다 함께 사라진다.
 */

export const DELIVERY_STORE_APPLY_PATH = "/stores/owner/apply";
/** 비로그인 「문의하기」 → 로그인 후 배달 화면으로 돌아와 입점 문의 창을 이어서 연다 */
export const DELIVERY_RECRUITING_INQUIRY_QUERY = "recruitInquiry";
const POPUP_DISMISS_KEY = "dibay:delivery-recruiting-popup:dismissed-ymd";

const PARTNERSHIP_SUPPORT_CONTEXT: SupportContext = buildMemberSupportContext({
  enabled: true,
  category: "STORE_PARTNERSHIP",
  sourceSurface: "delivery_recruiting",
});

function readPopupDismissedToday(): boolean {
  try {
    return window.localStorage.getItem(POPUP_DISMISS_KEY) === manilaTodayYmd();
  } catch {
    return false;
  }
}

function writePopupDismissedToday(): void {
  try {
    window.localStorage.setItem(POPUP_DISMISS_KEY, manilaTodayYmd());
  } catch {
    /* 저장 불가 기기 — 이번 화면에서만 닫힘 */
  }
}

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
 * 모집 팝업 + 고객센터 FAB. 팝업이 떠 있는 동안 FAB 는 끈다(겹침 방지).
 * 비로그인이 로그인하고 돌아오면(`?recruitInquiry=1`) 입점 문의 창을 이어서 연다.
 */
export function DeliveryRecruitingOverlays({ state }: { state: DeliveryLaunchPublicState }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const membership = useClientMembershipState("delivery-recruiting");
  const openInquiry = useOpenPartnershipInquiry();
  const [popupOpen, setPopupOpen] = useState(false);
  const texts = resolveDeliveryLaunchTexts(state.content, language);

  useEffect(() => {
    if (!state.popupEnabled) return;
    if (readPopupDismissedToday()) return;
    setPopupOpen(true);
  }, [state.popupEnabled]);

  useEffect(() => {
    if (membership.status !== "member") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(DELIVERY_RECRUITING_INQUIRY_QUERY) !== "1") return;
    url.searchParams.delete(DELIVERY_RECRUITING_INQUIRY_QUERY);
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
    setPopupOpen(false);
    navigateToSupportCenter(PARTNERSHIP_SUPPORT_CONTEXT);
  }, [membership.status, router]);

  const fabOn = state.fabEnabled && !popupOpen;
  const title = texts.popupTitle || texts.title || t("delivery_recruiting_default_title");

  return (
    <>
      <SupportContextProvider value={{ ...PARTNERSHIP_SUPPORT_CONTEXT, enabled: fabOn }}>{null}</SupportContextProvider>
      <DibayDialog
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        title={title}
        description={texts.popupBody || texts.body || undefined}
        actionsLayout="row"
        actions={[
          {
            key: "inquiry",
            label: texts.inquiryLabel || t("delivery_recruiting_inquiry"),
            roleTone: "secondary",
            onClick: () => {
              setPopupOpen(false);
              openInquiry();
            },
          },
          {
            key: "apply",
            label: texts.applyLabel || t("delivery_recruiting_apply"),
            roleTone: "primary",
            onClick: () => {
              setPopupOpen(false);
              router.push(DELIVERY_STORE_APPLY_PATH);
            },
          },
        ]}
        footer={
          <div className="flex justify-between px-1 text-[12px] text-sam-muted">
            <button
              type="button"
              className="py-1"
              onClick={() => {
                writePopupDismissedToday();
                setPopupOpen(false);
              }}
            >
              {t("delivery_recruiting_popup_hide_today")}
            </button>
            <button type="button" className="py-1" onClick={() => setPopupOpen(false)}>
              {t("common_close")}
            </button>
          </div>
        }
      >
        {state.content.popupImageUrl ? (
          <div className="mt-3 aspect-[36/25] w-full overflow-hidden rounded-ui-rect bg-sam-primary">
            {/* eslint-disable-next-line @next/next/no-img-element -- 어드민 업로드 원본 URL */}
            <img src={state.content.popupImageUrl} alt="" className="h-full w-full object-cover" decoding="async" />
          </div>
        ) : null}
      </DibayDialog>
    </>
  );
}
