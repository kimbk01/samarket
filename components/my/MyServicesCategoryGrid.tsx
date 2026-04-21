"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getActiveCategories } from "@/lib/categories/getActiveCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { ServiceCategoryGrid } from "@/components/home/ServiceCategoryGrid";

/**
 * 나의 카마켓 서비스 영역: DB 카테고리 기준 그리드 + 전체 서비스 링크
 */
export function MyServicesCategoryGrid() {
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
      <div className="rounded-ui-rect bg-sam-surface py-8 text-center sam-text-body text-sam-muted shadow-sm">
        불러오는 중…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-6 text-center sam-text-body text-red-500 shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="mb-2 px-1 sam-text-body-secondary font-medium text-sam-muted">서비스</h2>
        <Link href="/services" className="sam-text-body-secondary text-signature">
          전체 서비스
        </Link>
      </div>
      <ServiceCategoryGrid categories={categories} maxItems={8} />
    </div>
  );
}
