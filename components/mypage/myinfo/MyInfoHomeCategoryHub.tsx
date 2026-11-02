"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CurrencyAmount } from "@/components/currency";
import { renderMypageHomeMenuIcon } from "@/components/mypage/myinfo/myinfo-menu-icon";
import type { MypageHomeValues } from "@/components/mypage/home/mypage-home-values-context";
import {
  MYPAGE_IA_CATEGORIES,
  buildMypageIaCategoryHref,
  type MypageIaCategoryId,
} from "@/lib/mypage/mypage-ia";
import { readMypageSummaryValue } from "@/lib/mypage/mypage-summary-types";
import {
  MYPAGE_HOME_MY_PRODUCTS_HREF,
  MYPAGE_HOME_STORE_ORDERS_HREF,
} from "@/lib/mypage/mypage-home-hub-links";
import { TRADE_CHAT_MESSENGER_LIST_HREF } from "@/lib/chats/surfaces/trade-chat-surface";
import { MYPAGE_HOME_CARD_CLASS } from "@/lib/ui/mypage-home-starbucks-styles";

/** 분류 카드 아이콘 색 — 분류마다 고정 (토큰 계열 연한 배경 + 진한 글자) */
const CATEGORY_TONE: Record<MypageIaCategoryId, string> = {
  trade: "bg-[#E8F1EA] text-[#14692B]",
  community: "bg-[#F1EAFE] text-[#6D28D9]",
  store: "bg-[#FDF3E1] text-[#9A4A07]",
  asset: "bg-[#EAF0FF] text-[#1D4ED8]",
  account: "bg-[#E2F4F1] text-[#0F766E]",
  support: "bg-[#EEF1F5] text-[#475569]",
  settings: "bg-[#EEF1F5] text-[#475569]",
};

function countOrNull(n: number | null | undefined): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}

function NowCell({ href, label, value, hot }: { href: string; label: string; value: ReactNode; hot?: boolean }) {
  return (
    <Link
      href={href}
      className="relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-3 text-center active:bg-sam-pressed-surface [&+&]:before:absolute [&+&]:before:inset-y-3.5 [&+&]:before:left-0 [&+&]:before:w-px [&+&]:before:bg-sam-border-soft"
    >
      <span className={`text-[19px] font-extrabold leading-tight tabular-nums ${hot ? "text-sam-danger" : "text-sam-fg"}`}>
        {value}
      </span>
      <span className="text-[11px] leading-tight text-sam-muted">{label}</span>
    </Link>
  );
}

/** 진행 중 4칸 — 누르면 그 화면으로 (값 = 요약 1회, 모름 = 「—」) */
export function MyInfoHomeNowStrip({ values }: { values: MypageHomeValues }) {
  const { t } = useI18n();
  const f = values.summary?.fields;
  const dash = t("mypage_comp_placeholder_dash");
  const sales = countOrNull(readMypageSummaryValue(f?.salesActiveCount));
  const orders = countOrNull(readMypageSummaryValue(f?.storeOrdersActiveCount));
  const points = readMypageSummaryValue(f?.pointsBalance);
  const chat = values.tradeChatUnread;
  return (
    <nav className={`${MYPAGE_HOME_CARD_CLASS} grid w-full grid-cols-4`} aria-label={t("mypage_ia_all_menu")} data-testid="mypage-home-now-strip">
      <NowCell href={MYPAGE_HOME_MY_PRODUCTS_HREF} label={t("mypage_ia_now_trade")} value={sales ?? dash} />
      <NowCell href={TRADE_CHAT_MESSENGER_LIST_HREF} label={t("mypage_ia_now_chat")} value={chat} hot={chat > 0} />
      <NowCell href={MYPAGE_HOME_STORE_ORDERS_HREF} label={t("mypage_ia_now_orders")} value={orders ?? dash} hot={(orders ?? 0) > 0} />
      <NowCell
        href="/mypage/points"
        label={t("mypage_ia_now_points")}
        value={points == null ? dash : <CurrencyAmount currency="point" amount={points} compactPoint />}
      />
    </nav>
  );
}

