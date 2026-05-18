"use client";

import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  identifier: string;
  password: string;
  error?: string | null;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string | null;
  onIdentifierChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
};

export function PasswordLoginForm({
  identifier,
  password,
  error,
  disabled = false,
  loading = false,
  loadingText = "",
  onIdentifierChange,
  onPasswordChange,
  onSubmit,
}: Props) {
  const { t } = useI18n();
  /**
     * `disabled` 상태에서는 Enter 키로 form.onSubmit이 다시 발사되지 않도록 입력도 잠근다.
     * (LoginPageClient의 `loading` 가드와 함께 이중 제출을 차단)
     */
  const inputClassName =
    "mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:opacity-60";
  const handleIdentifierChange = useCallback(
    (value: string) => {
      if (value === identifier) return;
      onIdentifierChange(value);
    },
    [identifier, onIdentifierChange]
  );
  const handlePasswordChange = useCallback(
    (value: string) => {
      if (value === password) return;
      onPasswordChange(value);
    },
    [password, onPasswordChange]
  );
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate autoComplete="off">
      <fieldset disabled={disabled} className="space-y-4">
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("auth_login_identifier")}</label>
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            value={identifier}
            onChange={(e) => handleIdentifierChange(e.target.value)}
            placeholder={t("auth_login_identifier")}
            required
            className={inputClassName}
          />
        </div>
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("auth_password")}</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            required
            className={inputClassName}
          />
        </div>
      </fieldset>
      {error ? <p className="sam-text-body-secondary text-red-600" role="alert" aria-live="assertive">{error}</p> : null}
      <button
        type="submit"
        disabled={disabled}
        aria-busy={loading}
        className="w-full rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
      >
        {loading
          ? loadingText?.trim()
            ? loadingText.trim()
            : t("common_processing")
          : t("auth_login_submit")}
      </button>
    </form>
  );
}
