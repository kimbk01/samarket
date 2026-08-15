"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ChevronRight,
  Coins,
  Gift,
  Headphones,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Settings2,
  Wallet,
} from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  CUSTOMER_CENTER_HREF,
  customerCenterChildHref,
} from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import {
  CC_CARD_CLASS,
  CC_HEADER_CLASS,
  CC_ICON_WELL_CLASS,
  CC_NOTE_CLASS,
  CC_PAGE_BG_CLASS,
  CC_TITLE_CLASS,
} from "@/lib/mypage/customer-center-ui";
import { BOARD_LABEL, type CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";

const BOARD_TABS: {
  type: CustomerCenterContentType;
  icon: ReactNode;
}[] = [
  { type: "notice", icon: <Megaphone className="h-6 w-6" strokeWidth={2} aria-hidden /> },
  { type: "system", icon: <Settings2 className="h-6 w-6" strokeWidth={2} aria-hidden /> },
  { type: "marketing", icon: <Gift className="h-6 w-6" strokeWidth={2} aria-hidden /> },
];

type HubEntry = {
  href: string;
  titleKo: string;
  titleEn: string;
  titleKey: MessageKey;
  icon: ReactNode;
  accessory?: string;
};

function HubRow({
  href,
  title,
  icon,
  accessory,
  first,
}: {
  href: string;
  title: string;
  icon: ReactNode;
  accessory?: string;
  first?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex min-h-[3.25rem] items-center gap-3 px-4 py-3 transition active:bg-[#E8F7EF]/70 ${
        first ? "" : "border-t border-[rgba(14,92,58,0.08)]"
      }`}
    >
      <span className={CC_ICON_WELL_CLASS}>{icon}</span>
      <span className={`min-w-0 flex-1 ${CC_HEADER_CLASS}`}>{title}</span>
      {accessory ? (
        <span className={`shrink-0 tabular-nums ${CC_NOTE_CLASS}`}>{accessory}</span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-[#8F9D95]" strokeWidth={2} aria-hidden />
    </Link>
  );
}

/**
 * `/mypage/customer-center` — DIBAY CC hub (design board parity).
 */
export function CustomerCenterHubClient() {
  const { safeT, language } = useI18n();
  const { balance, loading } = useUserPointBalance();
  const pointsAccessory = loading ? "…" : balance.toLocaleString(language === "ko" ? "ko-KR" : "en-US");

  const greeting = safeT("mypage_cs_hub_greeting", {
    fallbackKo: "무엇이 궁금하신가요?",
    fallbackEn: "How can we help?",
  });
  const historyTitle = safeT("mypage_cs_hub_history", {
    fallbackKo: "이전 대화",
    fallbackEn: "Previous conversations",
  });

  const entries: HubEntry[] = [
    {
      href: customerCenterChildHref("/mypage/inquiries"),
      titleKey: "mypage_comp_menu_support_inquiries_title",
      titleKo: "1:1 문의",
      titleEn: "1:1 Inquiry",
      icon: <MessageSquare className="h-5 w-5" aria-hidden />,
    },
    {
      href: customerCenterChildHref("/mypage/inbox"),
      titleKey: "mypage_comp_menu_support_inbox_title",
      titleKo: "받은 쪽지",
      titleEn: "Inbox",
      icon: <MessageCircle className="h-5 w-5" aria-hidden />,
    },
    {
      href: customerCenterChildHref("/mypage/points"),
      titleKey: "mypage_comp_stat_points",
      titleKo: "D-Point",
      titleEn: "D-Point",
      icon: <Coins className="h-5 w-5" aria-hidden />,
      accessory: pointsAccessory,
    },
    {
      href: customerCenterChildHref("/mypage/points/charge"),
      titleKey: "points_charge",
      titleKo: "충전 신청",
      titleEn: "Top-up request",
      icon: <Wallet className="h-5 w-5" aria-hidden />,
    },
  ];

  return (
    <div
      className={`flex min-h-screen min-w-0 flex-col ${CC_PAGE_BG_CLASS}`}
      data-testid="customer-center-hub"
    >
      <MySubpageHeader
        title={safeT("mypage_comp_menu_support_cs_title", {
          fallbackKo: "고객센터",
          fallbackEn: "Customer support",
        })}
        backHref="/mypage"
        preferHistoryBack={false}
        hideCtaStrip
        rightSlot={
          <Link
            href={customerCenterChildHref("/mypage/inquiries")}
            className="text-[13px] font-semibold text-[#0E5C3A]"
          >
            {historyTitle}
          </Link>
        }
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${CUSTOMER_CENTER_LIST_COLUMN_CLASS} px-3 sm:px-4`}>
          <section className="rounded-2xl bg-[#E8F7EF] px-4 py-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#0E5C3A] shadow-[0_1px_0_rgba(14,92,58,0.06)]">
              <Headphones className="h-7 w-7" strokeWidth={2} aria-hidden />
            </span>
            <p className={`mt-3 ${CC_TITLE_CLASS}`}>{greeting}</p>
          </section>

          <section
            className="grid grid-cols-3 gap-2 sm:gap-3"
            data-testid="customer-center-boards"
            data-route={CUSTOMER_CENTER_HREF}
          >
            {BOARD_TABS.map(({ type, icon }) => {
              const label = BOARD_LABEL[type][language === "en" ? "en" : "ko"];
              return (
                <Link
                  key={type}
                  href={buildCustomerCenterBoardListPath(type)}
                  className="flex min-h-[5.75rem] flex-col items-center justify-center gap-2 rounded-2xl border border-[rgba(14,92,58,0.12)] bg-white px-2 py-3 text-center shadow-[0_1px_0_rgba(14,92,58,0.04)] transition active:scale-[0.98] sm:min-h-[6.25rem]"
                  data-testid={`cc-board-tab-${type}`}
                >
                  <span className="text-[#0E5C3A]">{icon}</span>
                  <span className="text-[13px] font-semibold text-[#0E5C3A] sm:text-[14px]">
                    {label}
                  </span>
                </Link>
              );
            })}
          </section>

          <section className={`${CC_CARD_CLASS} mb-4`}>
            {entries.map((entry, index) => (
              <HubRow
                key={entry.href}
                first={index === 0}
                href={entry.href}
                title={safeT(entry.titleKey, {
                  fallbackKo: entry.titleKo,
                  fallbackEn: entry.titleEn,
                })}
                icon={entry.icon}
                accessory={entry.accessory}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
