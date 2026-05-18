"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MyStoreInquiriesView } from "@/components/mypage/MyStoreInquiriesView";

export default function MyStoreInquiriesPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <MySubpageHeader
        title={t("mypage_store_inquiries_title")}
        subtitle={t("mypage_store_inquiries_subtitle")}
        backHref="/mypage"
        section="orders"
      />
      <div className="mx-auto max-w-4xl px-4 py-4">
        <MyStoreInquiriesView />
      </div>
    </div>
  );
}
