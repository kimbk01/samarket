"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  clearProviderEmailConflict,
  type ProviderEmailConflictState,
} from "@/lib/auth/provider-identity/provider-email-conflict.client";
import { resolveProviderDisplayName } from "@/lib/auth/provider-identity/provider-display";
import { buildMyPageHref } from "@/components/mypage/mypage-nav";
import {
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_GHOST_BTN_CLASS,
  MYPAGE_HOME_OUTLINE_BTN_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

type AuthProviderEmailConflictModalProps = {
  open: boolean;
  conflict: ProviderEmailConflictState | null;
  onLoginWithExisting: (provider: OAuthProvider) => void;
  onDismiss: () => void;
};

export function AuthProviderEmailConflictModal({
  open,
  conflict,
  onLoginWithExisting,
  onDismiss,
}: AuthProviderEmailConflictModalProps) {
  const { t, language } = useI18n();

  const handleDismiss = useCallback(() => {
    clearProviderEmailConflict();
    onDismiss();
  }, [onDismiss]);

  if (!open || !conflict) return null;

  const existingProvider = conflict.existingProviders[0] ?? "google";
  const existingLabel = resolveProviderDisplayName(existingProvider, language);
  const attemptedLabel = resolveProviderDisplayName(conflict.attemptedProvider, language);

  const body = t("auth_provider_email_conflict_body", {
    existingProvider: existingLabel,
    attemptedProvider: attemptedLabel,
  });

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/45 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-provider-conflict-title"
    >
      <div className={`w-full max-w-sm p-5 ${MYPAGE_HOME_CARD_CLASS}`}>
        <p id="auth-provider-conflict-title" className="text-[17px] font-bold leading-tight text-[#1E3932]">
          {t("auth_provider_email_conflict_title")}
        </p>
        <p className="mt-2 text-[14px] leading-snug text-[#6F4E37]">{body}</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className={MYPAGE_HOME_GHOST_BTN_CLASS}
            onClick={() => onLoginWithExisting(existingProvider as OAuthProvider)}
          >
            {t("auth_provider_email_conflict_login_existing", { provider: existingLabel })}
          </button>
          <button type="button" className={MYPAGE_HOME_OUTLINE_BTN_CLASS} onClick={handleDismiss}>
            {t("auth_provider_email_conflict_continue_other")}
          </button>
          <Link
            href={buildMyPageHref("settings", "support")}
            className={`${MYPAGE_HOME_OUTLINE_BTN_CLASS} text-center`}
            onClick={handleDismiss}
          >
            {t("auth_provider_email_conflict_support")}
          </Link>
        </div>
      </div>
    </div>
  );
}
