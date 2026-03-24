"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryType } from "@/lib/categories/types";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getCategoryBySlugOrId } from "@/lib/categories/getCategoryById";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useRegisterCategoryListStickyHeader } from "@/contexts/CategoryListHeaderContext";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

type ExpectedType = CategoryType;

interface CategoryListLayoutProps {
  /** URL 세그먼트 (id 또는 slug) */
  slugOrId: string;
  /** 이 페이지가 기대하는 카테고리 type (불일치 시 올바른 경로로 리다이렉트) */
  expectedType: ExpectedType;
  /** 뒤로가기 링크 (미주입 시 history.back) */
  backHref?: string;
  children: (category: CategoryWithSettings) => React.ReactNode;
}

export function CategoryListLayout({
  slugOrId,
  expectedType,
  backHref,
  children,
}: CategoryListLayoutProps) {
  const router = useRouter();
  const [category, setCategory] = useState<CategoryWithSettings | null>(null);
  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "redirect">("loading");

  const load = useCallback(async () => {
    if (!slugOrId?.trim()) {
      setStatus("not_found");
      return;
    }
    setStatus("loading");
    const c = await getCategoryBySlugOrId(slugOrId.trim());
    if (!c) {
      setStatus("not_found");
      return;
    }
    if (c.type !== expectedType) {
      setStatus("redirect");
      router.replace(getCategoryHref(c));
      return;
    }
    setCategory(c);
    setStatus("found");
  }, [slugOrId, expectedType, router]);

  useEffect(() => {
    load();
  }, [load]);

  /** 거래(중고) 마켓은 홈과 동일하게 RegionBar만 두고, 뒤로가기·카테고리 제목 서브헤더는 노출하지 않음 */
  const registerStickySubheader = expectedType !== "trade";

  useRegisterCategoryListStickyHeader(
    registerStickySubheader && (status === "loading" || status === "found"),
    backHref,
    status === "found" ? category : null,
    true,
  );

  if (status === "loading") {
    return (
      <div className="min-h-[200px] flex items-center justify-center text-[14px] text-gray-500">
        불러오는 중…
      </div>
    );
  }

  if (status === "not_found" || status === "redirect") {
    if (status === "not_found") {
      return (
        <div className={`${APP_MAIN_GUTTER_X_CLASS} py-8 text-center`}>
          <p className="text-[15px] font-medium text-gray-700">카테고리를 찾을 수 없습니다.</p>
          <div className="mt-4 flex justify-center">
            <AppBackButton />
          </div>
        </div>
      );
    }
    return null;
  }

  if (!category) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className={`${APP_MAIN_GUTTER_X_CLASS} py-4`}>{children(category)}</div>
    </div>
  );
}
