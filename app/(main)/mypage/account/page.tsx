"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyAccountContent } from "@/components/my/MyAccountContent";
import { MyScreen } from "@/components/mypage/ds/MyScreen";

/** 계정 `/mypage/account` (최종 설계 S03) — 헤더 즉시, 본문 1열 40rem */
export default function MypageAccountPage() {
  const { t } = useI18n();
  return (
    <MyScreen title={t("account_title")} template="hub">
      <MyAccountContent />
    </MyScreen>
  );
}
