"use client";

import Link from "next/link";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { TradePrimaryAppBarShell } from "@/components/layout/TradePrimaryAppBarShell";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import {
  formatStoreApprovalStatusKo,
  isStorePubliclyListed,
} from "@/lib/stores/store-approval-label-ko";

function computeCanSell(
  sales:
    | {
        allowed_to_sell?: boolean;
        sales_status?: string | null;
      }
    | null
    | undefined
) {
  return !!sales && sales.allowed_to_sell === true && sales.sales_status === "approved";
}

export function OwnerLiteStoreBar() {
  const { ownerStore } = useOwnerLiteStore();
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal("확인");
  const { inquiryAttention, orderAttention, storeOrderChatUnread, storeDeepLink } =
    useOwnerHubBadgeBreakdown();

  if (!ownerStore) return null;

  const canSell = computeCanSell(ownerStore.sales_permission);
  const storeId = encodeURIComponent(ownerStore.id);
  const profileHref = `/my/business/profile?storeId=${storeId}`;
  const basicInfoHref = `/my/business/basic-info?storeId=${storeId}`;
  const orderHref = buildStoreOrdersHref({ storeId: ownerStore.id, tab: "new" });
  const inquiryHref = `/my/business/inquiries?storeId=${storeId}`;
  const primaryHref =
    inquiryAttention > 0
      ? storeDeepLink ?? inquiryHref
      : canSell && orderAttention > 0
        ? storeDeepLink ?? orderHref
      : storeOrderChatUnread > 0
        ? storeDeepLink ?? SAMARKET_ROUTES.orders.storeOrders
        : canSell
        ? storeDeepLink ?? orderHref
        : profileHref;
  const primaryLabel =
    inquiryAttention > 0
      ? "문의 확인"
      : canSell && orderAttention > 0
        ? "주문 관리"
      : storeOrderChatUnread > 0
        ? "배달채팅"
        : canSell
          ? "주문 관리"
          : "매장 설정";
  const primaryBadge =
    inquiryAttention > 0
      ? inquiryAttention
      : canSell && orderAttention > 0
        ? orderAttention
        : storeOrderChatUnread > 0
          ? storeOrderChatUnread
          : orderAttention;
  const secondaryHref =
    inquiryAttention > 0 ? (canSell ? orderHref : basicInfoHref) : canSell ? inquiryHref : basicInfoHref;
  const secondaryLabel =
    inquiryAttention > 0 ? (canSell ? "주문 관리" : "기본 정보") : canSell ? "받은 문의" : "기본 정보";
  const secondaryBadge = inquiryAttention > 0 ? orderAttention : canSell ? inquiryAttention : 0;

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
          <ShortcutLink href={primaryHref} label={primaryLabel} badge={primaryBadge} strong />
          <ShortcutLink href={secondaryHref} label={secondaryLabel} badge={secondaryBadge} />
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
}: {
  href: string;
  label: string;
  badge?: number;
  strong?: boolean;
}) {
  return (
    <Link
      href={href}
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
