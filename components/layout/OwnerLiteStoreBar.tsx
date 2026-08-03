"use client";

import type { MouseEventHandler } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { TradePrimaryAppBarShell } from "@/components/layout/TradePrimaryAppBarShell";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import {
  formatStoreApprovalStatusI18n,
  isStorePubliclyListed,
} from "@/lib/stores/store-approval-label-ko";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { resolveOwnerLiteStoreShortcuts } from "@/lib/delivery/owner/owner-lite-store-shortcuts";

export function OwnerLiteStoreBar({
  embedded = false,
  slim = false,
}: {
  embedded?: boolean;
  /** Notification Center — shorter strip under title */
  slim?: boolean;
}) {
  const { t } = useI18n();
  const { ownerStore } = useOwnerLiteStore();
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal(t("common_confirm"));
  const breakdown = useOwnerHubBadgeBreakdown();

  if (!ownerStore) return null;

  const storeId = encodeURIComponent(ownerStore.id);
  const { primary, secondary } = resolveOwnerLiteStoreShortcuts(ownerStore, breakdown);
  const primaryHref = primary.href;
  const primaryLabel = t(primary.labelKey);
  const primaryBadge = primary.badge;
  const secondaryHref = secondary.href;
  const secondaryLabel = t(secondary.labelKey);
  const secondaryBadge = secondary.badge;

  return (
    <TradePrimaryAppBarShell
      embedded={embedded}
      className={embedded ? "border-b-0" : "border-t border-sam-surface/40"}
    >
      {hubBlockedModal}
      <div
        className={`flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${APP_MAIN_HEADER_INNER_CLASS} ${
          slim ? "py-1.5" : "py-2"
        } pr-[max(0.75rem,env(safe-area-inset-right))]`}
      >
        <div className="min-w-0 flex-1 shrink">
          <p className="truncate sam-text-body-secondary font-semibold text-sam-fg">
            {ownerStore.store_name || t("nav_store_name_fallback")}
          </p>
          <p className="truncate sam-text-xxs text-sam-fg">
            {formatStoreApprovalStatusI18n(ownerStore.approval_status, t)}
            {!isStorePubliclyListed(ownerStore) ? t("nav_store_hidden_hint") : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <ShortcutLink
            href={primaryHref}
            label={primaryLabel}
            badge={primaryBadge}
            strong
            onClick={(e) => {
              if (shouldInterceptBusinessHubHref(primaryHref) && openBlockedModalIfNeeded()) {
                e.preventDefault();
              }
            }}
          />
          <ShortcutLink
            href={secondaryHref}
            label={secondaryLabel}
            badge={secondaryBadge}
            onClick={(e) => {
              if (shouldInterceptBusinessHubHref(secondaryHref) && openBlockedModalIfNeeded()) {
                e.preventDefault();
              }
            }}
          />
          <Link
            href={`/stores/owner?storeId=${storeId}`}
            onClick={(e) => {
              if (openBlockedModalIfNeeded()) e.preventDefault();
            }}
            className="inline-flex min-h-[36px] items-center rounded-sam-sm border border-sam-border bg-sam-surface px-3 sam-text-helper font-medium text-sam-fg"
          >
            전체
          </Link>
        </div>
      </div>
    </TradePrimaryAppBarShell>
  );
}

function ShortcutLink({
  href,
  label,
  badge,
  strong = false,
  onClick,
}: {
  href: string;
  label: string;
  badge?: number;
  strong?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center rounded-sam-sm border px-3 sam-text-helper font-semibold ${
        strong
          ? "border-sam-primary-border bg-sam-primary-soft text-sam-primary"
          : "border-sam-border bg-sam-surface text-sam-fg"
      }`}
    >
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span
          className={`ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 sam-text-xxs font-bold ${
            strong ? "bg-sam-primary text-white" : "bg-sam-danger text-white"
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
