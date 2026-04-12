"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getGroupedCategories } from "@/lib/categories/getGroupedCategories";
import type { GroupedCategories } from "@/lib/categories/getGroupedCategories";
import { ServiceCategoryGrid } from "./ServiceCategoryGrid";

const GROUP_LABELS: Record<keyof Omit<GroupedCategories, "all">, string> = {
  trade: "동네 거래",
  service: "동네 서비스",
  community: "동네 이야기",
  feature: "금융/혜택",
};

export function AllServicesSection() {
  const { tt } = useI18n();
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
      setError((e as Error).message ?? tt("카테고리를 불러올 수 없습니다."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-12 text-center text-[14px] text-sam-muted shadow-sm">
        {tt("불러오는 중…")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-8 text-center text-[14px] text-red-500 shadow-sm">
        {error}
      </div>
    );
  }

  if (!grouped || grouped.all.length === 0) {
    return (
      <div className="rounded-ui-rect bg-sam-surface py-12 text-center text-[14px] text-sam-muted shadow-sm">
        {tt("등록된 카테고리가 없습니다.")}
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
            <h2 className="mb-3 text-[15px] font-semibold text-sam-fg">
              {tt(GROUP_LABELS[type])}
            </h2>
            <ServiceCategoryGrid categories={list} maxItems={0} />
          </section>
        );
      })}
    </div>
  );
}
