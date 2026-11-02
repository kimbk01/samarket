"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds";
import { MyTabs } from "@/components/mypage/ds/MyTabs";
import { MyOffersView, type MyOffersMode } from "@/components/offers/MyOffersView";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { getMypageHomeSummaryState } from "@/lib/mypage/mypage-home-summary-client";

export const MY_OFFERS_TABS = ["received", "sent"] as const satisfies readonly MyOffersMode[];

/** `?tab` 없거나 목록 밖 값 → 받은 제안 (최종 설계 S23 기본 탭 규칙) */
export function resolveMyOffersTab(raw: string | null | undefined): MyOffersMode {
  return raw === "sent" ? "sent" : "received";
}

function seedReceivedPending(): number | null {
  const f = getMypageHomeSummaryState()?.fields?.offersReceivedPending;
  return f?.status === "ok" ? f.value : null;
}

/**
 * 가격 제안 화면 (최종 설계 S23) — 탭 [받은 제안 · 보낸 제안](대기 개수) · `?tab=received|sent`.
 * 두 탭을 함께 마운트해 탭별 1회 요청 + 재방문 즉시 표시(메모리 캐시), 탭별 스크롤은 `useMypageTabParam`.
 */
export function MyOffersTabsScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useMypageTabParam<MyOffersMode>({
    values: MY_OFFERS_TABS,
    defaultValue: "received",
  });
  const [pending, setPending] = useState<Record<MyOffersMode, number | null>>(() => ({
    received: seedReceivedPending(),
    sent: null,
  }));
  const onPendingCount = useCallback((mode: MyOffersMode, count: number) => {
    setPending((prev) => (prev[mode] === count ? prev : { ...prev, [mode]: count }));
  }, []);

  const labels: Record<MyOffersMode, string> = {
    received: t("mypage_r5_offer_tab_received"),
    sent: t("mypage_r5_offer_tab_sent"),
  };

  return (
    <MyScreen title={t("mypage_r5_offer_title")} backHref="/mypage" template="list">
      <MyTabs
        className="mb-3"
        value={tab}
        onChange={setTab}
        items={MY_OFFERS_TABS.map((id) => {
          const n = pending[id];
          return {
            id,
            label: labels[id],
            testId: `offers-tab-${id}`,
            accessory:
              n != null && n > 0 ? (
                <span data-testid={`offers-tab-${id}-pending`}>{t("mypage_r5_offer_tab_pending", { count: n })}</span>
              ) : undefined,
          };
        })}
      />
      <div hidden={tab !== "received"}>
        <MyOffersView
          mode="received"
          emptyLabel={t("mypage_offers_received_empty")}
          onPendingCount={onPendingCount}
        />
      </div>
      <div hidden={tab !== "sent"}>
        <MyOffersView mode="sent" emptyLabel={t("mypage_offers_sent_empty")} onPendingCount={onPendingCount} />
      </div>
    </MyScreen>
  );
}
