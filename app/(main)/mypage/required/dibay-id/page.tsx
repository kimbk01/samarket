"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MypageRequiredDibayIdClient } from "@/components/mypage/required/MypageRequiredDibayIdClient";
import { MyScreen } from "@/components/mypage/ds/MyScreen";

/** 아이디 확정 `/mypage/required/dibay-id` (최종 설계 S04) — [확정] 하단 고정 */
export default function MypageRequiredDibayIdPage() {
  const { safeT } = useI18n();
  return (
    <MyScreen
      title={safeT("mypage_required_dibay_id", {
        fallbackKo: "@아이디",
        fallbackEn: "@ ID",
      })}
      template="form"
    >
      <MypageRequiredDibayIdClient />
    </MyScreen>
  );
}
