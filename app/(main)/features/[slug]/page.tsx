"use client";

import { useParams } from "next/navigation";
import { CategoryListLayout } from "@/components/category/CategoryListLayout";
import { CategoryEmptyState } from "@/components/category/CategoryEmptyState";

export default function FeatureCategoryPage() {
  const params = useParams();
  const slugOrId = typeof params?.slug === "string" ? params.slug : "";

  return (
    <CategoryListLayout slugOrId={slugOrId} expectedType="feature" backHref="/services">
      {(_category) => (
        <>
          {/* TODO: feature 전용 페이지 - 혜택/당근페이 등 소개 구조 */}
          <CategoryEmptyState
            message="기능 페이지 준비 중이에요."
            subMessage="곧 만나보실 수 있습니다."
          />
        </>
      )}
    </CategoryListLayout>
  );
}
