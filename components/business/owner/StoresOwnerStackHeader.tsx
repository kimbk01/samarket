"use client";

import type { ReactNode } from "react";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function StoresOwnerStackHeader({
  variant,
  backHref,
  backPreferHistory = true,
  backIntercept,
  backAriaLabel,
  shopName,
  hubSubtitle,
  pageTitle,
  rightSlot,
  desktopInsetLeft = false,
}: {
  variant: "hub" | "admin";
  backHref?: string;
  /** admin: true(기본) — 히스토리 뒤로 우선, 막히면 backHref 폴백. false면 backHref로만 이동(고정 링크) */
  backPreferHistory?: boolean;
  /** admin + backHref: true면 뒤로가기 동작을 하지 않음(가드에서 이탈 확인 등). */
  backIntercept?: () => boolean;
  backAriaLabel?: string;
  shopName: string;
  hubSubtitle?: string;
  /** admin 전용 — 서브페이지 중앙 제목 */
  pageTitle?: string | null;
  rightSlot: ReactNode;
  /** 좌측 고정 사이드바(260px)만큼 헤더 시작 위치 보정 */
  desktopInsetLeft?: boolean;
}) {
  const { t } = useI18n();
  const resolvedBackAriaLabel = backAriaLabel ?? t("business_phase7_351");
  const resolvedHubSubtitle = hubSubtitle ?? t("business_phase7_079");
  const adminTitle = pageTitle?.trim() ? pageTitle : t("business_phase7_350");

  return (
    <BodyPortal>
      <header
        className={`fixed inset-x-0 top-0 z-[55] border-b border-sam-border bg-sam-surface/95 pt-[env(safe-area-inset-top,0px)] backdrop-blur-sm ${
          desktopInsetLeft ? "lg:left-[260px] lg:right-0" : ""
        }`}
      >
        <div className="flex h-14 w-full min-w-0 items-center gap-2 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] sm:pl-[max(1rem,env(safe-area-inset-left,0px))] sm:pr-[max(1rem,env(safe-area-inset-right,0px))]">
          {variant === "hub" ?
            backHref ?
              <AppBackButton backHref={backHref} ariaLabel={resolvedBackAriaLabel} />
            : <div className="h-10 w-10 shrink-0" aria-hidden />
          : backHref ?
            <AppBackButton
              backHref={backHref}
              interceptBack={backIntercept}
              preferHistoryBack={backPreferHistory}
              ariaLabel={resolvedBackAriaLabel}
            />
          : null}
          {variant === "hub" ?
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate sam-text-body font-semibold leading-tight text-sam-fg">{shopName}</p>
                <p className="truncate sam-text-xxs leading-tight text-sam-muted">{resolvedHubSubtitle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">{rightSlot}</div>
            </>
          : <>
              <div className="min-w-0 flex-1 lg:hidden">
                <h1 className="truncate sam-text-body-lg font-semibold leading-tight text-sam-fg">{adminTitle}</h1>
                <p className="truncate sam-text-xxs leading-tight text-sam-muted">{shopName}</p>
              </div>
              <div className="hidden min-w-0 flex-1 items-baseline gap-3 lg:flex">
                <h1 className="sam-text-page-title font-semibold text-sam-fg">{adminTitle}</h1>
                <span className="sam-text-body-secondary text-sam-muted">{shopName}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">{rightSlot}</div>
            </>
          }
        </div>
      </header>
    </BodyPortal>
  );
}
