"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { peekTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";
import { resolveCommunityBottomNavEntryHref } from "@/lib/community/community-hub-state";
import { DIBAY_SECONDARY_TAB_INNER_CLASS } from "@/lib/ui/dibay-secondary-tabs";

/**
 * 「정보교환 · 거래」 전환 탭 (홈 설계안 v11, Owner 「구현 시작」 2026-11-09).
 * 거래(`/market`)는 하단 탭이 아니라 커뮤니티 안의 탭이다.
 * 자리 = 머리글 3단 `CommunityTradeSwitchRow` (Owner 「A 안」 2026-11-12 — 1단 제목 자리에선 영문이 잘려 옮김).
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
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-black/[0.06] p-[3px]"
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

/**
 * 머리글 3단 — 2단 탭 줄 바로 아래, 「정보교환 · 거래」 전환 탭을 **왼쪽 정렬**로 둔다
 * (Owner 「A 안 · 정보교환 탭 메뉴 좌측 정렬」 2026-11-12, 시안 `docs/design/community-trade-header-switch-mockup-2026-11-12.html`).
 * 줄을 혼자 쓰므로 영문·긴 문구도 잘리지 않는다 — 폭이 모자라면 줄이 가로로 밀린다(글자 자르기 없음).
 * 시작선·좌우 여백·줄 높이 = 2단 탭 줄과 같은 토큰(`DIBAY_SECONDARY_TAB_INNER_CLASS` · `--dibay-secondary-tab-row-h`).
 */
export function CommunityTradeSwitchRow({ active }: { active: "community" | "trade" }) {
  return (
    <div
      className="w-full min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]"
      data-community-trade-switch-row
    >
      <div className={DIBAY_SECONDARY_TAB_INNER_CLASS}>
        <div className="flex h-[length:var(--dibay-secondary-tab-row-h,44px)] min-w-0 max-w-full items-center justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <CommunityTradeTitleSwitch active={active} />
        </div>
      </div>
    </div>
  );
}
