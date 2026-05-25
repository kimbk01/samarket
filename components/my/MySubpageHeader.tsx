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
import { SECTOR_HEADER_SHELL_CLASS } from "@/lib/ui/sector-header-classes";

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
  /** 내정보 허브와 동일: 알림음·설정 (rightSlot과 동시 사용 시 rightSlot 우선) */
  showHubQuickActions?: boolean;
  /**
   * false면 `RegionBar` 등이 이미 1단을 그리므로, 여기서는 stickyBelow·ctaLinks만 MainTier1Extras에 넣음.
   */
  registerMainTier1?: boolean;
};

export function MySubpageHeader({
  title,
  titleKey,
  subtitle,
  subtitleHref,
  backHref = "/mypage",
  ariaLabel,
  preferHistoryBack = true,
  rightSlot,
  stickyBelow,
  section,
  ctaLinks,
  ownerStoreIdForCtas = null,
  hideCtaStrip = false,
  showHubQuickActions = false,
  registerMainTier1 = true,
  leftSlot,
}: MySubpageHeaderProps) {
  const { t, tt } = useI18n();
  const tier1Provider = useMainTier1ExtrasOptional();
  const setMainTier1Extras = tier1Provider?.setMainTier1Extras ?? null;
  const resolvedAriaLabel = tt(ariaLabel ?? t("common_back_to_mypage"));
  const resolvedTitle = titleKey ? t(titleKey) : title;
  const translatedTitle = typeof resolvedTitle === "string" ? tt(resolvedTitle) : resolvedTitle;
  const translatedSubtitle = subtitle ? tt(subtitle) : undefined;

  const stripLinks = useMemo((): { href: string; label: string }[] => {
    if (hideCtaStrip) return [];
    if (ctaLinks?.length) return ctaLinks;
    if (section) return getManagedSectionCtas(section, { ownerStoreId: ownerStoreIdForCtas });
    return [];
  }, [hideCtaStrip, ctaLinks, section, ownerStoreIdForCtas]);

  useLayoutEffect(() => {
    if (!setMainTier1Extras) return;
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
      });
    } else {
      setMainTier1Extras({
        ctaLinks: stripLinks.length > 0 ? stripLinks : undefined,
        stickyBelow,
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
  ]);

  if (!tier1Provider) {
    const trailing = rightSlot != null ? rightSlot : showHubQuickActions ? <MyHubHeaderActions /> : null;

    return (
      <div className={`sticky top-0 z-20 w-full min-w-0 max-w-full overflow-x-hidden ${SECTOR_HEADER_SHELL_CLASS}`}>
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
      </div>
    );
  }

  return null;
}
