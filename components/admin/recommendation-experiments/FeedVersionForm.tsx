"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { FeedVersion, FeedVersionSurface } from "@/lib/types/recommendation-experiment";
import { recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";

interface FeedVersionFormProps {
  initial: FeedVersion;
  onSubmit: (values: Partial<FeedVersion>) => void;
  onCancel?: () => void;
}

const SURFACES: FeedVersionSurface[] = ["home", "search", "shop"];

export function FeedVersionForm({
  initial,
  onSubmit,
  onCancel,
}: FeedVersionFormProps) {
  const { t } = useI18n();
  const [versionName, setVersionName] = useState(initial.versionName);
  const [versionKey, setVersionKey] = useState(initial.versionKey);
  const [surface, setSurface] = useState(initial.surface);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [dedupeStrategy, setDedupeStrategy] = useState(initial.dedupeStrategy);
  const [notes, setNotes] = useState(initial.notes);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial.id,
      versionKey,
      versionName,
      surface,
      isActive,
      sectionConfig: initial.sectionConfig,
      scoringOverrides: initial.scoringOverrides,
      dedupeStrategy,
      notes,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_version_key")}
        </label>
        <input
          type="text"
          value={versionKey}
          onChange={(e) => setVersionKey(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_version_name")}
        </label>
        <input
          type="text"
          value={versionName}
          onChange={(e) => setVersionName(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_th_surface")}
        </label>
        <select
          value={surface}
          onChange={(e) => setSurface(e.target.value as FeedVersionSurface)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {recSurfaceLabel(t, s)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="fvActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="fvActive" className="sam-text-body text-sam-fg">
          {t("admin_rec_exp_label_active")}
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_dedup")}
        </label>
        <select
          value={dedupeStrategy}
          onChange={(e) =>
            setDedupeStrategy(e.target.value as "global" | "per_section")
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="global">{t("admin_rec_exp_dedup_global")}</option>
          <option value="per_section">{t("admin_rec_exp_dedup_per_section")}</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_rec_th_note")}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {t("common_save")}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 sam-text-body text-sam-fg"
          >
            {t("common_cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
