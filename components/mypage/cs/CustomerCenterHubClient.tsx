"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Headphones, MessageCircle, MessageSquare, Coins, Wallet, Megaphone } from "lucide-react";
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
  MYPAGE_HOME_CARD_CLASS,
  MYPAGE_HOME_CHEVRON_CLASS,
  MYPAGE_HOME_ICON_WRAP_CLASS,
  MYPAGE_HOME_MENU_TITLE_CLASS,
  MYPAGE_HOME_META_TEXT_CLASS,
  MYPAGE_HOME_ROW_CLASS,
  MYPAGE_HOME_ROW_DIVIDER_CLASS,
  MYPAGE_HOME_SECTION_HEADER_CLASS,
  MYPAGE_HOME_SECTION_LABEL_CLASS,
} from "@/lib/ui/mypage-home-starbucks-styles";

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
      className={`${MYPAGE_HOME_ROW_CLASS} ${first ? "" : MYPAGE_HOME_ROW_DIVIDER_CLASS}`}
    >
      <span className={MYPAGE_HOME_ICON_WRAP_CLASS}>{icon}</span>
      <span className={`min-w-0 flex-1 ${MYPAGE_HOME_MENU_TITLE_CLASS}`}>{title}</span>
      {accessory ? (
        <span className={`shrink-0 tabular-nums ${MYPAGE_HOME_META_TEXT_CLASS}`}>{accessory}</span>
      ) : null}
      <ChevronRight className={MYPAGE_HOME_CHEVRON_CLASS} strokeWidth={2} aria-hidden />
    </Link>
  );
}

/**
 * `/mypage/customer-center` — Karrot-style full-page CS hub.
 * Entries navigate to existing originals (inquiry / inbox / points / charge / notices).
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
    {
      href: customerCenterChildHref("/mypage/section/settings/notices"),
      titleKey: "mypage_comp_menu_support_notices_title",
      titleKo: "공지사항",
      titleEn: "Announcements",
      icon: <Megaphone className="h-5 w-5" aria-hidden />,
    },
  ];

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-sam-app" data-testid="customer-center-hub">
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
            className="sam-text-helper font-semibold text-[#00704A]"
          >
            {historyTitle}
          </Link>
        }
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={CUSTOMER_CENTER_LIST_COLUMN_CLASS}>
          <section className={`${MYPAGE_HOME_CARD_CLASS} px-4 py-6 text-center`}>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F3EE] text-[#00704A]">
              <Headphones className="h-6 w-6" aria-hidden />
            </span>
            <p className="mt-3 text-[17px] font-semibold leading-snug text-[#1E3932]">{greeting}</p>
            <p className="mt-1 sam-text-helper text-[#6F4E37]">
              {safeT("mypage_cs_hub_greeting_sub", {
                fallbackKo: "문의·쪽지·D-Point·공지를 한곳에서 확인하세요.",
                fallbackEn: "Inquiries, inbox, D-Point, and notices in one place.",
              })}
            </p>
          </section>

          <section className={MYPAGE_HOME_CARD_CLASS}>
            <div className={MYPAGE_HOME_SECTION_HEADER_CLASS}>
              <h2 className={MYPAGE_HOME_SECTION_LABEL_CLASS}>
                {safeT("mypage_cs_hub_entries_title", {
                  fallbackKo: "바로가기",
                  fallbackEn: "Shortcuts",
                })}
              </h2>
            </div>
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

          <p className="px-1 pb-4 text-center text-[11px] text-sam-muted" data-route={CUSTOMER_CENTER_HREF}>
            {safeT("mypage_cs_hub_footnote", {
              fallbackKo: "각 항목은 기존 화면으로 이동합니다.",
              fallbackEn: "Each item opens the existing screen.",
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
