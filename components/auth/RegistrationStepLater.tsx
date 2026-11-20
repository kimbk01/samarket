"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { CUSTOMER_CENTER_HREF } from "@/lib/mypage/customer-center-paths";
import { DIBAY_ONBOARDING_LINK_CLASS } from "@/lib/ui/dibay-onboarding-styles";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/**
 * 가입 단계(전화·주소) 하단 — [나중에 하기]는 열람을 막지 않기 위한 출구 (Owner 2026-11-20 「앱 사용 막지 않음, 읽기 가능」).
 * 고객센터·로그아웃은 동의 화면과 같은 출구.
 */
export function RegistrationStepLaterButton({ onLater }: { onLater: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onLater}
      className={`${OverlayUi.btn.text} mt-2 w-full`}
      data-testid="registration-step-later"
    >
      {t("auth_reg_later")}
    </button>
  );
}

export function RegistrationStepEscape({ showHelp }: { showHelp?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="mt-5 border-t border-sam-border pt-4" data-registration-step-escape>
      <p className="text-[12px] text-sam-muted">{t("auth_reg_later_hint")}</p>
      {showHelp ? <p className="mt-1 text-[12px] text-sam-muted">{t("auth_reg_help")}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link href={CUSTOMER_CENTER_HREF} className={`inline-flex min-h-[44px] items-center ${DIBAY_ONBOARDING_LINK_CLASS}`}>
          {t("auth_consent_escape_support")}
        </Link>
        <span className="inline-flex min-h-[44px] items-center">
          <LogoutActionTrigger variant="text_link" />
        </span>
      </div>
    </div>
  );
}
