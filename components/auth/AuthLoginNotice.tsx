"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AuthAccountStatusNotice } from "@/lib/auth/login-error-i18n";

/** 계정 정지·차단·탈퇴 안내에서 쓰는 공개 고객센터 연락처 (로그아웃 상태에서도 열림). */
export const AUTH_ACCOUNT_SUPPORT_HREF = "mailto:support@dibay.app";

export type AuthLoginNoticeState = {
  /** info = 로그아웃·세션 만료 등 중립 안내 / error = 로그인 실패 / account = 계정 상태 전용 블록 */
  tone: "info" | "error" | "account";
  text: string;
  accountStatus?: AuthAccountStatusNotice;
};

/** AuthNotice(info|error) — §5.5. 성공·안내는 빨간 오류색을 쓰지 않는다. */
export function AuthLoginNotice({
  notice,
  className = "",
}: {
  notice: AuthLoginNoticeState;
  className?: string;
}) {
  const toneClass =
    notice.tone === "error"
      ? "text-sam-danger"
      : "rounded-ui-rect border border-sam-border-soft bg-sam-info-soft px-3 py-2 text-sam-fg";
  return (
    <p
      className={`sam-text-body-secondary ${toneClass} ${className}`.trim()}
      role={notice.tone === "error" ? "alert" : "status"}
      data-auth-notice-tone={notice.tone}
    >
      {notice.text}
    </p>
  );
}

const ACCOUNT_STATUS_TITLE_KEY = {
  suspended: "auth_account_status_suspended_title",
  blocked: "auth_account_status_blocked_title",
  withdrawn: "auth_account_status_withdrawn_title",
} as const;

/** 정지·차단·탈퇴 전용 안내 블록 + 고객센터 링크 (P2-15 UX). */
export function AuthAccountStatusNoticeBlock({
  status,
  text,
  className = "",
}: {
  status: AuthAccountStatusNotice;
  text: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={`rounded-ui-rect border border-sam-border bg-sam-surface-muted px-4 py-3 ${className}`.trim()}
      role="alert"
      data-auth-account-status={status}
    >
      <p className="sam-text-body font-semibold text-sam-fg">{t(ACCOUNT_STATUS_TITLE_KEY[status])}</p>
      <p className="mt-1 sam-text-body-secondary text-sam-muted">{text}</p>
      <a
        href={AUTH_ACCOUNT_SUPPORT_HREF}
        className="mt-3 inline-flex min-h-[40px] items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[13px] font-medium text-sam-fg"
      >
        {t("auth_account_status_support_cta")}
      </a>
    </div>
  );
}
