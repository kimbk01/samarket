"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ManagedMySection } from "@/lib/my/managed-my-section-ctas";
import { getManagedSectionCtas } from "@/lib/my/managed-my-section-ctas";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";
import { DetailHeader } from "@/components/layout/sector-header";
import { APP_TIER1_HEADER_BAR_CLASS } from "@/lib/layout/app-tier1-header";
import { DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS } from "@/lib/layout/delivery-locked-subpage-chrome";
import { SECTOR_HEADER_SHELL_CLASS } from "@/lib/ui/sector-header-classes";
import { useDibayDomainChromeElementProps } from "@/lib/ui/dibay-domain-chrome";
import { usePathname } from "next/navigation";
import { isMypageSubpageHeaderPath } from "@/lib/mypage/mypage-subpage-header-defaults";
import { resolveMypageIaParentHref, resolveMypageIaTitleKey } from "@/lib/mypage/mypage-ia";

export type MySubpageHeaderProps = {
  /** `registerMainTier1={false}` 일 때 생략 가능 */
  title?: ReactNode;
  /** i18n dot key — `title` 문자열보다 우선 */
  titleKey?: MessageKey;
  /** 헤더 제목 아래 한 줄 설명 */
  subtitle?: string;
  /** 있으면 부제를 탭 가능한 링크로 (예: `/regions`) */
  subtitleHref?: string;
  /** 히스토리 백 실패 시 이동 (기본 /mypage) */
  backHref?: string;
  ariaLabel?: string;
  /** false면 항상 backHref로 링크 이동 */
  preferHistoryBack?: boolean;
  rightSlot?: ReactNode;
  /** 탭·서브네비 등 — CTA 스트립 아래에 붙음 */
  stickyBelow?: ReactNode;
  /** `RegionBar` 좌측 — 기본 뒤로 대신 커스텀(예: 위치 선택 단계 백) */
  leftSlot?: ReactNode;
  /** 거래·주문·게시판·매장·계정 — 상황별 빠른 이동 칩 */
  section?: ManagedMySection;
  /** section 대신 직접 CTA (둘 다 있으면 ctaLinks 우선) */
  ctaLinks?: { href: string; label: string }[];
  /** `section="store"` 일 때 「주문 접수」 등에 넣을 매장 id */
  ownerStoreIdForCtas?: string | null;
  hideCtaStrip?: boolean;
  /**
   * 우측 기본 알림함(종) — rightSlot 과 동시 사용 시 rightSlot 우선.
   * 생략 시 내정보 하위 경로(`/mypage/*`)는 기본 종 1개 (설계서 v3 §12 · 우측 최대 1개).
   */
  showHubQuickActions?: boolean;
  /**
   * false면 `RegionBar` 등이 이미 1단을 그리므로, 여기서는 stickyBelow·ctaLinks만 MainTier1Extras에 넣음.
   */
  registerMainTier1?: boolean;
  /**
   * true — 뷰포트 잠금 플로우(cart·주소 관리)처럼 전역 1단이 없을 때 페이지 상단 shrink-0 헤더.
   * `registerMainTier1` 은 보통 false 로 함께 쓴다.
   */
  inlineChrome?: boolean;
  /**
   * 화면이 넘긴 제목을 내정보 분류(IA) 제목보다 우선 — 같은 경로가 목적에 따라 제목이 다를 때만
   * (예: `/mypage/addresses` 배달 진입 = 「배달 주소」, 주소 입력 시안 2026-11-09).
   */
  titleOverridesIa?: boolean;
};

