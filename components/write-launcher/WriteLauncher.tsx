"use client";

import { useCallback, useEffect, useState } from "react";
import { getQuickCreateCategories } from "@/lib/categories/getQuickCreateCategories";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { WriteLauncherOverlay } from "./WriteLauncherOverlay";
import { WriteLauncherGroup } from "./WriteLauncherGroup";

interface WriteLauncherProps {
  onClose: () => void;
}

export function WriteLauncher({ onClose }: WriteLauncherProps) {
  const [categories, setCategories] = useState<CategoryWithSettings[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getQuickCreateCategories();
    setCategories(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byGroup = {
    content: categories.filter((c) => c.quick_create_group === "content"),
    trade: categories.filter((c) => c.quick_create_group === "trade"),
  };

  return (
    <WriteLauncherOverlay onClose={onClose}>
      <div
        className="fixed bottom-24 right-4 z-40 flex w-[280px] max-w-[calc(100vw-2rem)] flex-col items-end gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full rounded-2xl bg-white py-2 shadow-xl">
          {loading ? (
            <p className="py-8 text-center text-[14px] text-gray-500">불러오는 중…</p>
          ) : categories.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-gray-500">
              노출할 카테고리가 없습니다.
            </p>
          ) : (
            <>
              <WriteLauncherGroup groupKey="content" categories={byGroup.content} onItemClick={onClose} />
              {byGroup.content.length > 0 && byGroup.trade.length > 0 && (
                <div className="my-2 border-t border-gray-100" />
              )}
              <WriteLauncherGroup groupKey="trade" categories={byGroup.trade} onItemClick={onClose} />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-600 shadow-lg hover:bg-gray-50"
          aria-label="닫기"
        >
          <CloseIcon />
        </button>
      </div>
    </WriteLauncherOverlay>
  );
}

function CloseIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
