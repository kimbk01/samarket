"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import type { PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/personalized-section-labels";

interface PersonalizedPolicyFormProps {
  initial: PersonalizedFeedPolicy;
  onSubmit: (values: Partial<PersonalizedFeedPolicy>) => void;
  onCancel?: () => void;
}

const WEIGHT_KEYS = [
  "categoryAffinityWeight",
  "recentViewWeight",
  "recentFavoriteWeight",
  "recentChatWeight",
  "premiumBoostWeight",
  "businessBoostWeight",
  "nearbyWeight",
  "recencyWeight",
] as const;

const WEIGHT_LABEL_KEYS: Record<(typeof WEIGHT_KEYS)[number], MessageKey> = {
  categoryAffinityWeight: "admin_personalized_feed_weight_category_affinity",
  recentViewWeight: "admin_personalized_feed_weight_recent_view",
  recentFavoriteWeight: "admin_personalized_feed_weight_favorite",
  recentChatWeight: "admin_personalized_feed_weight_chat",
  premiumBoostWeight: "admin_personalized_feed_weight_premium_boost",
  businessBoostWeight: "admin_personalized_feed_weight_shop_boost",
  nearbyWeight: "admin_personalized_feed_weight_nearby",
  recencyWeight: "admin_personalized_feed_weight_recency",
};

export function PersonalizedPolicyForm({
  initial,
  onSubmit,
  onCancel,
}: PersonalizedPolicyFormProps) {
  const { t } = useI18n();
  const [sectionLabel, setSectionLabel] = useState(initial.sectionLabel);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [maxItems, setMaxItems] = useState(initial.maxItems);
  const [dedupeEnabled, setDedupeEnabled] = useState(initial.dedupeEnabled);
  const [weights, setWeights] = useState({
    categoryAffinityWeight: initial.categoryAffinityWeight,
    recentViewWeight: initial.recentViewWeight,
    recentFavoriteWeight: initial.recentFavoriteWeight,
    recentChatWeight: initial.recentChatWeight,
    premiumBoostWeight: initial.premiumBoostWeight,
    businessBoostWeight: initial.businessBoostWeight,
    nearbyWeight: initial.nearbyWeight,
    recencyWeight: initial.recencyWeight,
  });
  const [adminMemo, setAdminMemo] = useState(initial.adminMemo ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: initial.id,
      sectionKey: initial.sectionKey,
      sectionLabel,
      isActive,
      maxItems,
      dedupeEnabled,
      ...weights,
      adminMemo: adminMemo || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_personalized_feed_form_section", { section: PERSONALIZED_SECTION_LABELS[initial.sectionKey] })}
      </p>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_personalized_feed_label_section_label")}
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
          id="pfpActive"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="pfpActive" className="sam-text-body text-sam-fg">
          {t("admin_personalized_feed_label_active")}
        </label>
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_personalized_feed_label_max_items")}
        </label>
        <input
          type="number"
          min={1}
          max={20}
          value={maxItems}
          onChange={(e) => setMaxItems(Number(e.target.value) || 1)}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="pfpDedupe"
          checked={dedupeEnabled}
          onChange={(e) => setDedupeEnabled(e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="pfpDedupe" className="sam-text-body text-sam-fg">
          {t("admin_personalized_feed_label_dedupe")}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WEIGHT_KEYS.map((key) => (
          <div key={key}>
            <label className="mb-0.5 block sam-text-helper text-sam-muted">
              {t(WEIGHT_LABEL_KEYS[key])}
            </label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={weights[key]}
              onChange={(e) =>
                setWeights((w) => ({ ...w, [key]: parseFloat(e.target.value) || 0 }))
              }
              className="w-full rounded border border-sam-border px-2 py-1.5 sam-text-body"
            />
          </div>
        ))}
      </div>
      <div>
        <label className="mb-1 block sam-text-body font-medium text-sam-fg">
          {t("admin_personalized_feed_label_admin_memo")}
        </label>
        <textarea
          value={adminMemo}
          onChange={(e) => setAdminMemo(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex gap-2">
        <AdminActionButton type="submit" variant="primary">
          {t("admin_personalized_feed_action_save")}
        </AdminActionButton>
        {onCancel && (
          <AdminActionButton variant="secondary" onClick={onCancel}>
            {t("admin_personalized_feed_action_cancel")}
          </AdminActionButton>
        )}
      </div>
    </form>
  );
}
