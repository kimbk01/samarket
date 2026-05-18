"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { BannerPlacement, BannerStatus } from "@/lib/types/admin-banner";
import { getBannerPlacements } from "@/lib/admin-banners/mock-banner-placements";
import {
  ADMIN_BANNER_PLACEMENT_KEYS,
  ADMIN_BANNER_STATUS_KEYS,
} from "./admin-banner-i18n";

export interface AdminBannerFormValues {
  title: string;
  description: string;
  imageUrl: string;
  mobileImageUrl: string;
  targetUrl: string;
  placement: BannerPlacement;
  priority: number;
  startAt: string;
  endAt: string;
  adminMemo: string;
  status: BannerStatus;
}

const DEFAULT_VALUES: AdminBannerFormValues = {
  title: "",
  description: "",
  imageUrl: "",
  mobileImageUrl: "",
  targetUrl: "",
  placement: "home_top",
  priority: 0,
  startAt: "",
  endAt: "",
  adminMemo: "",
  status: "draft",
};

interface AdminBannerFormProps {
  initial?: Partial<AdminBannerFormValues> | null;
  onSubmit: (values: AdminBannerFormValues) => void;
  submitLabel?: string;
}

export function AdminBannerForm({
  initial,
  onSubmit,
  submitLabel,
}: AdminBannerFormProps) {
  const { t } = useI18n();
  const resolvedSubmitLabel = submitLabel ?? t("common_save");
  const [values, setValues] = useState<AdminBannerFormValues>({
    ...DEFAULT_VALUES,
    ...initial,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  const placements = getBannerPlacements();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_label_title")}
        </label>
        <input
          type="text"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_title_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_label_description")}
        </label>
        <textarea
          value={values.description}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value }))
          }
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_desc_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_field_image_desktop")}
        </label>
        <input
          type="text"
          value={values.imageUrl}
          onChange={(e) => setValues((v) => ({ ...v, imageUrl: e.target.value }))}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_image_desktop_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_field_image_mobile")}
        </label>
        <input
          type="text"
          value={values.mobileImageUrl}
          onChange={(e) =>
            setValues((v) => ({ ...v, mobileImageUrl: e.target.value }))
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_image_mobile_placeholder")}
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_label_click_url")}
        </label>
        <input
          type="text"
          value={values.targetUrl}
          onChange={(e) => setValues((v) => ({ ...v, targetUrl: e.target.value }))}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder="https://..."
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_field_placement")}
        </label>
        <select
          value={values.placement}
          onChange={(e) =>
            setValues((v) => ({
              ...v,
              placement: e.target.value as BannerPlacement,
            }))
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        >
          {placements.map((p) => (
            <option key={p.key} value={p.key}>
              {t("admin_banners_placement_max_count", {
                label: t(ADMIN_BANNER_PLACEMENT_KEYS[p.key]),
                max: p.maxVisibleCount,
              })}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_field_priority")}
        </label>
        <input
          type="number"
          min={0}
          value={values.priority}
          onChange={(e) =>
            setValues((v) => ({ ...v, priority: parseInt(e.target.value, 10) || 0 }))
          }
          className="w-24 rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            {t("admin_banners_field_start")}
          </label>
          <input
            type="datetime-local"
            value={values.startAt ? values.startAt.replace("Z", "").slice(0, 16) : ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                startAt: e.target.value ? new Date(e.target.value).toISOString() : "",
              }))
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          />
        </div>
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            {t("admin_banners_field_end")}
          </label>
          <input
            type="datetime-local"
            value={values.endAt ? values.endAt.replace("Z", "").slice(0, 16) : ""}
            onChange={(e) =>
              setValues((v) => ({
                ...v,
                endAt: e.target.value ? new Date(e.target.value).toISOString() : "",
              }))
            }
            className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_banners_label_admin_memo")}
        </label>
        <textarea
          value={values.adminMemo}
          onChange={(e) =>
            setValues((v) => ({ ...v, adminMemo: e.target.value }))
          }
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          placeholder={t("admin_banners_field_memo_placeholder")}
        />
      </div>
      {initial && "status" in initial && (
        <div>
          <label className="mb-1 block sam-text-body font-medium text-sam-fg">
            {t("admin_banners_label_status")}
          </label>
          <select
            value={values.status}
            onChange={(e) =>
              setValues((v) => ({ ...v, status: e.target.value as BannerStatus }))
            }
            className="rounded border border-sam-border px-3 py-2 sam-text-body text-sam-fg"
          >
            {(Object.keys(ADMIN_BANNER_STATUS_KEYS) as BannerStatus[]).map((status) => (
              <option key={status} value={status}>
                {t(ADMIN_BANNER_STATUS_KEYS[status])}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white hover:bg-signature/90"
        >
          {resolvedSubmitLabel}
        </button>
      </div>
    </form>
  );
}
