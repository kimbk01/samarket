"use client";

import { useParams } from "next/navigation";
import { CategoryListLayout } from "@/components/category/CategoryListLayout";
import { CategoryEmptyState } from "@/components/category/CategoryEmptyState";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function ServiceCategoryPage() {
  const params = useParams();
  const { t } = useI18n();
  const slugOrId = typeof params?.slug === "string" ? params.slug : "";

  return (
    <CategoryListLayout slugOrId={slugOrId} expectedType="service" backHref="/services">
      {(_category) => (
        <>
          {/* TODO: service 목록 - 신청/예약/문의 구조 추후 연동 */}
          <CategoryEmptyState
            message={t("service_page_empty_message")}
            subMessage={t("service_page_empty_sub")}
          />
        </>
      )}
    </CategoryListLayout>
  );
}
