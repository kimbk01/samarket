"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import { MemberOrderChatList } from "@/components/member-orders/MemberOrderChatList";
import type { MyPageConsoleProps } from "@/components/mypage/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressKindHeadPin } from "@/components/addresses/AddressKindHeadPin";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyRow } from "@/components/mypage/ds/MyRow";
import { ClipboardList, Store, Wallet } from "lucide-react";

type Props = Pick<MyPageConsoleProps, "hasOwnerStore" | "ownerHubStoreId" | "storeAttentionSummary">;

export function StoreTab({
  section,
  hasOwnerStore,
  ownerHubStoreId,
  storeAttentionSummary,
}: Props & { section: string }) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const businessHref = ownerHubStoreId?.trim()
    ? `/stores/owner?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/stores/owner";
  const businessOrdersHref = ownerHubStoreId?.trim()
    ? `/stores/owner/orders?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
    : "/stores/owner/orders";

  if (section === "orders") {
    return (
      <TabShell
        variant="flush"
        title={safeT("mypage_comp_nav_sec_store_orders_label")}
        description={t("mypage_comp_nav_sec_store_orders_desc")}
      >
        <MyStoreOrdersView embedded />
      </TabShell>
    );
  }

  if (section === "order-chat") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_store_order_chat_label")}
        description={t("mypage_comp_nav_sec_store_order_chat_desc")}
      >
        <MemberOrderChatList />
      </TabShell>
    );
  }

  if (section === "payment") {
    const financeHref = ownerHubStoreId?.trim()
      ? OwnerRoutes.finance(ownerHubStoreId.trim())
      : hasOwnerStore
        ? OwnerRoutes.finance()
        : "/stores/owner/apply";
    // 주문자에게는 정산·수수료·캐시·Coin 문구를 보여주지 않는다 (store-commission-cash-settlement-ssot §4).
    // 매장 사장님에게만 매장 재무(Coin·캐시) 안내.
    /** 결제정보 (최종 설계 S09) — 안내 + 행 목록(MyGroup·MyRow), 이동만 */
    const rowIcon = "h-[18px] w-[18px]";
    if (!hasOwnerStore) {
      return (
        <TabShell
          variant="flush"
          title={t("mypage_mnav_store_payment")}
          description={t("mypage_comp_payment_member_desc")}
        >
          <div data-testid="mypage-payment-member-rows">
            <MyGroup>
              <MyRow
                first
                title={t("mypage_comp_nav_sec_store_orders_label")}
                href="/mypage/store-orders"
                icon={<ClipboardList className={rowIcon} strokeWidth={2} aria-hidden />}
              />
              <MyRow
                title={t("mypage_comp_store_owner_cta_apply")}
                href={financeHref}
                icon={<Store className={rowIcon} strokeWidth={2} aria-hidden />}
              />
            </MyGroup>
          </div>
        </TabShell>
      );
    }
    return (
      <TabShell
        variant="flush"
        title={safeT("mypage_comp_nav_sec_store_payment_label")}
        description={t("mypage_comp_nav_sec_store_payment_desc")}
      >
        <div data-testid="mypage-payment-owner-rows">
          <MyGroup>
            <MyRow
              first
              title={t("biz_nav_finance")}
              href={financeHref}
              icon={<Wallet className={rowIcon} strokeWidth={2} aria-hidden />}
            />
            <MyRow
              title={t("mypage_comp_store_owner_hub")}
              href={businessHref}
              icon={<Store className={rowIcon} strokeWidth={2} aria-hidden />}
              value={storeAttentionSummary ?? undefined}
            />
          </MyGroup>
        </div>
      </TabShell>
    );
  }

  if (section === "address") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_store_address_label")}
        description={t("mypage_comp_nav_sec_store_address_desc")}
      >
        <button
          type="button"
          onClick={() => router.push("/mypage/addresses")}
          className="flex min-h-[52px] items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 sam-text-body font-medium text-sam-fg"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <AddressKindHeadPin kind="master" className="h-5 w-5 shrink-0 [&_svg]:h-5 [&_svg]:w-[1rem]" />
            <span>{safeT("mypage_comp_nav_sec_store_address_label")}</span>
          </span>
          <span className="text-sam-meta">›</span>
        </button>
      </TabShell>
    );
  }

  if (section === "member") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_store_member_label")}
        description={t("mypage_comp_nav_sec_store_member_desc")}
      >
        <MyPageQuickActions
          items={[
            { label: t("mypage_comp_nav_sec_store_orders_label"), href: "/mypage/section/store/orders", caption: t("mypage_comp_nav_sec_store_orders_desc") },
            {
              label: hasOwnerStore ? t("mypage_comp_store_owner_hub") : t("mypage_comp_store_owner_cta_apply"),
              href: hasOwnerStore ? businessOrdersHref : "/stores/owner/apply",
              caption: hasOwnerStore ? storeAttentionSummary ?? t("mypage_comp_nav_sec_store_manage_desc") : t("mypage_comp_store_owner_intro"),
            },
          ]}
        />
      </TabShell>
    );
  }

  if (section === "rider") {
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_store_rider_label")}
        description={t("mypage_comp_nav_sec_store_rider_desc")}
      >
        <MyPageQuickActions
          items={[{ label: t("mypage_comp_nav_sec_store_orders_label"), href: "/mypage/section/store/orders", caption: t("mypage_comp_nav_sec_store_orders_desc") }]}
        />
      </TabShell>
    );
  }

  return (
    <TabShell
      variant="flush"
      title={safeT("mypage_comp_nav_sec_store_orders_label")}
      description={t("mypage_comp_nav_sec_store_orders_desc")}
    >
      <MyStoreOrdersView embedded />
    </TabShell>
  );
}

function TabShell({
  variant = "boxed",
  title,
  description,
  children,
}: {
  variant?: "boxed" | "flush";
  title: string;
  description: string;
  children: ReactNode;
}) {
  if (variant === "flush") {
    return (
      <div className="space-y-3">
        <MyPageSectionHeader description={description} />
        {children}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <MyPageSectionHeader description={description} />
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">{children}</div>
    </div>
  );
}
