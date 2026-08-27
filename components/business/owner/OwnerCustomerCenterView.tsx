"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerCareAdminNotesList } from "@/components/business/owner/OwnerCareAdminNotesList";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";

type CareTab = "messages" | "inquiries";

function parseTab(raw: string | null): CareTab {
  return raw === "inquiries" ? "inquiries" : "messages";
}

function withFromOwnerCare(href: string): string {
  if (href.includes("from=owner-care")) return href;
  return `${href}${href.includes("?") ? "&" : "?"}from=owner-care`;
}

export function OwnerCustomerCenterView({
  inboxUnread = 0,
  inquiryUnread = 0,
}: {
  inboxUnread?: number;
  inquiryUnread?: number;
}) {
  const { safeT } = useI18n();
  const sp = useSearchParams();
  const storeId = sp.get("storeId");
  const tab = parseTab(sp.get("tab"));

  const messagesBase = OwnerRoutes.customerCareMessages(storeId).split("?")[0]!;
  const inquiriesBase = OwnerRoutes.customerCareCsInquiries(storeId).split("?")[0]!;

  const tabs: { id: CareTab; href: string; label: string; badge: number }[] = [
    {
      id: "messages",
      href: withFromOwnerCare(OwnerRoutes.customerCareCenter(storeId, "messages")),
      label: safeT("biz_care_tab_admin_messages", {
        fallbackKo: "관리자 쪽지",
        fallbackEn: "Admin messages",
      }),
      badge: inboxUnread,
    },
    {
      id: "inquiries",
      href: withFromOwnerCare(OwnerRoutes.customerCareCenter(storeId, "inquiries")),
      label: safeT("biz_care_tab_1on1", {
        fallbackKo: "1:1 문의",
        fallbackEn: "1:1 Inquiry",
      }),
      badge: inquiryUnread,
    },
  ];

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-8`} data-owner-customer-center="1">
      <p className="mb-2 text-xs text-sam-muted">
        {safeT("biz_care_center_intro", {
          fallbackKo: "DIBAY 관리자와 쪽지·1:1 문의로 직접 연락합니다.",
          fallbackEn: "Message DIBAY admin via notes and 1:1 inquiry.",
        })}
      </p>
      <div className="mb-3 grid min-w-0 grid-cols-2 gap-2" data-owner-customer-center-tabs="1">
        {tabs.map((t) => {
          const selected = tab === t.id;
          return (
            <Link
              key={t.id}
              href={t.href}
              data-owner-care-tab={t.id}
              className={`flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-ui-rect px-2 text-center text-sm font-medium ${
                selected ? "bg-signature text-white" : "border border-sam-border bg-sam-surface text-sam-fg"
              }`}
            >
              <span className="truncate">{t.label}</span>
              {t.badge > 0 ? (
                <span
                  className={`inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    selected ? "bg-white/20 text-white" : "bg-red-500 text-white"
                  }`}
                >
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
      {tab === "messages" ? (
        <OwnerCareAdminNotesList kind="inbox" threadBasePath={messagesBase} />
      ) : (
        <OwnerCareAdminNotesList kind="inquiry" threadBasePath={inquiriesBase} />
      )}
    </div>
  );
}
