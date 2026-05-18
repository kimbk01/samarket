"use client";

import { useCallback, useEffect, useState } from "react";
import type { CategoryWithSettings, CategoryType } from "@/lib/types/category";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  adminCategoryTypeLabelKey,
  adminPostTypeLabelKey,
} from "@/lib/admin/categories/admin-category-label-keys";
import { POST_TYPE_OPTIONS } from "@/lib/types/category";

interface CategoryEditModalProps {
  category?: CategoryWithSettings | null;
  onSave: (
    payload: { name: string; slug: string; icon_key: string; type: CategoryType; description: string | null },
    settings: { can_write: boolean; has_price: boolean; has_chat: boolean; has_location: boolean; post_type: string }
  ) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function CategoryEditModal({
  category,
  onSave,
  onDelete,
  onClose,
}: CategoryEditModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [icon_key, setIconKey] = useState(category?.icon_key ?? "default");
  const [type, setType] = useState<CategoryType>(category?.type ?? "trade");
  const [description, setDescription] = useState(category?.description ?? "");
  const [can_write, setCanWrite] = useState(category?.settings?.can_write ?? true);
  const [has_price, setHasPrice] = useState(category?.settings?.has_price ?? false);
  const [has_chat, setHasChat] = useState(category?.settings?.has_chat ?? false);
  const [has_location, setHasLocation] = useState(category?.settings?.has_location ?? false);
  const [post_type, setPostType] = useState(category?.settings?.post_type ?? "post");

  useEffect(() => {
    if (category) {
      setName(category.name);
      setSlug(category.slug);
      setIconKey(category.icon_key);
      setType(category.type);
      setDescription(category.description ?? "");
      setCanWrite(category.settings?.can_write ?? true);
      setHasPrice(category.settings?.has_price ?? false);
      setHasChat(category.settings?.has_chat ?? false);
      setHasLocation(category.settings?.has_location ?? false);
      setPostType(category.settings?.post_type ?? "post");
    }
  }, [category]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !slug.trim()) return;
      onSave(
        { name: name.trim(), slug: slug.trim(), icon_key, type, description: description.trim() || null },
        { can_write, has_price, has_chat, has_location, post_type }
      );
    },
    [name, slug, icon_key, type, description, can_write, has_price, has_chat, has_location, post_type, onSave]
  );

  const isCreate = !category;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-ui-rect bg-sam-surface p-4 shadow-sam-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 sam-text-section-title font-semibold text-sam-fg">
          {isCreate ? t("admin_cat_form_add") : t("admin_cat_form_edit")}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("admin_cat_label_name_short")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
              required
            />
          </div>
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">slug *</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
              required
            />
          </div>
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("admin_cat_label_icon_key")}</label>
            <input
              type="text"
              value={icon_key}
              onChange={(e) => setIconKey(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("admin_cat_label_type")}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CategoryType)}
              className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              {(["trade", "service", "community", "feature"] as const).map((typ) => (
                <option key={typ} value={typ}>
                  {t(adminCategoryTypeLabelKey(typ))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block sam-text-body-secondary font-medium text-sam-fg">{t("admin_cat_label_desc")}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          <div className="border-t border-sam-border-soft pt-4">
            <p className="mb-2 sam-text-body-secondary font-medium text-sam-fg">{t("admin_cat_features_toggle")}</p>
            <div className="space-y-2">
              <LabelCheck checked={can_write} onChange={setCanWrite} label={t("admin_cat_feat_write_alt")} />
              <LabelCheck checked={has_price} onChange={setHasPrice} label={t("admin_cat_feat_price")} />
              <LabelCheck checked={has_chat} onChange={setHasChat} label={t("admin_cat_feat_chat")} />
              <LabelCheck checked={has_location} onChange={setHasLocation} label={t("admin_cat_feat_location")} />
              <div>
                <label className="block sam-text-helper text-sam-muted">post_type</label>
                <select
                  value={post_type}
                  onChange={(e) => setPostType(e.target.value)}
                  className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body"
                >
                  {POST_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(adminPostTypeLabelKey(o.value))}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-4">
            <button type="submit" className="rounded-ui-rect bg-signature px-4 py-2 sam-text-body font-medium text-white">
              {t("common_save")}
            </button>
            <button type="button" onClick={onClose} className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body text-sam-fg">
              {t("common_cancel")}
            </button>
            {!isCreate && onDelete && (
              <button type="button" onClick={onDelete} className="rounded-ui-rect border border-red-200 bg-red-50 px-4 py-2 sam-text-body text-red-700">
                {t("admin_cat_delete")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function LabelCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded" />
      <span className="sam-text-body-secondary text-sam-fg">{label}</span>
    </label>
  );
}