export function MySubpageHeader({
  title,
  titleKey,
  subtitle,
  subtitleHref,
  backHref: backHrefProp,
  ariaLabel,
  preferHistoryBack = true,
  rightSlot,
  stickyBelow,
  section,
  ctaLinks,
  ownerStoreIdForCtas = null,
  hideCtaStrip = false,
  showHubQuickActions: showHubQuickActionsProp,
  registerMainTier1 = true,
  inlineChrome = false,
  leftSlot,
  titleOverridesIa = false,
}: MySubpageHeaderProps) {
  const { t, tt } = useI18n();
  const pathname = usePathname();
  const domainChrome = useDibayDomainChromeElementProps(pathname);
  const isMypageSub = isMypageSubpageHeaderPath(pathname);
  /** 내정보 하위 화면 — 알림 종은 홈에만 (분류 설계 2026-11-02). 다른 도메인은 기존 기본값 */
  const showHubQuickActions = isMypageSub ? false : (showHubQuickActionsProp ?? false);
  /**
   * 내정보 분류(IA): L2 제목 = 분류 행 이름. 뒤로(직접 진입) = IA 부모 — 화면이 내정보 홈(`/mypage`)이나
   * 기본값을 넘긴 경우만 바꾼다(고객센터 `from` 등 화면이 정한 목적지는 유지).
   */
  const iaTitleKey = isMypageSub && pathname ? resolveMypageIaTitleKey(pathname) : null;
  const iaParent = isMypageSub && pathname ? resolveMypageIaParentHref(pathname) : null;
  const backHref =
    iaParent && (backHrefProp == null || backHrefProp === "/mypage") ? iaParent : (backHrefProp ?? "/mypage");
  const tier1Provider = useMainTier1ExtrasOptional();
  const setMainTier1Extras = tier1Provider?.setMainTier1Extras ?? null;
  /** 내정보 하위 화면 뒤로 = 분류·부모 화면 — 이름은 경로 표와 같은 「이전 화면」 (분류 설계 2026-11-02) */
  const resolvedAriaLabel = tt(ariaLabel ?? (isMypageSub ? t("tier1_back") : t("common_back_to_mypage")));
  const resolvedTitle =
    titleOverridesIa && (titleKey || title != null)
      ? titleKey
        ? t(titleKey)
        : title
      : iaTitleKey
        ? t(iaTitleKey)
        : titleKey
          ? t(titleKey)
          : title;
  const translatedTitle = typeof resolvedTitle === "string" ? tt(resolvedTitle) : resolvedTitle;
  /** 내정보 하위 화면은 부제 없음 — 헤더 52px 고정 (설계서 v3 §12). 다른 도메인은 기존대로 부제 표시. */
  const translatedSubtitle = subtitle && !isMypageSubpageHeaderPath(pathname) ? tt(subtitle) : undefined;

  const stripLinks = useMemo((): { href: string; label: string }[] => {
    /** 내정보 하위 화면 — 헤더 아래 빠른 이동 칩 없음(한 화면 = 한 목적, 이동은 분류 화면에서) */
    if (hideCtaStrip || isMypageSub) return [];
    if (ctaLinks?.length) return ctaLinks;
    if (section) return getManagedSectionCtas(section, { ownerStoreId: ownerStoreIdForCtas });
    return [];
  }, [hideCtaStrip, isMypageSub, ctaLinks, section, ownerStoreIdForCtas]);

  /** 등록 경로 — `RegionBar` 가 현재 경로와 다르면 무시(이전 화면 제목 잔존 차단) */
  const registeredPathname = pathname ?? undefined;

  useLayoutEffect(() => {
    if (inlineChrome || !setMainTier1Extras) return;
    if (registerMainTier1) {
      setMainTier1Extras({
        tier1: {
          title: translatedTitle,
          subtitle: translatedSubtitle,
          subtitleHref,
          backHref,
          preferHistoryBack,
          ariaLabel: resolvedAriaLabel,
          rightSlot,
          showHubQuickActions,
          ...(leftSlot != null ? { leftSlot } : {}),
        },
        ctaLinks: stripLinks.length > 0 ? stripLinks : undefined,
        stickyBelow,
        pathname: registeredPathname,
      });
    } else {
      setMainTier1Extras({
        ctaLinks: stripLinks.length > 0 ? stripLinks : undefined,
        stickyBelow,
        pathname: registeredPathname,
      });
    }
    return () => setMainTier1Extras(null);
  }, [
    setMainTier1Extras,
    registerMainTier1,
    titleKey,
    translatedTitle,
    translatedSubtitle,
    subtitleHref,
    backHref,
    preferHistoryBack,
    resolvedAriaLabel,
    rightSlot,
    showHubQuickActions,
    leftSlot,
    stripLinks,
    stickyBelow,
    inlineChrome,
    registeredPathname,
  ]);

  if (inlineChrome || !tier1Provider) {
    const trailing = rightSlot != null ? rightSlot : showHubQuickActions ? <MyHubHeaderActions /> : null;
    const detailHeader = (
      <DetailHeader
        embedded
        title={translatedTitle}
        subtitle={translatedSubtitle}
        subtitleHref={subtitleHref}
        backHref={backHref}
        preferHistoryBack={preferHistoryBack}
        backAriaLabel={resolvedAriaLabel}
        leftSlot={leftSlot}
        showBack={leftSlot == null}
        rightSlot={trailing}
      />
    );

    if (inlineChrome) {
      return (
        <header
          className={DELIVERY_LOCKED_SUBPAGE_HEADER_CLASS}
          data-dibay-domain={domainChrome["data-dibay-domain"]}
          style={domainChrome.style}
        >
          {/**
           * Safe-top stays on the outer header. DO NOT put `sector-header-shell` on the
           * same node — shell resets padding and cancels `pt-[var(--safe-top)]`.
           */}
          <div className={APP_TIER1_HEADER_BAR_CLASS}>{detailHeader}</div>
        </header>
      );
    }

    return (
      <div
        className={`sticky top-0 z-20 w-full min-w-0 max-w-full overflow-x-hidden ${SECTOR_HEADER_SHELL_CLASS}`}
        data-dibay-domain={domainChrome["data-dibay-domain"]}
        style={domainChrome.style}
      >
        {detailHeader}
      </div>
    );
  }

  return null;
}
