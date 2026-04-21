"use client";

import { useEffect, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { getChildCategories } from "@/lib/categories/getChildCategories";

interface WriteTradeTopicSectionProps {
  category: CategoryWithSettings;
  /** 빈 문자열이면 글의 trade_category_id는 상위 메뉴 id */
  value: string;
  onChange: (childCategoryId: string) => void;
}

/**
 * 상위 거래 메뉴에 하위 주제가 1개 이상일 때만 노출. 가로 배치 단일 선택(체크박스). 없으면 렌더하지 않음.
 */
export function WriteTradeTopicSection({ category, value, onChange }: WriteTradeTopicSectionProps) {
  const [topics, setTopics] = useState<CategoryWithSettings[]>([]);

  useEffect(() => {
    if (category.parent_id) {
      setTopics([]);
      return;
    }
    let cancelled = false;
    getChildCategories(category.id).then((list) => {
      if (!cancelled) setTopics(list);
    });
    return () => {
      cancelled = true;
    };
  }, [category.id, category.parent_id]);

  if (category.parent_id || topics.length === 0) return null;

  return (
    <section className="border-b border-sam-border-soft bg-sam-surface px-4 py-3">
      <p className="mb-2 sam-text-body font-medium text-sam-fg">
        주제 <span className="font-normal text-sam-muted">(하나만 선택)</span>
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value === ""}
            onChange={(e) => {
              if (e.target.checked) onChange("");
            }}
            className="rounded border-sam-border"
          />
          <span className="sam-text-body text-sam-fg">전체</span>
        </label>
        {topics.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={value === t.id}
              onChange={(e) => {
                if (e.target.checked) onChange(t.id);
                else if (value === t.id) onChange("");
              }}
              className="rounded border-sam-border"
            />
            <span className="sam-text-body text-sam-fg">{t.name}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

/** 글 저장용 카테고리 id */
export function resolveTradeWriteCategoryId(category: CategoryWithSettings, selectedChildId: string): string {
  if (category.parent_id) return category.id;
  return selectedChildId.trim() || category.id;
}
