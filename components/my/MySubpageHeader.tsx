"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import type { ManagedMySection } from "@/lib/my/managed-my-section-ctas";
import { getManagedSectionCtas } from "@/lib/my/managed-my-section-ctas";
import { useMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { MyHubHeaderActions } from "@/components/my/MyHubHeaderActions";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";

export type MySubpageHeaderProps = {
  /** `registerMainTier1={false}` 일 때 생략 가능 */
  title?: ReactNode;
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
   * (필라이프 피드·거래 탐색과 동일 헤더 톤을 맞출 때 사용)
   */
  registerMainTier1?: boolean;
};

export function MySubpageHeader({
  title,
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
  const router = useRouter();
  const tier1Provider = useMainTier1ExtrasOptional();
  const setMainTier1Extras = tier1Provider?.setMainTier1Extras ?? null;
  const resolvedAriaLabel = tt(ariaLabel ?? t("common_back_to_mypage"));
  const translatedTitle = typeof title === "string" ? tt(title) : title;
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
    const right =
      rightSlot != null ? (
        <div className="flex min-w-[44px] shrink-0 items-center justify-end">{rightSlot}</div>
      ) : showHubQuickActions ? (
        <MyHubHeaderActions />
      ) : (
        <div className="h-9 w-9 shrink-0" aria-hidden />
      );

    return (
      <div className="sticky top-0 z-20 w-full min-w-0 max-w-full overflow-x-hidden bg-[var(--sub-bg)]">
        <header className="min-w-0 overflow-x-hidden border-b border-ig-border">
          <div className={`flex h-12 min-w-0 items-center gap-2 overflow-hidden ${APP_MAIN_HEADER_INNER_CLASS}`}>
            <div className="flex w-[44px] shrink-0 justify-start">
              {preferHistoryBack === false && backHref != null ? (
                <Link
                  href={backHref}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
                  aria-label={resolvedAriaLabel}
                >
                  <BackChevronIcon />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => runHistoryBackWithFallback(router, backHref)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-ig-highlight"
                  aria-label={resolvedAriaLabel}
                >
                  <BackChevronIcon />
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden px-1 text-center">
              <h1 className="flex min-w-0 w-full items-center justify-center overflow-hidden text-foreground">
                {typeof translatedTitle === "string" ? (
                  <span className="truncate text-[17px] font-semibold">{translatedTitle}</span>
                ) : (
                  translatedTitle
                )}
              </h1>
              {translatedSubtitle ? (
                subtitleHref ? (
                  <Link
                    href={subtitleHref}
                    className="mt-0.5 block truncate text-[11px] leading-tight text-[var(--text-muted)] hover:text-foreground hover:underline"
                  >
                    {translatedSubtitle}
                  </Link>
                ) : (
                  <p className="truncate text-[11px] leading-tight text-[var(--text-muted)]">{translatedSubtitle}</p>
                )
              ) : null}
            </div>
            {right}
          </div>
        </header>
      </div>
    );
  }

  return null;
}

function BackChevronIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
