"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayDialog } from "@/components/ui/dibay-overlay/DibayDialog";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";
import { buildMemberSupportContext, type SupportContext } from "@/lib/support/support-context";
import { buildLoginHref } from "@/lib/auth/client-access-flow";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import {
  DELIVERY_LAUNCH_WIDE_MIN_CONTENT_PX,
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

/** 배달 본문 폭 기준 와이드 판정 (태블릿·폴더블·폰 가로·PC·Windows) */
function useWideLayout(ref: React.RefObject<HTMLElement | null>): boolean {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setWide(el.getBoundingClientRect().width >= DELIVERY_LAUNCH_WIDE_MIN_CONTENT_PX);
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return wide;
}

function BannerImage({ src, wide }: { src: string; wide: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div
      className={`relative w-full overflow-hidden bg-sam-primary ${wide ? "h-full min-h-[180px]" : "aspect-[4/3]"}`}
      data-delivery-recruiting-image={wide ? "wide" : "mobile"}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- 어드민 업로드 원본 URL(외부 버킷), 비율 칸이 자리를 먼저 잡는다
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          decoding="async"
          fetchPriority="high"
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
}

export function DeliveryRecruitingHero({ state }: { state: DeliveryLaunchPublicState }) {
  const { t, language } = useI18n();
  const router = useRouter();
  const openInquiry = useOpenPartnershipInquiry();
  const rootRef = useRef<HTMLElement | null>(null);
  const wide = useWideLayout(rootRef);
  const texts = resolveDeliveryLaunchTexts(state.content, language);
  const imageSrc = wide ? state.content.wideImageUrl || state.content.mobileImageUrl : state.content.mobileImageUrl;
  const badge = texts.badge;
  const title = texts.title || t("delivery_recruiting_default_title");
  const applyLabel = texts.applyLabel || t("delivery_recruiting_apply");
  const inquiryLabel = texts.inquiryLabel || t("delivery_recruiting_inquiry");

  const textBlock = (
    <div className={`flex flex-col gap-2 ${wide ? "justify-center p-5" : "px-4 pb-4 pt-3"}`}>
      {badge ? (
        <span className="w-fit rounded-full bg-[var(--dibay-gold)] px-2.5 py-0.5 text-[12px] font-bold text-sam-primary">
          {badge}
        </span>
      ) : null}
      <h2 className="text-[20px] font-extrabold leading-snug [text-wrap:balance]">{title}</h2>
      {texts.body ? <p className="text-[13px] leading-relaxed opacity-90">{texts.body}</p> : null}
      {texts.schedule ? (
        <p className="rounded-ui-rect bg-white/10 px-2.5 py-1.5 text-[12px] font-medium">{texts.schedule}</p>
      ) : null}
      <div className="mt-1 grid grid-cols-[1.4fr_1fr] gap-2">
        <button
          type="button"
          onClick={() => router.push(DELIVERY_STORE_APPLY_PATH)}
          className="rounded-ui-rect bg-white px-3 py-2.5 text-[14px] font-extrabold text-sam-primary active:opacity-80"
          data-delivery-recruiting-cta="apply"
        >
          {applyLabel}
        </button>
        <button
          type="button"
          onClick={openInquiry}
          className="rounded-ui-rect border border-white/60 px-3 py-2.5 text-[14px] font-bold text-white active:opacity-80"
          data-delivery-recruiting-cta="inquiry"
        >
          {inquiryLabel}
        </button>
      </div>
    </div>
  );

  return (
    <section
      ref={rootRef}
      className="overflow-hidden rounded-ui-rect bg-sam-primary text-white"
      data-delivery-recruiting-hero={wide ? "wide" : "mobile"}
      aria-label={title}
    >
      {wide ? (
        <div className="grid grid-cols-[1.15fr_1fr]">
          <BannerImage src={imageSrc} wide />
          {textBlock}
        </div>
      ) : (
        <>
          <BannerImage src={imageSrc} wide={false} />
          {textBlock}
        </>
      )}
    </section>
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