/**
 * 홈 「전체 메뉴」 분류 카드 6개 (2열) — 누르면 그 분류 화면(L1).
 * 카드 둘째 줄 = 그 분류의 할 일·숫자, 오른쪽 위 배지 = 확인할 건수.
 */
export function MyInfoHomeCategoryGrid({
  values,
  requiredLeft,
  ccUnread,
}: {
  values: MypageHomeValues;
  /** 필수 정보 남은 개수 — 모름 = null */
  requiredLeft: number | null;
  ccUnread: number;
}) {
  const { t } = useI18n();
  const f = values.summary?.fields;
  const fav = countOrNull(readMypageSummaryValue(f?.favoritesCount));
  const posts = countOrNull(readMypageSummaryValue(f?.communityPostsCount));
  const orders = countOrNull(readMypageSummaryValue(f?.storeOrdersActiveCount));
  const points = readMypageSummaryValue(f?.pointsBalance);
  const dash = t("mypage_comp_placeholder_dash");
  const chat = values.tradeChatUnread;

  const summaryFor = (id: MypageIaCategoryId): { text: string; badge: number | "!" | null } => {
    switch (id) {
      case "trade":
        return { text: t("mypage_ia_card_trade", { chat, fav: fav ?? dash }), badge: chat > 0 ? chat : null };
      case "community":
        return { text: t("mypage_ia_card_community", { posts: posts ?? dash }), badge: null };
      case "store":
        return { text: t("mypage_ia_card_store", { count: orders ?? dash }), badge: orders && orders > 0 ? orders : null };
      case "asset":
        return { text: t("mypage_ia_card_asset", { points: points == null ? dash : `${points}P` }), badge: null };
      case "account":
        if (requiredLeft == null) return { text: t("mypage_ia_cat_account_desc"), badge: null };
        return requiredLeft > 0
          ? { text: t("mypage_ia_card_account_left", { count: requiredLeft }), badge: "!" }
          : { text: t("mypage_ia_card_account_done"), badge: null };
      case "support":
        return ccUnread > 0
          ? { text: t("mypage_ia_card_settings_cs", { count: ccUnread }), badge: ccUnread }
          : { text: t("mypage_ia_card_settings"), badge: null };
      default:
        return { text: "", badge: null };
    }
  };

  return (
    <section className="w-full" data-testid="mypage-home-category-grid">
      <h2 className="mb-2.5 flex items-baseline gap-1.5 px-0.5 text-[15px] font-extrabold text-sam-fg">
        {t("mypage_ia_all_menu")}
        <span className="text-[12px] font-normal text-sam-muted">{t("mypage_ia_all_menu_hint")}</span>
      </h2>
      <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0">
        {MYPAGE_IA_CATEGORIES.filter((cat) => !cat.headerEntry).map((cat) => {
          const s = summaryFor(cat.id);
          const warn = s.badge === "!";
          return (
            <li key={cat.id} className="min-w-0">
              <Link
                href={buildMypageIaCategoryHref(cat.id)}
                data-testid={`mypage-ia-card-${cat.id}`}
                className={`${MYPAGE_HOME_CARD_CLASS} relative flex min-h-[112px] w-full flex-col px-3.5 pb-3 pt-3.5 transition-transform active:scale-[0.97] active:bg-sam-pressed-surface`}
              >
                <span
                  className={`mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl [&_svg]:h-[21px] [&_svg]:w-[21px] ${CATEGORY_TONE[cat.id]}`}
                  aria-hidden
                >
                  {renderMypageHomeMenuIcon(cat.icon)}
                </span>
                <span className="break-words text-[16px] font-extrabold leading-tight text-sam-fg">{t(cat.titleKey)}</span>
                <span
                  className={`mt-1 line-clamp-2 break-words text-[12px] leading-snug ${warn ? "font-semibold text-[#8A3B00] dark:text-sam-warning" : "text-sam-muted"}`}
                >
                  {s.text}
                </span>
                {s.badge != null ? (
                  <span
                    className={`absolute right-3 top-3 min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-extrabold leading-5 text-white ${warn ? "bg-[#C2410C]" : "bg-sam-danger"}`}
                  >
                    {s.badge === "!" ? "!" : s.badge > 99 ? "99+" : s.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
