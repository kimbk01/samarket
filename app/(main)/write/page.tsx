"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getCategories } from "@/lib/categories/getCategories";
import { getWriteHref } from "@/lib/categories/getCategoryHref";
import type { CategoryWithSettings } from "@/lib/types/category";
import { CATEGORY_TYPE_LABELS } from "@/lib/types/category";

/**
 * 글쓰기 진입: 카테고리 선택 후 타입별 분기
 * - trade: 가격+채팅 → /products/new
 * - community: 가격 없음 → /posts/new?type=community
 * - service: 요청형 폼 → /posts/new?type=service
 * - feature: 페이지 이동 (link)
 */
export default function WritePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);

  useEffect(() => {
    getCategories({ activeOnly: true }).then(setCategories);
  }, []);

  const handleSelect = useCallback(
    (c: CategoryWithSettings) => {
      if (!c.settings?.can_write) return;
      router.push(getWriteHref(c));
    },
    [router]
  );

  const byType = {
    trade: categories.filter((x) => x.type === "trade"),
    service: categories.filter((x) => x.type === "service"),
    community: categories.filter((x) => x.type === "community"),
    feature: categories.filter((x) => x.type === "feature"),
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7]">
      <div className="mx-auto max-w-[480px] space-y-5 px-4 py-5">
        {(Object.keys(byType) as Array<keyof typeof byType>).map((type) => {
          const list = byType[type];
          if (list.length === 0) return null;
          return (
            <div key={type}>
              <h2 className="mb-2 text-[13px] font-semibold text-[#666666]">
                {CATEGORY_TYPE_LABELS[type]}
              </h2>
              <ul className="space-y-1 rounded-ui-rect bg-white shadow-sm">
                {list.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c)}
                      disabled={!c.settings?.can_write}
                      className="flex min-h-[44px] w-full items-center justify-between px-4 py-3 text-left text-[16px] text-gray-900 disabled:opacity-50"
                    >
                      <span>{c.name}</span>
                      <span className="text-gray-400">›</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
