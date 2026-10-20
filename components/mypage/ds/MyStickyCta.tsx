"use client";

import { useLayoutEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MYPAGE_COLUMN_MAX_WIDTH_CLASS, MYPAGE_GUTTER_X_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";
import { Sam } from "@/lib/ui/sam-component-classes";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

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

/** 하단 고정 CTA 가 가리는 높이만큼 본문 아래 여백 — 버튼 46 + 위아래 10 + 안전영역 */
export const MY_STICKY_CTA_BODY_CLEARANCE_CLASS =
  "pb-[calc(var(--sam-button-min-height,46px)+20px+var(--safe-bottom,0px))]";

/**
 * 하단 고정 주/보조 CTA (최종 설계 §1.2) — 키보드가 열리면 키보드 위, 닫히면 safe-area 위.
 * 주 버튼은 `dirty && !disabled && !loading` 일 때만 누를 수 있다. 로딩 = 버튼 안 스피너·폭 유지.
 */
export function MyStickyCta({ primary, secondary, dirty, primaryTone = "primary" }: MyStickyCtaProps) {
  const { t } = useI18n();
  const { effectiveBottomInset, keyboardOpen } = useFormKeyboardViewport();
  const barRef = useRef<HTMLDivElement | null>(null);
  const primaryLoading = Boolean(primary.loading);
  const primaryDisabled = !dirty || Boolean(primary.disabled) || primaryLoading;

  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || typeof document === "undefined") return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty(MYPAGE_TOAST_BOTTOM_VAR, `${el.offsetHeight + 8}px`);
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(MYPAGE_TOAST_BOTTOM_VAR);
    };
  }, []);

  return (
    <div
      ref={barRef}
      data-testid="my-sticky-cta"
      data-form-keyboard-footer="1"
      data-form-keyboard-open={keyboardOpen ? "true" : "false"}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 border-t border-sam-border-soft bg-sam-app/95 backdrop-blur-md supports-[backdrop-filter]:bg-sam-app/88"
      style={{ paddingBottom: `${effectiveBottomInset}px` }}
    >
      <div className={`pointer-events-auto mx-auto flex w-full ${MYPAGE_COLUMN_MAX_WIDTH_CLASS} gap-2 ${MYPAGE_GUTTER_X_CLASS} py-2.5`}>
        {secondary ? (
          <button
            type="button"
            data-testid={secondary.testId ?? "my-sticky-cta-secondary"}
            onClick={secondary.onPress}
            disabled={Boolean(secondary.disabled)}
            className={`${Sam.btn.secondaryCombo} ${Sam.focusRing} flex-1 disabled:opacity-45`}
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
          className={`${PRIMARY_TONE_CLASS[primaryTone]} ${Sam.focusRing} relative flex-[1.2] disabled:opacity-45`}
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
