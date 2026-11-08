"use client";

import { useCallback, useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getGroupedCategories } from "@/lib/categories/getGroupedCategories";
import type { GroupedCategories } from "@/lib/categories/getGroupedCategories";
import { ServiceCategoryGrid } from "./ServiceCategoryGrid";

/** 언어 SSOT S6: 그룹 이름은 카탈로그 키(이전 tt 역검색이 고르던 키와 같은 값) */
const GROUP_LABELS: Record<keyof Omit<GroupedCategories, "all">, MessageKey> = {
  trade: "home_group_trade",
  service: "home_group_service",
  community: "home_group_community",
  feature: "home_group_feature",
};

export function AllServicesSection() {
  const { t } = useI18n();
  const [grouped, setGrouped] = useState<GroupedCategories | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGroupedCategories();
      setGrouped(data);
    } catch (e) {
      setError((e as Error).message ?? t("my_services_load_failed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-12 text-center sam-text-body text-sam-muted shadow-sm">
        {t("common_loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-8 text-center sam-text-body text-red-500 shadow-sm">
        {error}
      </div>
    );
  }

  if (!grouped || grouped.all.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-12 text-center sam-text-body text-sam-muted shadow-sm">
        {t("home_categories_empty")}
      </div>
    );
  }

  const types: (keyof Omit<GroupedCategories, "all">)[] = ["trade", "service", "community", "feature"];

  return (
    <div className="space-y-6">
      {types.map((type) => {
        const list = grouped[type];
        if (list.length === 0) return null;
        return (
          <section key={type}>
            <h2 className="mb-3 sam-text-body font-semibold text-sam-fg">
              {t(GROUP_LABELS[type])}
            </h2>
            <ServiceCategoryGrid categories={list} maxItems={0} />
          </section>
        );
      })}
    </div>
  );
}
