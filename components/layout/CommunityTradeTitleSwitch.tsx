"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { peekTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";
import { resolveCommunityBottomNavEntryHref } from "@/lib/community/community-hub-state";

/**
 * 커뮤니티 1단 제목 자리 — 「정보교환 · 거래」 전환 탭 (홈 설계안 v11, Owner 「구현 시작」 2026-11-09).
 * 거래(`/market`)는 하단 탭이 아니라 커뮤니티 안의 탭이다. 거래 화면 본문·2단 탭은 그대로 둔다.
 * - 정보교환 → 마지막 커뮤니티 주제 복원(`resolveCommunityBottomNavEntryHref`)
 * - 거래 → 마지막 거래 목록 URL 복원(`peekTradeListReturnHref`)
 */
export function CommunityTradeTitleSwitch({ active }: { active: "community" | "trade" }) {
  const { t } = useI18n();
  const router = useRouter();
  const items = [
    {
      key: "community" as const,
      label: t("nav_community_switch_info"),
      href: () => resolveCommunityBottomNavEntryHref("/philife", { fromPathname: "/market" }),
    },
    {
      key: "trade" as const,
      label: t("nav_bottom_trade"),
      href: () => peekTradeListReturnHref() ?? "/market",
    },
  ];
  return (
    <span className="flex min-w-0 items-baseline gap-3.5" role="tablist" data-community-trade-title-switch>
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            data-active={on ? "" : undefined}
            className={`whitespace-nowrap ${on ? "text-sam-fg" : "text-sam-muted"}`}
            onClick={() => {
              if (on) return;
              router.push(it.href());
            }}
          >
            {it.label}
          </button>
        );
      })}
    </span>
  );
}
