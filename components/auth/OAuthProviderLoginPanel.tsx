"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getOAuthLoginContinueLabelKey,
  getOAuthLoginPrimaryStyle,
  OAUTH_LOGIN_PRIMARY_BUTTON_BASE,
  OAuthLoginProviderIcon,
} from "@/components/auth/OAuthLoginProviderVisuals";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import type { OAuthPanelPhase, OAuthPanelStatus } from "@/lib/auth/oauth/oauth-provider-panel.client";

type Props = {
  provider: OAuthProvider;
  phase: OAuthPanelPhase;
  status: OAuthPanelStatus;
  error?: string | null;
  onCancel?: () => void;
};

function statusMessage(
  status: OAuthPanelStatus,
  t: ReturnType<typeof useI18n>["t"],
  safeT: ReturnType<typeof useI18n>["safeT"],
): string {
  if (status === "preparing") {
    return safeT("auth_oauth_launch_preparing", {
      fallbackKo: "로그인 준비 중…",
      fallbackEn: "Preparing sign-in…",
    });
  }
  if (status === "opening") {
    return t("auth_oauth_redirecting_label");
  }
  if (status === "awaiting_return") {
    return safeT("auth_oauth_launch_body", {
      fallbackKo: "로그인을 완료하면 자동으로 돌아옵니다.",
      fallbackEn: "Return here after you finish sign-in.",
    });
  }
  return safeT("auth_oauth_launch_body", {
    fallbackKo: "아래 버튼을 눌러 로그인 창을 열어 주세요.",
    fallbackEn: "Tap the button below to open the sign-in window.",
  });
}

export function OAuthProviderLoginPanel({
  provider,
  phase,
  status,
  error,
  onCancel,
}: Props) {
  const { t, safeT } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (phase === "idle") {
      setEntered(false);
      return;
    }
    if (phase === "exiting") {
      setEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "idle") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [phase]);

  if (!mounted || phase === "idle" || typeof document === "undefined") return null;

  const style = getOAuthLoginPrimaryStyle(provider);
  const label = t(getOAuthLoginContinueLabelKey(provider));
  const body = statusMessage(status, t, safeT);
  const showSpinner = status === "preparing" || status === "opening" || status === "awaiting_return";

  const backdropClass =
    phase === "exiting" || !entered
      ? "auth-oauth-panel-backdrop auth-oauth-panel-backdrop--exiting"
      : "auth-oauth-panel-backdrop auth-oauth-panel-backdrop--entered";

  const sheetClass =
    phase === "exiting"
      ? "auth-oauth-panel-sheet auth-oauth-panel-sheet--exiting"
      : entered
        ? "auth-oauth-panel-sheet auth-oauth-panel-sheet--entered"
        : "auth-oauth-panel-sheet auth-oauth-panel-sheet--entering";

  return createPortal(
    <div
      className="auth-oauth-panel-host fixed inset-0 z-[1320] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={safeT("auth_oauth_launch_title", {
        fallbackKo: "로그인 계속",
        fallbackEn: "Continue sign-in",
      })}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-black/50 ${backdropClass}`}
        aria-label={t("common_close")}
        onClick={onCancel}
      />
      <div
        className={`relative flex min-h-[100dvh] max-h-[100dvh] w-full flex-col bg-sam-app px-6 pb-[max(1.5rem,var(--safe-bottom))] pt-[max(1.25rem,var(--safe-top))] ${sheetClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center space-y-4 text-center">
          <div className="flex justify-center">
            <OAuthLoginProviderIcon provider={provider} size="primary" />
          </div>
          <h2 className="text-lg font-semibold text-sam-fg">
            {safeT("auth_oauth_launch_title", {
              fallbackKo: "로그인 계속",
              fallbackEn: "Continue sign-in",
            })}
          </h2>
          <p className="text-sm text-sam-muted">{body}</p>
          <div
            className={`${OAUTH_LOGIN_PRIMARY_BUTTON_BASE} ${style?.buttonClassName ?? "border border-sam-border bg-sam-surface"} pointer-events-none opacity-90`}
            aria-hidden
          >
            {showSpinner ? (
              <span className="inline-block h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <OAuthLoginProviderIcon provider={provider} size="primary" />
            )}
            <span className={`flex-1 text-center text-[15px] font-semibold ${style?.labelClassName ?? "text-sam-fg"}`}>
              {showSpinner ? t("auth_oauth_redirecting_label") : label}
            </span>
            <span className="h-6 w-6 shrink-0" />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {onCancel ? (
            <button type="button" className="text-sm text-sam-muted underline" onClick={onCancel}>
              {safeT("auth_oauth_launch_back", {
                fallbackKo: "돌아가기",
                fallbackEn: "Go back",
              })}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
