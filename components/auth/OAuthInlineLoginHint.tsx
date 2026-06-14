"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OAuthInlineStatus } from "@/lib/auth/oauth/use-oauth-login";

type Props = {
  status: OAuthInlineStatus;
  className?: string;
};

export function OAuthInlineLoginHint({ status, className = "" }: Props) {
  const { t } = useI18n();

  if (status === "idle" || status === "opening") return null;

  const message =
    status === "awaiting_return"
      ? t("auth_oauth_return_hint")
      : t("auth_oauth_signing_in_hint");

  return (
    <p className={`sam-text-body-secondary text-center text-sam-muted ${className}`.trim()}>
      {message}
    </p>
  );
}
