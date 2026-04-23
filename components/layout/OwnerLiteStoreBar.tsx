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
  formatStoreApprovalStatusKo,
  isStorePubliclyListed,
} from "@/lib/stores/store-approval-label-ko";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { resolveOwnerLiteStoreShortcuts } from "@/lib/stores/owner-lite-store-shortcuts";

export function OwnerLiteStoreBar() {
  const { t } = useI18n();
  const { ownerStore } = useOwnerLiteStore();
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal(t("common_confirm"));
  const breakdown = useOwnerHubBadgeBreakdown();

  if (!ownerStore) return null;

  const storeId = encodeURIComponent(ownerStore.id);
  const { primary, secondary } = resolveOwnerLiteStoreShortcuts(ownerStore, breakdown);
  const primaryHref = primary.href;
  const primaryLabel = primary.label;
  const primaryBadge = primary.badge;
  const secondaryHref = secondary.href;
  const secondaryLabel = secondary.label;
  const secondaryBadge = secondary.badge;

  return (
    <TradePrimaryAppBarShell className="border-t border-sam-surface/40">
      {hubBlockedModal}
      <div
        className={`flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${APP_MAIN_HEADER_INNER_CLASS}`}
      >
        <div className="min-w-0 flex-1 shrink">
          <p className="truncate sam-text-body-secondary font-semibold text-sam-fg">
            {ownerStore.store_name || t("nav_store_name_fallback")}
          </p>
          <p className="truncate sam-text-xxs text-sam-fg">
            {formatStoreApprovalStatusKo(ownerStore.approval_status)}
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
            href={`/my/business?storeId=${storeId}`}
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
