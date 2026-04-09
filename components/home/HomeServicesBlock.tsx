"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getActiveCategories } from "@/lib/categories/getActiveCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { ServiceCategoryGrid } from "./ServiceCategoryGrid";

/**
 * 홈용 서비스 블록: DB 카테고리 그리드 + 전체 서비스 링크
 */
export function HomeServicesBlock() {
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getActiveCategories();
      setCategories(list);
    } catch (e) {
      setError((e as Error).message ?? "카테고리를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-ui-rect bg-white py-8 text-center text-[14px] text-gray-500 shadow-sm">
        불러오는 중…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-ui-rect bg-white py-6 text-center text-[14px] text-red-500 shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-0">
        <h2 className="text-[15px] font-semibold text-gray-900">서비스</h2>
        <Link href="/services" className="text-[14px] font-medium text-gray-700 hover:text-signature">
          전체 서비스
        </Link>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]">
        <ServiceCategoryGrid categories={categories} maxItems={12} />
      </div>
    </div>
  );
}
