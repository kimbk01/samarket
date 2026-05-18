"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getActiveCategories } from "@/lib/categories/getActiveCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { ServiceCategoryGrid } from "@/components/home/ServiceCategoryGrid";

/**
 * 나의 카마켓 서비스 영역: DB 카테고리 기준 그리드 + 전체 서비스 링크
 */
export function MyServicesCategoryGrid() {
  const { t } = useI18n();
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading((prev) => (prev ? prev : true));
    setError((prev) => (prev === null ? prev : null));
    try {
      const list = await getActiveCategories();
      setCategories((prev) => {
        if (prev.length !== list.length) return list;
        for (let i = 0; i < prev.length; i += 1) {
          const a = prev[i];
          const b = list[i];
          if (
            a?.id !== b?.id ||
            a?.name !== b?.name ||
            a?.slug !== b?.slug ||
            a?.is_active !== b?.is_active
          ) {
            return list;
          }
        }
        return prev;
      });
    } catch (e) {
      setError((e as Error).message ?? t("my_services_load_failed"));
    } finally {
      setLoading((prev) => (prev ? false : prev));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-8 text-center sam-text-body text-sam-muted shadow-sm">
        {t("common_loading")}
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
        <h2 className="mb-2 px-1 sam-text-body-secondary font-medium text-sam-muted">{t("my_services_title")}</h2>
        <Link href="/services" className="sam-text-body-secondary text-signature">
          {t("my_services_all")}
        </Link>
      </div>
      <ServiceCategoryGrid categories={categories} maxItems={8} />
    </div>
  );
}
