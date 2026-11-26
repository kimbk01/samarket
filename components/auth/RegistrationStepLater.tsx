"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 가입 전화 단계 본문 맨 아래 도움말 한 줄 — 「다른 나라 번호·인증번호 안 옴 → 고객센터」.
 * 나가기(가입 취소 = 로그아웃)·고객센터는 하단 고정 줄(`RegistrationPageShell`)로 옮겼다(2026-11-27 재감사 —
 * 본문 맨 아래 글자 링크는 키보드·긴 본문에 가려 보이지 않았다). 건너뛰기 없음(Owner 2026-11-24) 유지.
 */
export function RegistrationStepHelp() {
  const { t } = useI18n();
  return (
    <p className="mt-3 text-[12px] leading-[1.4] text-sam-muted" data-registration-step-help>
      {t("auth_reg_help")}
    </p>
  );
}
