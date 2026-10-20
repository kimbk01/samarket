"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { CurrencyAmount } from "@/components/currency";
import { PointExpiringCard } from "@/components/points/PointExpiringCard";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { withCustomerCenterFrom } from "@/lib/mypage/customer-center-paths";
import {
  CUSTOMER_CENTER_PAGE_SHELL_CLASS,
  CUSTOMER_CENTER_SCROLL_BODY_CLASS,
} from "@/lib/mypage/customer-center-layout";
import { mypageDateGroupKey } from "@/lib/mypage/format-mypage-date";
import { groupExpiringEntriesByMonth } from "@/lib/points/point-expire-utils";
import { fetchMePoints, peekLatestMePoints, type MePointsExpiring } from "@/lib/points/me-points-client";
import { formatExpiringMonthLabel } from "@/lib/points/points-screen-tabs";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

/** S40 에서 넘어온 직후면 같은 응답을 재사용(추가 요청 0) */
const REUSE_S40_RESPONSE_MS = 60_000;

/** S42 스켈레톤 — 합계 카드 + 월 행 3 */
function ExpiringSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <div aria-busy="true" data-testid="points-expiring-skeleton" className="flex flex-col gap-4">
      <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4">
        <span className={`block h-3.5 w-24 ${bone}`} />
        <span className={`mt-2 block h-7 w-[120px] ${bone}`} />
        <span className={`mt-2 block h-3 w-[40%] ${bone}`} />
      </div>
      <div className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-skeleton-row=""
            className="flex min-h-[52px] items-center justify-between border-t border-sam-border-soft px-4 first:border-t-0"
          >
            <span className={`h-3.5 w-24 ${bone}`} />
            <span className={`h-3.5 w-16 ${bone}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MyPointsExpiringPage() {
  return (
    <Suspense fallback={<ExpiringSkeleton />}>
      <MyPointsExpiringPageInner />
    </Suspense>
  );
}

type ViewState = { kind: "loading" } | { kind: "error" } | { kind: "ok"; expiring: MePointsExpiring };

function fromResponse(json: { ok?: boolean; expiring?: MePointsExpiring | null; expiringError?: boolean } | null): ViewState | null {
  if (!json?.ok) return null;
  // A8 — 소멸 조회 실패는 0 이 아니라 오류
  if (json.expiringError || !json.expiring) return { kind: "error" };
  return { kind: "ok", expiring: json.expiring };
}

function MyPointsExpiringPageInner() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = withCustomerCenterFrom("/mypage/points", from);
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  const load = useCallback(async (opts?: { allowCached?: boolean }) => {
    if (opts?.allowCached) {
      const reused = fromResponse(peekLatestMePoints(REUSE_S40_RESPONSE_MS));
      if (reused) {
        setState(reused);
        return;
      }
    }
    setState({ kind: "loading" });
    try {
      const { ok, json } = await fetchMePoints({ filter: "all" });
      setState(ok ? (fromResponse(json) ?? { kind: "error" }) : { kind: "error" });
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void load({ allowCached: true });
  }, [load]);

  const months = useMemo(
    () =>
      state.kind === "ok"
        ? groupExpiringEntriesByMonth(state.expiring.entries ?? [], (iso) => mypageDateGroupKey(iso, "month"))
        : [],
    [state]
  );

  return (
    <div className={CUSTOMER_CENTER_PAGE_SHELL_CLASS}>
      <MySubpageHeader
        title={t("mypage_points_expiring_title")}
        subtitle={t("mypage_points_expiring_subtitle")}
        backHref={backHref}
        preferHistoryBack
        section="account"
        hideCtaStrip
      />
      <div className={CUSTOMER_CENTER_SCROLL_BODY_CLASS}>
        <div className={`${MYPAGE_BODY_COLUMN_CLASS} flex flex-col gap-4 pt-2 pb-6`}>
          {state.kind === "loading" ? (
            <ExpiringSkeleton />
          ) : state.kind === "error" ? (
            // 오류 배너와 0 카드 동시 표시 금지 — 오류 화면만
            <MyStateView
              kind="error"
              error={{ message: t("mypage_oa_expiring_load_failed"), onRetry: () => void load() }}
            />
          ) : state.expiring.totalExpiringPoint <= 0 ? (
            <MyStateView
              kind="empty"
              empty={{
                icon: <CalendarClock className="h-6 w-6" aria-hidden />,
                title: t("mypage_oa_expiring_empty"),
              }}
            />
          ) : (
            <>
              <PointExpiringCard summary={state.expiring} />
              <section
                className="overflow-hidden rounded-ui-rect border border-sam-border-soft bg-sam-surface"
                data-testid="points-expiring-months"
              >
                <h2 className="px-4 pb-2 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-sam-muted">
                  {t("mypage_oa_expiring_by_month")}
                </h2>
                <ul>
                  {months.map((m) => (
                    <li
                      key={m.monthKey}
                      data-expiring-month={m.monthKey}
                      className="flex min-h-[52px] items-center justify-between gap-3 border-t border-sam-border-soft px-4 py-3"
                    >
                      <span className="text-[15px] font-semibold text-sam-fg">
                        {formatExpiringMonthLabel(m.monthKey, language)}
                      </span>
                      <CurrencyAmount currency="point" amount={m.amount} compactPoint className="text-[14px]" />
                    </li>
                  ))}
                </ul>
              </section>
              <p className="sam-text-helper text-sam-muted">{t("mypage_oa_expiring_cap_note")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
