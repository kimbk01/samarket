"use client";

import { useLayoutEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_COLUMN_MAX_WIDTH_CLASS, MYPAGE_GUTTER_X_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import {
  useBottomNavOccupiesClearance,
  useBottomNavScrollChromeHidden,
} from "@/lib/layout/bottom-nav-scroll-chrome-context";
import {
  FIXED_BOTTOM_BAR_MARKER_CLASS,
  readFixedBarTopFromViewportBottomPx,
} from "@/lib/layout/fixed-bottom-bar-occupancy";
import {
  MY_STICKY_CTA_BODY_CLEARANCE_NO_NAV_CLASS,
  resolveMyStickyCtaPlacement,
} from "@/lib/mypage/my-sticky-cta-placement";

export type MyStickyCtaAction = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** 기존 화면의 계약 testid 보존용(예: `feed-ad-submit`). 생략 시 공통 testid */
  testId?: string;
};

export type MyStickyCtaProps = {
  primary: MyStickyCtaAction;
  secondary?: Omit<MyStickyCtaAction, "loading">;
  /** 변경이 있을 때만 주 버튼 활성 (v2.1 §3.2 · Telegram 방식) */
  dirty: boolean;
  /**
   * 주 버튼 색 — primary(기본) / secondary(캐시 삭제 등 보조 동작, S17) / danger(탈퇴 요청 등 위험 동작, S19)
   */
  primaryTone?: "primary" | "secondary" | "danger";
};

const PRIMARY_TONE_CLASS: Record<NonNullable<MyStickyCtaProps["primaryTone"]>, string> = {
  primary: Sam.btn.primaryCombo,
  secondary: Sam.btn.secondaryCombo,
  danger: Sam.btn.dangerCombo,
};

/** 토스트가 CTA 위 8px 에 뜨도록 문서 루트에 지정하는 변수 (`MypageToastHost`) */
export const MYPAGE_TOAST_BOTTOM_VAR = "--mypage-toast-bottom";

/**
 * 하단 고정 CTA 가 가리는 높이만큼 본문 아래 여백 — 버튼 46 + 위아래 10 + 안전영역 (하단탭 없는 경로 기준).
 * 하단탭 유무에 맞춘 값은 `resolveMyStickyCtaBodyClearanceClass` (`MyScreen` 이 사용).
 */
export const MY_STICKY_CTA_BODY_CLEARANCE_CLASS = MY_STICKY_CTA_BODY_CLEARANCE_NO_NAV_CLASS;

/** 비활성 = 회색 토큰 배경·글자 (불투명도 금지 · 설계서 v3 §3) */
const CTA_DISABLED_CLASS = Sam.btn.disabledToken;

/**
 * 하단 고정 주/보조 CTA (최종 설계 §1.2 · v3 §12) — 바 배경은 기기 전체 폭.
 * 하단탭이 있으면 탭 바로 위, 없으면 화면 아래(안전영역 포함), 키보드가 열리면 키보드 위.
 * 버튼은 폰 좌우 16px · 태블릿은 본문 열(640px)과 같은 선.
 * 주 버튼은 `dirty && !disabled && !loading` 일 때만 누를 수 있다. 로딩 = 버튼 안 스피너·폭 유지.
 */
export function MyStickyCta({ primary, secondary, dirty, primaryTone = "primary" }: MyStickyCtaProps) {
  const { t } = useI18n();
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport();
  const bottomNavOccupies = useBottomNavOccupiesClearance();
  const bottomNavHidden = useBottomNavScrollChromeHidden();
  const placement = resolveMyStickyCtaPlacement({
    bottomNavOccupies,
    bottomNavHidden,
    keyboardOpen,
    effectiveBottomInset,
  });
  const barRef = useRef<HTMLDivElement | null>(null);
  const primaryLoading = Boolean(primary.loading);
  const primaryDisabled = !dirty || Boolean(primary.disabled) || primaryLoading;

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || typeof document === "undefined") return;
    const root = document.documentElement;
    /** 화면 아래 끝 → 바 위 끝 (하단탭 위에 붙은 경우 탭 높이 포함) + 8px */
    const apply = () => root.style.setProperty(MYPAGE_TOAST_BOTTOM_VAR, `${readFixedBarTopFromViewportBottomPx(el) + 8}px`);
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(MYPAGE_TOAST_BOTTOM_VAR);
    };
  }, [placement.bottom, placement.paddingBottom]);

  return (
    <div
      ref={barRef}
      data-testid="my-sticky-cta"
      data-form-keyboard-footer="1"
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      data-above-bottom-nav={placement.aboveBottomNav ? "1" : "0"}
      className={`${FIXED_BOTTOM_BAR_MARKER_CLASS} pointer-events-none fixed inset-x-0 z-30 border-t border-sam-border-soft bg-sam-app/95 backdrop-blur-md supports-[backdrop-filter]:bg-sam-app/88`}
      style={{ bottom: placement.bottom, paddingBottom: placement.paddingBottom }}
    >
      <div className={`pointer-events-auto mx-auto flex w-full ${MYPAGE_COLUMN_MAX_WIDTH_CLASS} gap-2 ${MYPAGE_GUTTER_X_CLASS} py-2.5`}>
        {secondary ? (
          <button
            type="button"
            data-testid={secondary.testId ?? "my-sticky-cta-secondary"}
            onClick={secondary.onPress}
            disabled={Boolean(secondary.disabled)}
            className={`${Sam.btn.secondaryCombo} ${Sam.focusRing} ${CTA_DISABLED_CLASS} flex-1`}
          >
            {secondary.label}
          </button>
        ) : null}
        <button
          type="button"
          data-testid={primary.testId ?? "my-sticky-cta-primary"}
          onClick={primaryDisabled ? undefined : primary.onPress}
          disabled={primaryDisabled}
          aria-busy={primaryLoading}
          data-tone={primaryTone}
          className={`${PRIMARY_TONE_CLASS[primaryTone]} ${Sam.focusRing} ${
            /** 로딩 = 본래 색 유지 + 스피너 (회색 비활성 아님) */
            primaryLoading ? "disabled:cursor-progress disabled:opacity-100" : CTA_DISABLED_CLASS
          } relative flex-[1.2]`}
        >
          <span className={primaryLoading ? "invisible" : undefined}>{primary.label}</span>
          {primaryLoading ? (
            <span className="absolute inset-0 flex items-center justify-center" role="status">
              <span className="sr-only">{t("mypage_comp_ds_saving")}</span>
              <span
                aria-hidden
                className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
              />
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
