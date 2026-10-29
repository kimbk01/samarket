"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresConsumerHeaderActions } from "@/components/stores/home/hub/StoresConsumerHeaderActions";
import { useDeliveryHomeHeaderAddress } from "@/hooks/use-delivery-home-header-address";
import { resolveDeliveryHomeHeaderButtonLabel } from "@/lib/addresses/delivery-home-header-label";
import { STORES_HOME_HEADER_ACTIONS_CLUSTER } from "@/lib/design/stores-home-header-chrome";
import { DELIVERY_STACK_SLIDE_EASING, DELIVERY_STACK_SLIDE_MS } from "@/components/route-transition/route-transition-config";
import {
  MIRROR_ADDRESS_BUTTON_CLASS,
  MIRROR_ADDRESS_ROW_CLASS,
  MIRROR_CHIP_BASE_CLASS,
  MIRROR_CHIP_OFF_CLASS,
  MIRROR_CHIP_ROW_CLASS,
  MIRROR_CHIP_SORT_CLASS,
  MIRROR_HEADER_ROW_CLASS,
  MIRROR_HEADER_SHELL_CLASS,
  MIRROR_HEADER_TITLE_CLASS,
  MIRROR_PAGE_TAB_BUTTON_BASE_CLASS,
  MIRROR_PAGE_TAB_OFF_CLASS,
  MIRROR_PAGE_TAB_ON_CLASS,
  MIRROR_PAGE_TABS_ROW_CLASS,
} from "@/lib/design/delivery-baemin-mirror";

/** 실제 페이지가 끝내 안 오면(오프라인 등) 덮개를 걷는 상한 */
const ENTER_OVERLAY_MAX_MS = 4000;

export type DeliveryMenuPageEnterSpec = {
  title: string;
  /** 3단 탭 이름들 — 「홈」 포함, 순서대로 */
  tabs: string[];
  /** 선택 탭 인덱스 */
  activeIndex: number;
  /** 픽업 상단 탭은 배달방식 칩 없음 */
  showMethodChip: boolean;
};

/**
 * 배민 미러링 — 홈 아이콘을 누른 순간 메뉴 페이지 헤더 4단(1단 제목·2단 주소·3단 탭·4단 칩) + 로딩을
 * 오른쪽→왼쪽 0.12초로 밀어 넣는다 (배민 실측: 누르자마자 헤더가 있는 화면이 들어오고 목록은 나중).
 * 실제 메뉴 페이지 경로가 그려지면(홈 판이 사라지거나 경로가 바뀌면) 그대로 걷힌다 — 서버 응답 대기 중 흰 화면 0.
 * 하단 탭(z 1200)은 덮지 않는다.
 */
export function DeliveryMenuPageEnterOverlay({ spec, onDone }: { spec: DeliveryMenuPageEnterSpec; onDone: () => void }) {
  const { t, language } = useI18n();
  const address = useDeliveryHomeHeaderAddress();
  const addressLine = resolveDeliveryHomeHeaderButtonLabel(address, language);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const timer = window.setTimeout(onDone, ENTER_OVERLAY_MAX_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [onDone]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="delivery-ui fixed inset-x-0 top-0 z-[1100] flex flex-col bg-white pt-[var(--safe-top,0px)]"
      style={{
        bottom: "calc(var(--app-bottom-nav-height, 64px) + var(--safe-bottom, 0px))",
        transform: entered ? "translate3d(0,0,0)" : "translate3d(100%,0,0)",
        transition: `transform ${DELIVERY_STACK_SLIDE_MS}ms ${DELIVERY_STACK_SLIDE_EASING}`,
      }}
      aria-busy="true"
      data-delivery-menu-enter-overlay
    >
      <header className={MIRROR_HEADER_SHELL_CLASS}>
        <div className={MIRROR_HEADER_ROW_CLASS}>
          <span className="flex h-[44px] w-[36px] items-center text-[color:#362415]" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </span>
          <h1 className={MIRROR_HEADER_TITLE_CLASS}>
            <span className="truncate">{spec.title}</span>
          </h1>
          <div className={`${STORES_HOME_HEADER_ACTIONS_CLUSTER} pointer-events-none h-full justify-self-end self-stretch`}>
            <StoresConsumerHeaderActions />
          </div>
        </div>
      </header>
      <div className={MIRROR_ADDRESS_ROW_CLASS}>
        <span className={MIRROR_ADDRESS_BUTTON_CLASS}>
          <span className="truncate">{addressLine}</span>
        </span>
      </div>
      <div className={MIRROR_PAGE_TABS_ROW_CLASS}>
        <div className="mx-auto flex w-full max-w-[768px] overflow-hidden pl-[calc(var(--delivery-page-x)-10px)]">
          {spec.tabs.map((label, i) => (
            <span
              key={`${label}-${i}`}
              className={`${MIRROR_PAGE_TAB_BUTTON_BASE_CLASS} ${i === spec.activeIndex ? MIRROR_PAGE_TAB_ON_CLASS : MIRROR_PAGE_TAB_OFF_CLASS}`}
            >
              {label}
              {i === spec.activeIndex ?
                <span aria-hidden className="absolute inset-x-[10px] bottom-0 h-[2px] bg-[#0B421A]" />
              : null}
            </span>
          ))}
        </div>
      </div>
      <div className="w-full shrink-0 border-b border-[color:#E4E6E8] bg-white">
        <div className={`${MIRROR_CHIP_ROW_CLASS} mx-auto max-w-[768px]`}>
          <span className={`${MIRROR_CHIP_BASE_CLASS} ${MIRROR_CHIP_SORT_CLASS}`}>{t("nav_store_sort_default")}</span>
          <span className={`${MIRROR_CHIP_BASE_CLASS} ${MIRROR_CHIP_OFF_CLASS}`}>{t("store_browse_filter_coupon")}</span>
          {spec.showMethodChip ?
            <span className={`${MIRROR_CHIP_BASE_CLASS} ${MIRROR_CHIP_OFF_CLASS}`}>{t("store_browse_filter_method")}</span>
          : null}
          <span className={`${MIRROR_CHIP_BASE_CLASS} ${MIRROR_CHIP_OFF_CLASS}`}>{t("store_browse_filter_rating")}</span>
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center pt-16">
        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-[#E4E6E8] border-t-[#0B421A]" aria-hidden />
      </div>
    </div>,
    document.body
  );
}
