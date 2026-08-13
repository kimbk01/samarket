"use client";

import type { ReactNode } from "react";
import { MemberAddressBookRedirect } from "@/components/addresses/MemberAddressBookRedirect";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { MyPageQuickActions } from "@/components/mypage/MyPageQuickActions";
import { MyPageSectionHeader } from "@/components/mypage/MyPageSectionHeader";
import { MemberOrderChatList } from "@/components/member-orders/MemberOrderChatList";
import type { MyPageConsoleProps } from "@/components/mypage/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = Pick<MyPageConsoleProps, "hasOwnerStore" | "ownerHubStoreId" | "storeAttentionSummary">;

export function StoreTab({
  section,
  hasOwnerStore,
  ownerHubStoreId,
  storeAttentionSummary,
}: Props & { section: string }) {
  const { t, safeT } = useI18n();
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
    const businessCreditHref = ownerHubStoreId?.trim()
      ? `/stores/owner/points?storeId=${encodeURIComponent(ownerHubStoreId.trim())}`
      : hasOwnerStore
        ? "/stores/owner/points"
        : "/stores/owner/apply";
    return (
      <TabShell
        title={safeT("mypage_comp_nav_sec_store_payment_label")}
        description={t("mypage_comp_nav_sec_store_payment_desc")}
      >
        <MyPageQuickActions
          items={[
            {
              label: hasOwnerStore
                ? t("biz_nav_store_points")
                : t("mypage_comp_store_owner_cta_apply"),
              href: businessCreditHref,
              caption: hasOwnerStore
                ? t("biz_nav_store_points_desc")
                : t("mypage_comp_store_owner_intro"),
            },
            {
              label: hasOwnerStore ? t("mypage_comp_store_owner_hub") : t("mypage_comp_nav_sec_store_orders_label"),
              href: hasOwnerStore ? businessHref : "/mypage/section/store/orders",
              caption: hasOwnerStore
                ? storeAttentionSummary ?? t("mypage_comp_nav_sec_store_manage_desc")
                : t("mypage_comp_nav_sec_store_orders_desc"),
            },
          ]}
        />
      </TabShell>
    );
  }

  if (section === "address") {
    return <MemberAddressBookRedirect />;
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
