"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";

interface SettingsAdminEntryProps {
  /** 플랫폼 관리자 — `/admin` */
  showAdmin: boolean;
  /** 내 매장 소유 — `/stores/owner` (관리자와 별도) */
  showStoreOwner: boolean;
}

export function SettingsAdminEntry({ showAdmin, showStoreOwner }: SettingsAdminEntryProps) {
  const { t } = useI18n();
  const { goBusinessHubOrModal, hubBlockedModal } = useStoreBusinessHubEntryModal(t("common_confirm"));
  if (!showAdmin && !showStoreOwner) return null;
  return (
    <section className="mt-6 rounded-ui-rect bg-sam-surface px-4 py-4 shadow-sm">
      <div className="mb-3">
        <h2 className="sam-text-body-secondary font-medium text-sam-muted">{t("settings_admin_shortcuts")}</h2>
        <p className="mt-1 sam-text-helper leading-relaxed text-sam-muted">{t("settings_admin_shortcuts_desc")}</p>
      </div>
      <div className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border-soft">
        {showAdmin ? (
          <Link
            href="/admin"
            className="flex items-center justify-between px-4 py-3 sam-text-body font-medium text-signature"
          >
            <span>{t("settings_admin_portal")}</span>
            <ChevronRight />
          </Link>
        ) : null}
        {showStoreOwner ? (
          <button
            type="button"
            onClick={() => goBusinessHubOrModal("/stores/owner")}
            className="flex w-full items-center justify-between px-4 py-3 text-left sam-text-body font-medium text-sam-fg"
          >
            <span>{t("settings_store_admin_portal")}</span>
            <ChevronRight className="text-sam-meta" />
          </button>
        ) : null}
      </div>
      {hubBlockedModal}
    </section>
  );
}

function ChevronRight({ className = "text-signature" }: { className?: string }) {
  return (
    <svg
      className={`h-5 w-5 shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
