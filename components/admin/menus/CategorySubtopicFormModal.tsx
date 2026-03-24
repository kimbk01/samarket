"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryWithSettings } from "@/lib/categories/types";
import {
  createCategory,
  type CreateCategorySettingsPayload,
} from "@/lib/categories/admin/createCategory";
import { updateCategoryAdmin } from "@/lib/categories/admin/updateCategory";
import { validateSlugFormat } from "@/lib/categories/validateSlug";
import { checkSlugAvailable } from "@/lib/categories/admin/checkSlugAvailable";

function settingsPayloadFrom(cat: CategoryWithSettings): CreateCategorySettingsPayload {
  const s = cat.settings;
  return {
    can_write: s?.can_write ?? true,
    has_price: s?.has_price ?? false,
    has_chat: s?.has_chat ?? false,
    has_location: s?.has_location ?? false,
    has_direct_deal: s?.has_direct_deal ?? true,
    has_free_share: s?.has_free_share ?? true,
    post_type: s?.post_type ?? "normal",
  };
}

interface CategorySubtopicFormModalProps {
  parent: CategoryWithSettings;
  /** 수정 시 */
  category?: CategoryWithSettings | null;
  nextSortOrder: number;
  onDone: () => void;
  onClose: () => void;
}

/** 메뉴(중고) 하위 주제 — 홈 2행 칩용 */
export function CategorySubtopicFormModal({
  parent,
  category,
  nextSortOrder,
  onDone,
  onClose,
}: CategorySubtopicFormModalProps) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [sort_order, setSortOrder] = useState(category?.sort_order ?? nextSortOrder);
  const [is_active, setIsActive] = useState(category?.is_active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setSlug(category.slug);
      setSortOrder(category.sort_order);
      setIsActive(category.is_active);
    } else {
      setSortOrder(nextSortOrder);
    }
  }, [category, nextSortOrder]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSlugError(null);
      const slugTrim = slug.trim();
      if (!name.trim() || !slugTrim) return;

      const formatCheck = validateSlugFormat(slugTrim);
      if (!formatCheck.ok) {
        setSlugError(formatCheck.error);
        return;
      }
      const slugCheck = await checkSlugAvailable(slugTrim, category?.id);
      if (!slugCheck.available) {
        setSlugError(slugCheck.error);
        return;
      }

      setSubmitting(true);
      try {
        if (category) {
          const res = await updateCategoryAdmin(
            category.id,
            {
              name: name.trim(),
              slug: slugTrim,
              icon_key: category.icon_key,
              type: category.type,
              sort_order,
              is_active,
              description: category.description,
              quick_create_enabled: category.quick_create_enabled,
              quick_create_group: category.quick_create_group,
              quick_create_order: category.quick_create_order,
              show_in_home_chips: false,
              parent_id: category.parent_id ?? parent.id,
            },
            settingsPayloadFrom(category)
          );
          if (!res.ok) {
            setSlugError(res.error);
            return;
          }
        } else {
          const res = await createCategory(
            {
              name: name.trim(),
              slug: slugTrim,
              icon_key: parent.icon_key,
              type: parent.type,
              sort_order,
              is_active,
              description: null,
              quick_create_enabled: false,
              quick_create_group: null,
              quick_create_order: 0,
              show_in_home_chips: false,
              parent_id: parent.id,
            },
            settingsPayloadFrom(parent)
          );
          if (!res.ok) {
            setSlugError(res.error);
            return;
          }
        }
        onDone();
        onClose();
      } finally {
        setSubmitting(false);
      }
    },
    [name, slug, sort_order, is_active, category, parent, onDone, onClose]
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-lg"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 className="mb-1 text-[17px] font-semibold text-gray-900">
          {category ? "주제 수정" : "주제 추가"}
        </h2>
        <p className="mb-4 text-[13px] text-gray-500">
          상위 메뉴: <span className="font-medium text-gray-700">{parent.name}</span> — 홈·마켓 2행 칩에만 노출됩니다.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-gray-700">주제명 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              required
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-700">slug * (영문 소문자, 숫자, 하이픈)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                setSlugError(null);
              }}
              className="mt-1 w-full rounded border border-gray-200 px-3 py-2 text-[14px]"
              required
            />
            {slugError && <p className="mt-1 text-[12px] text-red-600">{slugError}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-[13px] font-medium text-gray-700">순서</label>
              <input
                type="number"
                value={sort_order}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className="mt-1 w-24 rounded border border-gray-200 px-2 py-1.5 text-[14px]"
              />
            </div>
            <label className="mt-6 flex cursor-pointer items-center gap-2 text-[14px] text-gray-700">
              <input
                type="checkbox"
                checked={is_active}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              사용
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-signature px-4 py-2 text-[14px] font-medium text-white hover:bg-signature/90 disabled:opacity-50"
            >
              {submitting ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
