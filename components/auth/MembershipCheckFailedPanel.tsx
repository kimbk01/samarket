"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { retryClientMembershipRecovery } from "@/hooks/use-client-membership-state";
import { Sam } from "@/lib/ui/css-vars";

/**
 * 회원 판정 재시도 소진(일시 장애) — 무한 로딩 대신 오류 + [다시 시도].
 * 비회원 안내(`GuestLoginRequiredPanel`)와 다르다: 로그인 사용자를 비회원으로 보이지 않는다.
 */
export function MembershipCheckFailedPanel({ source, className = "" }: { source: string; className?: string }) {
  const { t, safeT } = useI18n();
  return (
    <div
      className={`flex flex-col items-center px-6 py-12 text-center ${className}`.trim()}
      role="alert"
      data-testid="membership-check-failed"
    >
      <p className="sam-text-body text-sam-fg">
        {safeT("auth_membership_check_failed", {
          fallbackKo: "로그인 상태를 확인하지 못했어요",
          fallbackEn: "Couldn't verify your sign-in status",
        })}
      </p>
      <button
        type="button"
        className={`${Sam.btn.secondaryCombo} mt-4 min-h-11 px-6`}
        onClick={() => retryClientMembershipRecovery(source)}
      >
        {t("common_retry")}
      </button>
    </div>
  );
}
