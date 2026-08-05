"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { PointBalanceCard } from "@/components/points/PointBalanceCard";
import { PointLedgerList } from "@/components/points/PointLedgerList";
import type { PointLedgerEntry } from "@/lib/types/point";
import { withCustomerCenterFrom } from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { runSingleFlight } from "@/lib/http/run-single-flight";

export default function MyPointsLedgerPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <MyPointsLedgerPageInner />
    </Suspense>
  );
}

function MyPointsLedgerPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = withCustomerCenterFrom("/mypage/points", from);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<PointLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await runSingleFlight("me:points:get", () =>
        fetch("/api/me/points", { credentials: "include", cache: "no-store" }),
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        balance?: unknown;
        ledger?: PointLedgerEntry[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? t("common_content_unavailable"));
        setBalance(0);
        setEntries([]);
        return;
      }
      setBalance(Math.max(0, Number(json.balance ?? 0)));
      setEntries(Array.isArray(json.ledger) ? json.ledger : []);
    } catch {
      setError(t("common_content_unavailable"));
      setBalance(0);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <MySubpageHeader
        title={t("mypage_points_ledger_title")}
        subtitle={t("mypage_points_ledger_subtitle")}
        backHref={backHref}
        preferHistoryBack={false}
        section="account"
        hideCtaStrip
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${CUSTOMER_CENTER_LIST_COLUMN_CLASS} gap-4`}>
          {error ? (
            <div className="rounded-ui-rect border border-red-100 bg-red-50 px-4 py-3 sam-text-body text-red-700">
              {error}
              <button
                type="button"
                className="mt-2 block min-h-11 text-signature underline"
                onClick={() => void load()}
              >
                {t("common_retry")}
              </button>
            </div>
          ) : null}
          {loading ? (
            <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
          ) : (
            <>
              <PointBalanceCard balance={balance} />
              <PointLedgerList entries={entries} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
