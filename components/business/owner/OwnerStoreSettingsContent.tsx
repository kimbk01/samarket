"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import type { StoreRow } from "@/lib/stores/db-store-mapper";

type Props = {
  row: StoreRow;
  onToggleVisible: () => void;
};

export function OwnerStoreSettingsContent({ row, onToggleVisible }: Props) {
  const { t } = useI18n();
  const q = `storeId=${encodeURIComponent(row.id)}`;
  const isApproved = row.approval_status === "approved";
  const visible = row.is_visible === true;

  return (
    <div className={OWNER_STORE_STACK_Y_CLASS}>
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("owner_store_visibility_title")}</h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          {t("owner_store_visibility_intro_before")}
          <code className="rounded bg-sam-surface-muted px-1 sam-text-helper">/stores/[slug]</code>
          {t("owner_store_visibility_intro_mid")}{" "}
          <strong className="font-semibold text-sam-fg">{t("owner_store_visibility_hidden_initial")}</strong>
          {t("owner_store_visibility_intro_tail")}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-2">
          <div className="min-w-0">
            <p className="sam-text-body font-medium text-sam-fg">
              {visible ? t("owner_store_visibility_visible_y") : t("owner_store_visibility_hidden_n")}
            </p>
            <p className="sam-text-helper text-sam-muted">
              {isApproved
                ? t("owner_store_visibility_change_anytime")
                : t("owner_store_visibility_after_approval")}
            </p>
          </div>
          <button
            type="button"
            disabled={!isApproved}
            onClick={onToggleVisible}
            className={[
              "shrink-0 rounded-ui-rect px-3 py-2 sam-text-body font-medium",
              isApproved
                ? visible
                  ? "border border-sam-border bg-sam-surface text-sam-fg"
                  : "bg-signature text-white"
                : "cursor-not-allowed border border-sam-border bg-sam-surface-muted text-sam-muted",
            ].join(" ")}
          >
            {visible ? t("owner_store_toggle_hide") : t("owner_store_toggle_show")}
          </button>
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm">
        <h2 className="sam-text-body font-semibold text-sam-fg">{t("owner_store_delivery_sound_title")}</h2>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-muted">
          {t("owner_store_delivery_sound_intro_before")}{" "}
          <strong className="font-semibold text-sam-fg">{t("owner_store_delivery_sound_shared")}</strong>
          {t("owner_store_delivery_sound_body")}
        </p>
        <p className="mt-2 sam-text-helper text-sam-muted">{t("owner_store_delivery_sound_beep_note")}</p>
        <p className="mt-3 sam-text-body-secondary text-sam-muted">
          {t("owner_store_delivery_sound_ops_prompt")}{" "}
          <Link href={`/stores/owner/ops-status?${q}`} className="font-medium text-signature underline">
            {t("owner_store_delivery_sound_ops_link")}
          </Link>{" "}
          {t("owner_store_delivery_sound_ops_suffix")}
        </p>
      </section>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-4 sam-text-body-secondary text-sam-muted">
        {t("owner_store_settings_footer_before")}{" "}
        <Link href={`/stores/owner/profile?${q}`} className="font-medium text-signature underline">
          {t("owner_store_settings_profile_link")}
        </Link>{" "}
        {t("owner_store_settings_footer_after")}
      </section>
    </div>
  );
}
