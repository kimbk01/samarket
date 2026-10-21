"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  resolveConflictExistingLoginAction,
  type ConflictExistingLoginAction,
} from "@/components/auth/provider-email-conflict-redirect";
import {
  clearProviderEmailConflict,
  type ProviderEmailConflictState,
} from "@/lib/auth/provider-identity/provider-email-conflict.client";
import { resolveProviderDisplayName } from "@/lib/auth/provider-identity/provider-display";
import { buildMyPageHref } from "@/components/mypage/mypage-nav";
import { DibayDialog, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type AuthProviderEmailConflictModalProps = {
  open: boolean;
  conflict: ProviderEmailConflictState | null;
  onLoginWithExisting: (action: ConflictExistingLoginAction) => void;
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

  if (!conflict) return null;

  const existingProvider = conflict.existingProviders[0] ?? null;
  const existingLabel = resolveProviderDisplayName(existingProvider, language);
  const existingAction = resolveConflictExistingLoginAction(existingProvider);
  const attemptedLabel = resolveProviderDisplayName(conflict.attemptedProvider, language);

  const body = t("auth_provider_email_conflict_body", {
    existingProvider: existingLabel,
    attemptedProvider: attemptedLabel,
  });

  return (
    <DibayDialog
      open={open}
      onClose={handleDismiss}
      title={t("auth_provider_email_conflict_title")}
      description={body}
    >
      <div className={OverlayUi.actionsStack}>
        {existingAction.kind === "unsupported" ? (
          <p className={OverlayUi.bodySecondary} data-testid="auth-conflict-existing-unsupported">
            {t("auth_provider_email_conflict_existing_unavailable")}
          </p>
        ) : (
          <DibayOverlayButton roleTone="primary" onClick={() => onLoginWithExisting(existingAction)}>
            {t("auth_provider_email_conflict_login_existing", { provider: existingLabel })}
          </DibayOverlayButton>
        )}
        <DibayOverlayButton roleTone="secondary" onClick={handleDismiss}>
          {t("auth_provider_email_conflict_continue_other")}
        </DibayOverlayButton>
        <Link
          href={buildMyPageHref("settings", "support")}
          className={`${OverlayUi.btn.secondary} text-center`}
          onClick={handleDismiss}
        >
          {t("auth_provider_email_conflict_support")}
        </Link>
      </div>
    </DibayDialog>
  );
}
