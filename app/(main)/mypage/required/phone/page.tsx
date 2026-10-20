"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageRequiredPhoneClient } from "@/components/mypage/required/MypageRequiredPhoneClient";
import { MyScreen } from "@/components/mypage/ds/MyScreen";

/** 전화 인증 `/mypage/required/phone` (최종 설계 S05) — [인증 완료] 하단 고정 */
export default function MypageRequiredPhonePage() {
  const { safeT } = useI18n();
  return (
    <MyScreen
      title={safeT("mypage_required_phone", {
        fallbackKo: "전화번호 인증",
        fallbackEn: "Phone verification",
      })}
      template="form"
    >
      <MypageRequiredPhoneClient />
    </MyScreen>
  );
}
