"use client";

import { useParams } from "next/navigation";
import { CategoryListLayout } from "@/components/category/CategoryListLayout";
import { CategoryEmptyState } from "@/components/category/CategoryEmptyState";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export default function FeatureCategoryPage() {
  const params = useParams();
  const { t } = useI18n();
  const slugOrId = typeof params?.slug === "string" ? params.slug : "";

  return (
    <CategoryListLayout slugOrId={slugOrId} expectedType="feature" backHref="/services">
      {(_category) => (
        <>
          {/* TODO: feature 전용 페이지 - 혜택 등 소개 구조 */}
          <CategoryEmptyState
            message={t("feature_page_empty_message")}
            subMessage={t("feature_page_empty_sub")}
          />
        </>
      )}
    </CategoryListLayout>
  );
}
