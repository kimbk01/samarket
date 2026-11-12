"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { peekTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";
import { resolveCommunityBottomNavEntryHref } from "@/lib/community/community-hub-state";
import { DIBAY_SECONDARY_TAB_INNER_CLASS } from "@/lib/ui/dibay-secondary-tabs";
import type { CommunityTradeSwitchHub } from "@/lib/layout/mobile-top-tier1-rules";
import { triggerInteractionFeedback } from "@/lib/ui/light-tap-feedback";

/**
 * 「정보교환 · 거래」 전환 탭 (홈 설계안 v11, Owner 「구현 시작」 2026-11-09).
 * 거래(`/market`)는 하단 탭이 아니라 커뮤니티 안의 탭이다.
 * 자리 = 머리글 3단 `CommunityTradeSwitchRow` (Owner 「A 안」 2026-11-12 — 1단 제목 자리에선 영문이 잘려 옮김).
 * - 정보교환 → 마지막 커뮤니티 주제 복원(`resolveCommunityBottomNavEntryHref`)
 * - 거래 → 마지막 거래 목록 URL 복원(`peekTradeListReturnHref`)
 */
export function CommunityTradeTitleSwitch({ active }: { active: CommunityTradeSwitchHub }) {
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
    /** 모임 — 커뮤니티 2단 끝 탭에서 3단으로 (Owner 「3판대로 구현」 2026-11-12) */
    {
      key: "moim" as const,
      label: t("moim_tab"),
      href: () => "/moim",
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
              triggerInteractionFeedback("light");
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
 * 머리글 3단 — 2단 탭 줄 바로 아래, 「정보교환 · 거래」 전환 탭을 **오른쪽 정렬**로 둔다
 * (Owner 「A 안」 2026-11-12: 「3단의 탭 메뉴는 우측 정렬, 2단 탭 메뉴는 좌측 정렬」,
 * 시안 `docs/design/community-trade-header-switch-mockup-2026-11-12.html` A).
 * 좌우 여백·줄 높이 = 2단 탭 줄과 같은 토큰(`DIBAY_SECONDARY_TAB_INNER_CLASS` · `--dibay-secondary-tab-row-h`),
 * 오른쪽 끝은 `pr-1` 로 1단 아이콘(알림) 오른쪽 끝과 같은 선(화면 끝에서 12px).
 * 오른쪽 정렬은 `justify-end` 가 아니라 자식 `ml-auto` 로 — `justify-end` + 가로 스크롤이면 넘칠 때 왼쪽이 화면 밖으로
 * 잘려 스크롤로도 못 본다. `ml-auto` 는 넘치면 0 이 되어 왼쪽부터 밀어서 볼 수 있다 (Owner 「3건 수정」 2026-11-12).
 */
export function CommunityTradeSwitchRow({ active }: { active: CommunityTradeSwitchHub }) {
  return (
    <div
      className="w-full min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]"
      data-community-trade-switch-row
    >
      <div className={DIBAY_SECONDARY_TAB_INNER_CLASS}>
        <div className="flex h-[length:var(--dibay-secondary-tab-row-h,44px)] min-w-0 max-w-full items-center overflow-x-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="ml-auto inline-flex shrink-0">
            <CommunityTradeTitleSwitch active={active} />
          </span>
        </div>
      </div>
    </div>
  );
}
