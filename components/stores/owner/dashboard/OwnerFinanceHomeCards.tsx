"use client";

import { useCallback, useEffect, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRefetchOnNotificationArrival } from "@/lib/ui/use-refetch-on-notification-arrival";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { resolveOwnerApiErrorMessage } from "@/lib/business/owner-api-error-i18n";
import { ownerDashCardClass } from "./owner-dashboard-ui";
import { OwnerDashSectionHeader } from "./OwnerDashSectionHeader";
import { CurrencyAmount } from "@/components/currency/CurrencyAmount";
import { readBalanceOrNull } from "@/lib/currency/currency-display-contract";

type FinanceSummary = {
  ok?: boolean;
  error?: string;
  assets?: {
    storePoints?: { balance?: number | null };
    businessCash?: { balanceMinor?: number | null };
  };
};

/**
 * 홈 「보유금액」(Owner 2026-11-03 「돈 → 보유금액」) — Coin·Cash 잔액만, 「내역 ›」 = 재무 화면.
 * 정산 버튼은 관리 메뉴·재무 화면에 있어 홈에서 뺌(같은 주소 반복).
 */
export function OwnerFinanceHomeCards({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [cashBalanceMinor, setCashBalanceMinor] = useState<number | null>(null);
  const financeHref = OwnerRoutes.finance(storeId);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/me/stores/${encodeURIComponent(storeId)}/finance`, {
        credentials: "include",
      });
      const payload = (await response.json()) as FinanceSummary;
      if (!response.ok || payload.ok === false) {
        setError(resolveOwnerApiErrorMessage(payload.error, t));
        return;
      }
      // P0-1 — 조회 실패는 0 이 아니라 「—」
      setCoinBalance(readBalanceOrNull(payload.assets?.storePoints?.balance));
      setCashBalanceMinor(readBalanceOrNull(payload.assets?.businessCash?.balanceMinor));
    } catch {
      setError(t("common_error"));
    } finally {
      setLoading(false);
    }
  }, [storeId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** DEF-73 — 캐시 충전 승인 등 관리자 변경을 앱 복귀·창 포커스 시 반영 (재진입 불필요). */
  const refetchSilently = useCallback(() => load({ silent: true }), [load]);
  useRefetchOnPageShowRestore(refetchSilently, { enableWindowFocusRefetch: true });
  // 재감사 R1 — 이 매장의 처리 결과 알림(Cash 충전·Coin 출금) → Coin·Cash 카드 갱신
  useRefetchOnNotificationArrival(refetchSilently, { storeId });

  if (loading) {
    return (
      <div className={ownerDashCardClass()} data-owner-finance-home-cards="1">
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  return (
    <section className={ownerDashCardClass()} data-owner-finance-home-cards="1" aria-labelledby="owner-balance-title">
      <OwnerDashSectionHeader
        id="owner-balance-title"
        title={t("owner_copy_home_finance_title")}
        href={financeHref}
        linkLabel={t("owner_copy_home_finance_link")}
      />
      {error ? <p className="mt-2 text-sm text-sam-danger">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
          <p className="text-[11px] text-sam-muted">Coin</p>
          <p className="text-base font-bold tabular-nums text-sam-fg">
            {coinBalance == null ? "—" : <CurrencyAmount currency="coin" amount={coinBalance} />}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2">
          <p className="text-[11px] text-sam-muted">Cash</p>
          <p className="text-base font-bold tabular-nums text-sam-fg">
            {cashBalanceMinor == null ? "—" : <CurrencyAmount currency="cash" amount={cashBalanceMinor} isMinor />}
          </p>
        </div>
      </div>
    </section>
  );
}
