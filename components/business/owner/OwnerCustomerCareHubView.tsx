"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MessageCircle, HelpCircle, Headphones } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { OWNER_ADMIN_LIST_CARD_CLASS } from "@/lib/business/owner-admin-list-ui";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";

export function OwnerCustomerCareHubView({
  orderChatUnread = 0,
  inquiryUnread = 0,
}: {
  orderChatUnread?: number;
  inquiryUnread?: number;
}) {
  const { safeT } = useI18n();
  const sp = useSearchParams();
  const storeId = sp.get("storeId");

  const entries = [
    {
      id: "order-chat",
      href: OwnerRoutes.orderChats(storeId),
      icon: MessageCircle,
      title: safeT("biz_care_order_chat", {
        fallbackKo: "주문 채팅",
        fallbackEn: "Order chat",
      }),
      desc: safeT("biz_care_order_chat_desc", {
        fallbackKo: "배달·매장 주문 대화",
        fallbackEn: "Delivery and store order conversations",
      }),
      badge: orderChatUnread,
    },
    {
      id: "store-inquiry",
      href: OwnerRoutes.inquiries(storeId),
      icon: HelpCircle,
      title: safeT("biz_care_store_inquiry", {
        fallbackKo: "매장 문의",
        fallbackEn: "Store inquiry",
      }),
      desc: safeT("biz_care_store_inquiry_desc", {
        fallbackKo: "이 매장으로 온 문의",
        fallbackEn: "Inquiries sent to this store",
      }),
      badge: inquiryUnread,
    },
    {
      id: "customer-center",
      href: `${OwnerRoutes.customerCareMessages(storeId)}${OwnerRoutes.customerCareMessages(storeId).includes("?") ? "&" : "?"}from=owner-care`,
      icon: Headphones,
      title: safeT("biz_care_customer_center", {
        fallbackKo: "고객센터",
        fallbackEn: "Customer center",
      }),
      desc: safeT("biz_care_customer_center_desc", {
        fallbackKo: "받은 쪽지 · 1:1 문의",
        fallbackEn: "Inbox and 1:1 support",
      }),
      badge: 0,
    },
  ];

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-8`} data-owner-customer-care-hub="1">
      <OwnerStoreAdminDashSection
        title={safeT("biz_title_customer_care", {
          fallbackKo: "고객 응대",
          fallbackEn: "Customer care",
        })}
      >
        <ul className="space-y-3">
          {entries.map((e) => {
            const Icon = e.icon;
            return (
              <li key={e.id}>
                <Link
                  href={e.href}
                  className={`${OWNER_ADMIN_LIST_CARD_CLASS} flex items-center gap-3`}
                  data-owner-care-entry={e.id}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-ui-rect bg-sam-app text-sam-fg">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{e.title}</span>
                    <span className="mt-0.5 block text-xs text-sam-muted">{e.desc}</span>
                  </span>
                  {e.badge > 0 ? (
                    <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {e.badge > 99 ? "99+" : e.badge}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href={`${OwnerRoutes.customerCareMessages(storeId)}${OwnerRoutes.customerCareMessages(storeId).includes("?") ? "&" : "?"}from=owner-care`}
            className={`${OWNER_ADMIN_LIST_CARD_CLASS} text-center text-sm font-medium`}
          >
            {safeT("biz_care_tab_inbox", { fallbackKo: "받은 쪽지", fallbackEn: "Inbox" })}
          </Link>
          <Link
            href={`${OwnerRoutes.customerCareCsInquiries(storeId)}${OwnerRoutes.customerCareCsInquiries(storeId).includes("?") ? "&" : "?"}from=owner-care`}
            className={`${OWNER_ADMIN_LIST_CARD_CLASS} text-center text-sm font-medium`}
          >
            {safeT("biz_care_tab_1on1", { fallbackKo: "1:1 문의", fallbackEn: "1:1 Inquiry" })}
          </Link>
        </div>
      </OwnerStoreAdminDashSection>
    </div>
  );
}
