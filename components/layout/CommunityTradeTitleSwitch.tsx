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
  /**
   * 선택 버튼 모양 + 눌림 효과 (Owner 2026-11-09 「선택된 버튼 형태 · 눌림 효과」):
   * 둥근 바탕 안에 두 버튼 — 선택 = 브랜드 초록 채움·흰 글자, 나머지 = 회색 글자.
   * 누르면 살짝 작아지고(0.96) 바탕이 진해진다. 「동작 줄이기」 설정이면 크기 변화 없음.
   */
  return (
    <span
      className="inline-flex min-w-0 items-center gap-0.5 rounded-full bg-black/[0.06] p-[3px]"
      role="tablist"
      data-community-trade-title-switch
    >
      {items.map((it) => {
        const on = it.key === active;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={on}
            data-active={on ? "" : undefined}
            className={`inline-flex h-8 items-center whitespace-nowrap rounded-full px-3.5 text-[15px] leading-none transition-[transform,background-color,color] duration-100 ease-out [-webkit-tap-highlight-color:transparent] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 ${
              on
                ? "bg-sam-primary font-bold text-white shadow-[0_1px_3px_rgba(11,66,26,0.25)] active:brightness-90"
                : "font-semibold text-sam-muted active:bg-black/[0.08]"
            }`}
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
