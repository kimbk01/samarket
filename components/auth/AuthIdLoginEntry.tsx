"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 로그인 화면 SNS 버튼 아래 상시 「아이디로 로그인」 (Owner 2026-11-07).
 * 발급받은 계정(관리자 발급·심사 계정) 전용 — 회원가입 입구가 아니다. 인증·권한은 서버가 판정한다.
 */
export function AuthIdLoginEntry({
  expanded,
  controlsId,
  disabled = false,
  onOpen,
}: {
  expanded: boolean;
  controlsId: string;
  disabled?: boolean;
  onOpen: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      data-testid="auth-id-login-entry"
      aria-expanded={expanded}
      aria-controls={controlsId}
      disabled={disabled}
      onClick={onOpen}
      className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-ui-rect px-3 py-2 text-center transition-colors hover:bg-sam-app disabled:opacity-50"
    >
      <span className="sam-text-body font-medium text-sam-fg underline underline-offset-4">
        {t("auth_login_with_id")}
      </span>
      <span className="sam-text-helper text-sam-muted">{t("auth_login_with_id_hint")}</span>
    </button>
  );
}
