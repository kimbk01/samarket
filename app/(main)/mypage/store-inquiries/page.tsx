"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStoreInquiriesView } from "@/components/mypage/MyStoreInquiriesView";

/** S34 매장 문의 내역 — 공통 셸(`MyScreen` 40rem·16/20px · `bg-sam-app`) */
export default function MyStoreInquiriesPage() {
  const { t } = useI18n();
  return (
    <MyScreen title={t("mypage_store_inquiries_title")} backHref="/mypage" template="list">
      <MyStoreInquiriesView />
    </MyScreen>
  );
}
