"use client";

import { useParams } from "next/navigation";
import { CategoryListLayout } from "@/components/category/CategoryListLayout";
import { CategoryEmptyState } from "@/components/category/CategoryEmptyState";

export default function ServiceCategoryPage() {
  const params = useParams();
  const slugOrId = typeof params?.slug === "string" ? params.slug : "";

  return (
    <CategoryListLayout slugOrId={slugOrId} expectedType="service" backHref="/services">
      {(_category) => (
        <>
          {/* TODO: service 목록 - 신청/예약/문의 구조 추후 연동 */}
          <CategoryEmptyState
            message="아직 서비스 글이 없어요."
            subMessage="이 카테고리의 서비스가 여기에 표시됩니다."
          />
        </>
      )}
    </CategoryListLayout>
  );
}
