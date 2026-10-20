"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Coins, Gift, Headphones, History, Megaphone, MessageSquare, Settings2, Wallet } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency/CurrencyAmount";
import { MyGroup } from "@/components/mypage/ds/MyGroup";
import { MyRow, type MyRowValueState } from "@/components/mypage/ds/MyRow";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { SupportContextProvider } from "@/components/support/SupportContextProvider";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import type { MessageKey } from "@/lib/i18n/messages";
import { CUSTOMER_CENTER_HREF, customerCenterChildHref } from "@/lib/mypage/customer-center-paths";
import { CC_HERO_SECTION_CLASS, CC_ICON_WELL_CLASS, CC_TITLE_CLASS } from "@/lib/mypage/customer-center-ui";
import { BOARD_LABEL, type CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { buildCustomerCenterBoardListPath } from "@/lib/notices/customer-center-content-paths";
import { SupportGenericHubInquireGate } from "@/components/support/SupportGenericHubInquireGate";
import { DISABLED_SUPPORT_CONTEXT } from "@/lib/support/support-context";
import { useSupportRequesterUnread } from "@/lib/support/use-support-requester-unread";
import { Sam } from "@/lib/ui/sam-component-classes";

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
  testId: string;
  value?: ReactNode;
  valueState?: MyRowValueState;
  /** B5 — unread pill (support_cases.requester_unread_count sum). */
  badge?: number;
};

/**
 * 포인트 행 오른쪽 값 (최종 설계 S60) — `CurrencyAmount` 만(포맷 SSOT), 로딩 = 값 자리 스켈레톤,
 * 실패 = "—", 음수는 그대로 표시.
 */
export function customerCenterHubPointsValue(input: {
  balance: number;
  loading: boolean;
  error: boolean;
}): { valueState: MyRowValueState; value: ReactNode } {
  if (input.loading) return { valueState: "loading", value: null };
  if (input.error) return { valueState: "ready", value: "—" };
  return {
    valueState: "ready",
    value: <CurrencyAmount currency="point" amount={input.balance} className="font-medium text-sam-muted" />,
  };
}

const MEMBER_CC_CONTEXT = DISABLED_SUPPORT_CONTEXT;

/**
 * `/mypage/customer-center` — A2-1: Support Modal entry SSOT (no legacy 1:1/쪽지 compose).
 * PHASE 3-A: generic hub must not hardcode OTHER; inquire uses category gate.
 * 최종 설계 S60(K8/X12): 고객센터 SSOT(LOCKED) 허브 항목 유지 — 상담 내역·이전 문의·포인트·충전 신청.
 */
export function CustomerCenterHubClient() {
  const { safeT, language } = useI18n();
  const { balance, loading, error: balanceError } = useUserPointBalance();
  const supportUnread = useSupportRequesterUnread({ audience: "MEMBER" });
  const points = customerCenterHubPointsValue({ balance, loading, error: balanceError });

  const greeting = safeT("mypage_cs_hub_greeting", {
    fallbackKo: "무엇이 궁금하신가요?",
    fallbackEn: "How can we help?",
  });

  const entries: HubEntry[] = [
    {
      href: customerCenterChildHref("/mypage/support-history"),
      titleKey: "support_history_title",
      titleKo: "상담 내역",
      titleEn: "Support history",
      icon: <MessageSquare className="h-5 w-5" aria-hidden />,
      testId: "cc-hub-row-support-history",
      badge: supportUnread,
    },
    {
      href: customerCenterChildHref("/mypage/inquiries"),
      titleKey: "support_legacy_archive_title",
      titleKo: "이전 문의 기록",
      titleEn: "Previous inquiry archive",
      icon: <History className="h-5 w-5" aria-hidden />,
      testId: "cc-hub-row-archive",
    },
    {
      href: customerCenterChildHref("/mypage/points"),
      titleKey: "mypage_comp_stat_points",
      titleKo: "포인트",
      titleEn: "Point",
      icon: <Coins className="h-5 w-5" aria-hidden />,
      testId: "cc-hub-row-points",
      value: points.value,
      valueState: points.valueState,
    },
    {
      href: customerCenterChildHref("/mypage/points/charge"),
      titleKey: "points_charge",
      titleKo: "충전 신청",
      titleEn: "Top-up request",
      icon: <Wallet className="h-5 w-5" aria-hidden />,
      testId: "cc-hub-row-charge",
    },
  ];

  return (
    <SupportContextProvider value={MEMBER_CC_CONTEXT}>
      <MyScreen
        title={safeT("mypage_comp_menu_support_cs_title", {
          fallbackKo: "고객센터",
          fallbackEn: "Customer support",
        })}
        backHref="/mypage"
        preferHistoryBack={false}
        template="hub"
      >
        <div
          className="flex flex-col gap-3 pb-4"
          data-testid="customer-center-hub"
          data-support-entry-ssot="1"
        >
          <section className={CC_HERO_SECTION_CLASS}>
            <span className={`mx-auto ${CC_ICON_WELL_CLASS} h-14 w-14`}>
              <Headphones className="h-7 w-7" strokeWidth={2} aria-hidden />
            </span>
            <p className={`mt-3 ${CC_TITLE_CLASS}`}>{greeting}</p>
            <SupportGenericHubInquireGate
              audience="MEMBER"
              sourceSurface="mypage_customer_center"
              className="mt-4 w-full"
              buttonClassName={`${Sam.btn.primaryCombo} w-full min-h-11`}
              inquireDataAttr="data-support-hub-inquire"
            />
          </section>

          <section
            className="grid grid-cols-3 gap-2"
            data-testid="customer-center-boards"
            data-route={CUSTOMER_CENTER_HREF}
          >
            {BOARD_TABS.map(({ type, icon }) => {
              const label = BOARD_LABEL[type][language === "en" ? "en" : "ko"];
              return (
                <Link
                  key={type}
                  href={buildCustomerCenterBoardListPath(type)}
                  className={`flex min-h-[5.75rem] flex-col items-center justify-center gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-2 py-3 text-center transition active:bg-sam-pressed-surface ${Sam.focusRing}`}
                  data-testid={`cc-board-tab-${type}`}
                >
                  <span className="text-sam-primary">{icon}</span>
                  <span className="text-[13px] font-semibold text-sam-primary sm:text-[14px]">{label}</span>
                </Link>
              );
            })}
          </section>

          <div data-support-hub-unread={supportUnread > 0 ? supportUnread : undefined}>
            <MyGroup>
              {entries.map((entry, index) => (
                <MyRow
                  key={entry.href}
                  first={index === 0}
                  href={entry.href}
                  testId={entry.testId}
                  title={safeT(entry.titleKey, {
                    fallbackKo: entry.titleKo,
                    fallbackEn: entry.titleEn,
                  })}
                  icon={entry.icon}
                  value={entry.value}
                  valueState={entry.valueState}
                  badge={entry.badge && entry.badge > 0 ? { count: entry.badge, tone: "primary" } : undefined}
                />
              ))}
            </MyGroup>
          </div>
        </div>
      </MyScreen>
    </SupportContextProvider>
  );
}
