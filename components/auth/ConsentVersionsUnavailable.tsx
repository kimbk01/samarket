"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";

/**
 * 필수 약관 버전을 읽지 못했을 때 동의 화면 대신 (가입 후속 감사 B10·검토 C-1).
 * 오류 경계의 `reset()` 은 서버 화면을 다시 받지 않을 수 있어 — 화면 전체를 새로 받는다.
 */
export function ConsentVersionsUnavailable() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-sam-app px-6 text-center">
      <p className="text-[15px] text-sam-fg">{t("auth_consent_doc_load_failed")}</p>
      <button type="button" className={Sam.btn.primary} onClick={() => window.location.reload()}>
        {t("common_retry")}
      </button>
    </div>
  );
}
