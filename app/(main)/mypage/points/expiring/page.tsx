"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { PointExpiringCard } from "@/components/points/PointExpiringCard";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { withCustomerCenterFrom } from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_LIST_COLUMN_CLASS,
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { runSingleFlight } from "@/lib/http/run-single-flight";

type ExpiringSummary = {
  totalExpiringPoint: number;
  nearestExpireAt: string | null;
  expiringEntriesCount: number;
};
const EMPTY_EXPIRING: ExpiringSummary = { totalExpiringPoint: 0, nearestExpireAt: null, expiringEntriesCount: 0 };

export default function MyPointsExpiringPage() {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={3} />}>
      <MyPointsExpiringPageInner />
    </Suspense>
  );
}

function MyPointsExpiringPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = withCustomerCenterFrom("/mypage/points", from);
  const userId = getCurrentUser()?.id ?? "";
  const [expiring, setExpiring] = useState<ExpiringSummary>(EMPTY_EXPIRING);
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
        expiring?: ExpiringSummary;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? t("common_content_unavailable"));
        setExpiring(EMPTY_EXPIRING);
        return;
      }
      setExpiring(json.expiring ?? EMPTY_EXPIRING);
    } catch {
      setError(t("common_content_unavailable"));
      setExpiring(EMPTY_EXPIRING);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => ({
      userId,
      ...expiring,
    }),
    [userId, expiring],
  );

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <MySubpageHeader
        title={t("mypage_points_expiring_title")}
        subtitle={t("mypage_points_expiring_subtitle")}
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
            </div>
          ) : null}
          {loading ? (
            <p className="py-8 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
          ) : (
            <PointExpiringCard summary={summary} />
          )}
        </div>
      </div>
    </div>
  );
}
