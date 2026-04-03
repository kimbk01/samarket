"use client";

import type { MouseEventHandler } from "react";
import Link from "next/link";
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
  const { ownerStore } = useOwnerLiteStore();
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal("확인");
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
    <TradePrimaryAppBarShell className="border-t border-white/40">
      {hubBlockedModal}
      <div
        className={`flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${APP_MAIN_HEADER_INNER_CLASS}`}
      >
        <div className="min-w-0 flex-1 shrink">
          <p className="truncate text-[13px] font-semibold text-gray-900">
            {ownerStore.store_name || "내 매장"}
          </p>
          <p className="truncate text-[11px] text-gray-700">
            {formatStoreApprovalStatusKo(ownerStore.approval_status)}
            {!isStorePubliclyListed(ownerStore) ? " · 고객 /stores 목록 미노출" : ""}
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
            className="inline-flex min-h-[36px] items-center rounded-full border border-white/80 bg-white/60 px-3 text-[12px] font-medium text-gray-700"
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
      className={`inline-flex min-h-[36px] items-center rounded-full px-3 text-[12px] font-semibold ${
        strong
          ? "bg-gray-900 text-white shadow-sm"
          : "border border-white/80 bg-white/80 text-gray-800"
      }`}
    >
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span
          className={`ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
            strong ? "bg-white/20 text-white" : "bg-red-600 text-white"
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}
