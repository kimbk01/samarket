"use client";

import { useCallback, useId } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

type Props = {
  identifier: string;
  password: string;
  error?: string | null;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string | null;
  className?: string;
  /** `overlay` = 로그인 팝업 안 (팝업 SSOT 입력칸·버튼·오류색). 로그인 페이지는 기본 `page`. */
  surface?: "page" | "overlay";
  /** 「아이디로 로그인」으로 폼을 연 직후 아이디 칸에 포커스 */
  autoFocusIdentifier?: boolean;
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
  className,
  surface = "page",
  autoFocusIdentifier = false,
  onIdentifierChange,
  onPasswordChange,
  onSubmit,
}: Props) {
  const { t } = useI18n();
  const fieldId = useId();
  const identifierId = `${fieldId}-identifier`;
  const passwordId = `${fieldId}-password`;
  /** K-07 — 포커스 입력 + 로그인 버튼(`data-form-keyboard-keep-visible`)을 키보드 위 보이는 영역에 */
  const { effectiveViewportBottom } = useFormKeyboardViewport();
  useFormKeyboardFocusVisibility({ effectiveViewportBottom });
  /**
     * `disabled` 상태에서는 Enter 키로 form.onSubmit이 다시 발사되지 않도록 입력도 잠근다.
     * (LoginPageClient의 `loading` 가드와 함께 이중 제출을 차단)
     */
  const inputClassName =
    surface === "overlay"
      ? `${OverlayUi.input} !mt-1`
      : "mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:opacity-60";
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
    <form
      onSubmit={onSubmit}
      className={className ?? "mt-6 space-y-4"}
      noValidate
      autoComplete="off"
      data-keyboard-tap-dismiss="1"
    >
      <fieldset disabled={disabled} className="space-y-4">
        <div>
          <label htmlFor={identifierId} className="block sam-text-body-secondary font-medium text-sam-fg">
            {t("auth_login_identifier")}
          </label>
          <input
            id={identifierId}
            autoFocus={autoFocusIdentifier}
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
          <label htmlFor={passwordId} className="block sam-text-body-secondary font-medium text-sam-fg">
            {t("auth_password")}
          </label>
          <input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            required
            className={inputClassName}
          />
        </div>
      </fieldset>
      {error ? (
        surface === "overlay" ? (
          <p className={OverlayUi.caption} style={{ color: "var(--overlay-danger)" }} role="alert" aria-live="assertive">
            {error}
          </p>
        ) : (
          <p className="sam-text-body-secondary text-red-600" role="alert" aria-live="assertive">{error}</p>
        )
      ) : null}
      <button
        type="submit"
        disabled={disabled}
        aria-busy={loading}
        data-form-keyboard-keep-visible="1"
        className={
          surface === "overlay"
            ? OverlayUi.btn.primary
            : "w-full rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
        }
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
