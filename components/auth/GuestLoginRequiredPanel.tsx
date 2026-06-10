"use client";

import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  openLoginRequiredSheet,
  type RequireAuthActionType,
} from "@/lib/auth/require-auth-action";
import { PHILIFE_FB_CARD_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { Sam } from "@/lib/ui/css-vars";

type GuestLoginRequiredPanelProps = {
  actionType: RequireAuthActionType;
  next?: string;
  /** 본문 — 미지정 시 `auth_login_required_body_{actionType}` */
  messageKey?: MessageKey;
  /** 제목 — 기본 `auth_login_required_title` */
  titleKey?: MessageKey;
  className?: string;
};

function resolveNext(next?: string): string {
  if (next?.trim()) return next.trim();
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * 비회원 전용 화면 — 로그인·회원가입(AuthModal) 진입 CTA.
 * proxy 404 대신 페이지 안에서 안내한다.
 */
export function GuestLoginRequiredPanel({
  actionType,
  next,
  messageKey,
  titleKey = "auth_login_required_title",
  className = "",
}: GuestLoginRequiredPanelProps) {
  const { t, safeT } = useI18n();
  const bodyKey = messageKey ?? (`auth_login_required_body_${actionType}` as MessageKey);
  const body = safeT(bodyKey, {
    fallbackKo: "이 기능을 사용하려면 로그인이 필요합니다.",
    fallbackEn: "Please sign in to use this feature.",
  });

  const openAuth = useCallback(() => {
    openLoginRequiredSheet({ actionType, next: resolveNext(next) });
  }, [actionType, next]);

  return (
    <div
      className={`${PHILIFE_FB_CARD_CLASS} sam-card__body flex flex-col items-center px-6 py-12 text-center ${className}`.trim()}
    >
      <h2 className="sam-text-section-title text-sam-fg">{t(titleKey)}</h2>
      <p className="mt-2 max-w-sm sam-text-body leading-relaxed text-sam-muted">{body}</p>
      <button
        type="button"
        onClick={openAuth}
        className={`${Sam.btn.primary} mt-6 min-h-11 w-full max-w-xs px-6`}
      >
        {t("profile_guest_login_cta")}
      </button>
    </div>
  );
}
