"use client";

import Link from "next/link";
import { useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import {
  MY_STICKY_CTA_BAR_SURFACE_CLASS,
  MY_STICKY_CTA_ROW_CLASS,
} from "@/components/mypage/ds/MyStickyCta";
import { CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";
import { MYPAGE_HOME_ACCOUNT_LEAVE_HREF } from "@/lib/mypage/mypage-home-hub-links";
import { useOverlayHardwareBack } from "@/lib/ui/overlay-back-stack";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";

/** 하단 왼쪽 출구 — 신규 가입 = 「가입 취소」, 약관 개정 재동의(이미 가입한 회원) = 「로그아웃」. 동작은 같다(로그아웃 확인창). */
export type RegistrationExitKind = "signup_cancel" | "reconsent_logout";

type RegistrationPageShellProps = {
  /** 맨 위 줄 글자 — 기본 「회원가입」 */
  topTitle?: string;
  /** 맨 위 줄 왼쪽 ‹ (국가 선택 화면에서만) */
  onTopBack?: () => void;
  /** 본문 제목(22/700 왼쪽) · 설명(14) — 없으면 본문이 직접 그린다 */
  title?: string;
  description?: string;
  titleId?: string;
  children?: ReactNode;
  /** 하단 오른쪽 주 버튼 (`MY_STICKY_CTA_PRIMARY_BUTTON_CLASS`) */
  primaryAction?: ReactNode;
  /** 주 버튼을 자식이 포털로 넣는 자리(전화 단계 — 단계마다 버튼이 바뀜). 비면 사라진다. */
  primarySlotRef?: Ref<HTMLDivElement>;
  /** 버튼 줄 바로 위 오류·안내 */
  footerNote?: ReactNode;
  /** 왼쪽 출구 버튼 — `null` = 숨김(인증 완료 화면) */
  exit?: RegistrationExitKind | null;
  /** 「회원탈퇴」 링크 — 동의 화면만 */
  showLeaveLink?: boolean;
};

/**
 * 가입 단계(동의·전화·주소) 전체 화면 틀 — 시안 v3 (Owner 2026-11-27 「v3대로 구현」 · 「모달로 하지 말 것」 「전번은 상단」).
 * - 팝업·시트 아님: 일반 화면. 맨 위 줄 「회원가입」 · 제목·입력은 위쪽 · 본문만 스크롤.
 * - 하단 고정 줄: [가입 취소(보조)] · [주 버튼] (앱 버튼 표준 46·4·14 — 내정보 하단 고정 줄 `MyStickyCta` 와 같은 줄) + 「고객센터」.
 *   키보드가 열리면 줄이 키보드 바로 위(공통 키보드 측정 `effectiveBottomInset`, 주소 저장 화면과 같은 방식) · 고객센터 줄은 숨김.
 * - Android ◁: 이 화면에 머문다(예전 가입 팝업과 같음 · 건너뛰기 없음 Owner 2026-11-24). 나가기 = [가입 취소] = 로그아웃.
 * 팝업 SSOT(2026-11-02)는 입력 화면을 「⑤ 입력 시트」로 정했으나, 가입 단계만 Owner 지시로 전체 화면(예외).
 */
export function RegistrationPageShell({
  topTitle,
  onTopBack,
  title,
  description,
  titleId,
  children,
  primaryAction,
  primarySlotRef,
  footerNote,
  exit = "signup_cancel",
  showLeaveLink = false,
}: RegistrationPageShellProps) {
  const { t } = useI18n();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const { keyboardOpen, effectiveBottomInset, effectiveViewportBottom, visualViewportHeight, visualViewportOffsetTop } =
    useFormKeyboardViewport();
  useFormKeyboardFocusVisibility({ scrollRootRef: bodyRef, effectiveViewportBottom });
  /** ◁ — 국가 선택이면 번호 화면으로, 그 밖에는 머문다 */
  useOverlayHardwareBack(true, onTopBack ?? null);

  /**
   * 화면 = 「보이는 영역」(visualViewport) — iPhone 은 키보드가 열려도 화면 높이가 줄지 않고 페이지를 위로 밀어
   * 맨 위 줄이 화면 밖으로 나갔다(2026-11-27 iPhone 17 Pro 시뮬레이터 실측). 위치·높이를 보이는 영역에 맞추면
   * 맨 위 줄은 항상 위, 하단 줄은 항상 키보드 바로 위(바텀시트 KB-02/03 과 같은 규칙). Android(adjustResize)는 값이 같아 변화 없음.
   */
  const bandStyle: CSSProperties | undefined =
    visualViewportHeight > 0
      ? {
          top: Math.max(0, Math.round(visualViewportOffsetTop)),
          height: Math.round(visualViewportHeight),
          bottom: "auto",
        }
      : undefined;
  const exitLabel = exit === "reconsent_logout" ? t("auth_logout_submit") : t("auth_reg_cancel");
  return (
    <div
      className="fixed inset-0 flex flex-col bg-sam-surface"
      style={bandStyle}
      data-form-keyboard-surface="1"
      data-registration-page="1"
    >
      <div
        className="relative box-content flex h-14 shrink-0 items-center justify-center border-b border-sam-border bg-sam-surface pt-[var(--safe-top,0px)]"
        data-form-keyboard-sticky-chrome="1"
      >
        {onTopBack ? (
          <button
            type="button"
            onClick={onTopBack}
            aria-label={t("nav_back")}
            className="absolute bottom-0 left-1 flex h-14 w-11 items-center justify-center text-[22px] text-sam-fg"
            data-testid="registration-top-back"
          >
            ‹
          </button>
        ) : null}
        <span className="text-[16px] font-semibold text-sam-fg">{topTitle ?? t("auth_reg_header")}</span>
      </div>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-6">
        {title ? (
          <h1 id={titleId} className="text-[22px] font-bold leading-[1.4] text-sam-fg [word-break:keep-all]">
            {title}
          </h1>
        ) : null}
        {description ? (
          <p className="mt-1.5 text-[14px] leading-[1.6] text-sam-muted [word-break:keep-all]">{description}</p>
        ) : null}
        {children}
      </div>

      <div
        className={`shrink-0 ${MY_STICKY_CTA_BAR_SURFACE_CLASS}`}
        data-form-keyboard-footer="1"
        data-registration-footer="1"
        /** 키보드 열림 = 화면 아래 끝이 이미 키보드 위(위 bandStyle) — 키보드 높이를 또 더하지 않는다 */
        style={{ paddingBottom: `${keyboardOpen ? 0 : effectiveBottomInset}px` }}
      >
        {footerNote ? <div className="px-4 pt-2.5">{footerNote}</div> : null}
        <div className={MY_STICKY_CTA_ROW_CLASS}>
          {exit ? (
            <LogoutActionTrigger
              variant="sticky_secondary"
              label={exitLabel}
              confirmTitle={exit === "signup_cancel" ? t("auth_reg_cancel_confirm_title") : undefined}
              confirmBody={exit === "signup_cancel" ? t("auth_reg_cancel_confirm_body") : undefined}
              testId="registration-exit"
            />
          ) : null}
          {primaryAction ?? null}
          {primarySlotRef ? <div ref={primarySlotRef} className="flex min-w-0 flex-[1.2] empty:hidden" /> : null}
        </div>
        {keyboardOpen ? null : (
          <div className="-mt-1 flex items-center justify-center gap-5 pb-1">
            <Link href={CUSTOMER_CENTER_HREF} className={REGISTRATION_FOOTER_LINK_CLASS}>
              {t("auth_consent_escape_support")}
            </Link>
            {showLeaveLink ? (
              <Link href={MYPAGE_HOME_ACCOUNT_LEAVE_HREF} className={REGISTRATION_FOOTER_LINK_CLASS}>
                {t("auth_consent_escape_leave")}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** 하단 「고객센터」·「회원탈퇴」 — 12/600 밑줄 · 누르는 높이 36 */
const REGISTRATION_FOOTER_LINK_CLASS =
  "inline-flex min-h-[36px] items-center text-[12px] font-semibold text-sam-muted underline underline-offset-2";
