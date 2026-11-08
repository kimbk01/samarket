"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import type {
  HomeFeedPolicy,
  HomeFeedSectionKey,
  HomeFeedSortMode,
  HomeFeedRegionScope,
} from "@/lib/types/home-feed";
import {
  SECTION_LABELS,
  SORT_MODE_LABELS,
  REGION_SCOPE_LABELS,
} from "@/lib/home-feed/home-feed-labels";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

interface HomeFeedPolicyFormProps {
  initial: HomeFeedPolicy;
  onSubmit: (values: Partial<HomeFeedPolicy>) => void;
  onCancel?: () => void;
}

const SORT_OPTIONS: HomeFeedSortMode[] = [
  "featured",
  "latest",
  "nearby",
  "popular",
  "mixed",
];
const REGION_OPTIONS: HomeFeedRegionScope[] = ["barangay", "city", "region"];

export function HomeFeedPolicyForm({
  initial,
  onSubmit,
  onCancel,
}: HomeFeedPolicyFormProps) {
  const { t } = useI18n();
  const [sectionLabel, setSectionLabel] = useState(initial.sectionLabel);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [sortMode, setSortMode] = useState(initial.sortMode);
  const [maxItems, setMaxItems] = useState(initial.maxItems);
  const [allowSponsoredMix, setAllowSponsoredMix] = useState(
    initial.allowSponsoredMix
  );
  const [allowPremiumBoost, setAllowPremiumBoost] = useState(
    initial.allowPremiumBoost
  );
  const [allowBusinessBoost, setAllowBusinessBoost] = useState(
    initial.allowBusinessBoost
  );
  const [allowPointPromotionBoost, setAllowPointPromotionBoost] = useState(
    initial.allowPointPromotionBoost
  );
  const [dedupeEnabled, setDedupeEnabled] = useState(initial.dedupeEnabled);
  const [regionScope, setRegionScope] = useState(initial.regionScope);
  const [priorityOrder, setPriorityOrder] = useState(initial.priorityOrder);
  const [adminMemo, setAdminMemo] = useState(initial.adminMemo ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial.id,
      sectionKey: initial.sectionKey,
      sectionLabel,
      isActive,
      sortMode,
      maxItems,
      allowSponsoredMix,
      allowPremiumBoost,
      allowBusinessBoost,
      allowPointPromotionBoost,
      dedupeEnabled,
      regionScope,
      priorityOrder,
      adminMemo: adminMemo || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_home_feed_form_section_value", { section: SECTION_LABELS[initial.sectionKey] })}
      </p>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_home_feed_form_section_label")}
        </label>
        <input
          type="text"
          value={sectionLabel}
          onChange={(e) => setSectionLabel(e.target.value)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="hfpActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="hfpActive" className="sam-text-body text-sam-fg">
          {t("admin_home_feed_form_active")}
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_home_feed_form_sort")}
        </label>
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as HomeFeedSortMode)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {SORT_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {SORT_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_home_feed_form_max_items")}
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={maxItems}
          onChange={(e) => setMaxItems(Number(e.target.value) || 1)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_home_feed_form_region_scope")}
        </label>
        <select
          value={regionScope}
          onChange={(e) =>
            setRegionScope(e.target.value as HomeFeedRegionScope)
          }
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {REGION_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {REGION_SCOPE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_home_feed_form_order")}
        </label>
        <input
          type="number"
          min={0}
          value={priorityOrder}
          onChange={(e) => setPriorityOrder(Number(e.target.value) || 0)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={allowSponsoredMix}
            onChange={(e) => setAllowSponsoredMix(e.target.checked)}
            className="rounded border-sam-border"
          />
          {t("admin_home_feed_form_ad_mix")}
        </label>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={allowPremiumBoost}
            onChange={(e) => setAllowPremiumBoost(e.target.checked)}
            className="rounded border-sam-border"
          />
          {t("admin_home_feed_form_premium_boost")}
        </label>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={allowBusinessBoost}
            onChange={(e) => setAllowBusinessBoost(e.target.checked)}
            className="rounded border-sam-border"
          />
          {t("admin_home_feed_form_store_boost")}
        </label>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={allowPointPromotionBoost}
            onChange={(e) => setAllowPointPromotionBoost(e.target.checked)}
            className="rounded border-sam-border"
          />
          {t("admin_home_feed_form_point_promotion")}
        </label>
        <label className="flex items-center gap-2 sam-text-body text-sam-fg">
          <input
            type="checkbox"
            checked={dedupeEnabled}
            onChange={(e) => setDedupeEnabled(e.target.checked)}
            className="rounded border-sam-border"
          />
          {t("admin_home_feed_form_dedupe")}
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_home_feed_form_admin_memo")}
        </label>
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex gap-2">
        <AdminActionButton
          type="submit"
          variant="primary"
        >
          {t("admin_home_feed_form_save")}
        </AdminActionButton>
        {onCancel && (
          <AdminActionButton
            onClick={onCancel}
            variant="secondary"
          >
            {t("admin_home_feed_form_cancel")}
          </AdminActionButton>
        )}
      </div>
    </form>
  );
}
