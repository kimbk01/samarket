"use client";

/**
 * 상대 회원 CREW REP 배지 + 누르면 공개 요약 시트 — S6 (설계 §4.6).
 * 구매자가 판매자를 볼 때: 거래 평가(T)를 맨 위에, 그 아래 약속·참여 요약. 평가자·날짜·개별 내역은 보이지 않는다.
 * 데이터: GET /api/users/:id/crew-rep (시트를 열 때 1회).
 */
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";
import { CrewRepBadge, CrewRepBar, CrewRepTierChip } from "@/components/trust/CrewRep";
import { buildCrewRepView, CREW_REP_MAX } from "@/lib/trust/crew-rep";
import { tradeReviewTagLabel } from "@/lib/trade/trade-review-tags";

export type CrewRepPublicSummaryView = {
  score: number;
  axes: { trade: number; manner: number; participation: number };
  newCrew: boolean;
  trade: {
    total: number;
    raters: number;
    good: number;
    normal: number;
    bad: number;
    last90d: number;
    topBadTags: string[];
    confirmedTradeReports: number;
  };
  manner: { cleanMonths: number; moimAttended: number; moimNoShow: number; confirmedReports: number };
};

/**
 * 상대 회원 공개 요약 1회 읽기 — 방 데이터에 점수가 없을 때(⋮ 메뉴, 실기 결함 F2).
 * enabled 가 false 이면 요청하지 않는다. 실패하면 null(가짜 값 없음).
 */
export function useCrewRepPublicSummary(userId: string | null, enabled: boolean): CrewRepPublicSummaryView | null {
  const [data, setData] = useState<CrewRepPublicSummaryView | null>(null);
  useEffect(() => {
    if (!enabled || !userId) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}/crew-rep`, { credentials: "include" });
        const json = (await res.json()) as { ok?: boolean } & CrewRepPublicSummaryView;
        if (alive && res.ok && json.ok && Number.isFinite(Number(json.score))) setData(json);
      } catch {
        /* 점수를 모르면 표시하지 않는다 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, userId]);
  return data;
}

export function CrewRepPeerButton({
  userId,
  score,
  name,
  variant = "full",
  /** 판매자로 보이는 화면(상품 상세 등) — 거래 평가의 평가 방향(구매자→판매자) 태그 이름에 쓴다 */
  asSeller = true,
  className = "",
  initialSummary = null,
}: {
  userId: string;
  score: number;
  name: string;
  variant?: "full" | "compact";
  asSeller?: boolean;
  className?: string;
  /** 이미 읽은 공개 요약 — 있으면 시트를 열 때 다시 읽지 않는다 */
  initialSummary?: CrewRepPublicSummaryView | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<CrewRepPublicSummaryView | null>(initialSummary);
  const [failed, setFailed] = useState(false);

  const openSheet = useCallback(async () => {
    setOpen(true);
    if (data) return;
    setFailed(false);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/crew-rep`, { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean } & CrewRepPublicSummaryView;
      if (!res.ok || !json.ok) {
        setFailed(true);
        return;
      }
      setData(json);
    } catch {
      setFailed(true);
    }
  }, [data, userId]);

  const shown = data?.score ?? score;
  const v = buildCrewRepView(shown);
  const tr = data?.trade;
  const pct = (n: number) => (tr && tr.total > 0 ? `${(n / tr.total) * 100}%` : "0%");

  return (
    <>
      <button
        type="button"
        onClick={() => void openSheet()}
        className={`shrink-0 rounded-ui-rect active:opacity-80 ${className}`}
        aria-haspopup="dialog"
        data-testid="crew-rep-peer-button"
      >
        <CrewRepBadge score={score} variant={variant} />
      </button>
      <DibayBottomSheet open={open} onClose={() => setOpen(false)} title={t("crew_rep_peer_title", { name })}>
        <div data-testid="crew-rep-peer-sheet">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-[15px] font-bold tracking-wide text-sam-fg">{t("crew_rep_name")}</span>
            <CrewRepTierChip score={shown} />
            <span className="tabular-nums">
              <span className="text-[24px] font-extrabold" style={{ color: v.color }}>
                {v.score}
              </span>
              <span className="ml-0.5 text-[12px] font-semibold text-sam-muted">/ {CREW_REP_MAX}</span>
            </span>
          </div>
          <CrewRepBar score={shown} className="mt-2" />
          <div className="mt-1 flex justify-between text-[11px] text-sam-muted">
            <span>{t("crew_rep_scale_low")}</span>
            <span>{t("crew_rep_scale_high")}</span>
          </div>

          {failed ? (
            <p className="mt-4 sam-text-helper text-sam-danger">{t("crew_rep_detail_load_failed")}</p>
          ) : !data ? (
            <div className="mt-4 h-28 rounded-ui-rect bg-sam-border-soft/50 motion-safe:animate-pulse" aria-busy="true" />
          ) : (
            <>
              <h3 className="mt-4 sam-text-body font-semibold text-sam-fg">
                {t("crew_rep_peer_trade_title", { score: Math.round(data.axes.trade) })}
              </h3>
              <div className="mt-2 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3">
                <p className="sam-text-body-secondary text-sam-fg">
                  <b>{t("crew_rep_peer_trade_count", { count: data.trade.total, raters: data.trade.raters })}</b>
                  <span className="text-sam-muted"> · {t("crew_rep_peer_trade_90d", { count: data.trade.last90d })}</span>
                </p>
                {data.trade.total > 0 ? (
                  <>
                    <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-sam-surface-muted" aria-hidden>
                      <i style={{ width: pct(data.trade.good), background: "#21885d" }} />
                      <i style={{ width: pct(data.trade.normal), background: "#8A94A0" }} />
                      <i style={{ width: pct(data.trade.bad), background: "#d45252" }} />
                    </div>
                    <p className="mt-1.5 sam-text-helper text-sam-muted">
                      {t("crew_rep_peer_trade_split", { good: data.trade.good, normal: data.trade.normal, bad: data.trade.bad })}
                      {data.trade.topBadTags.length
                        ? ` · ${data.trade.topBadTags
                            .map((k) => tradeReviewTagLabel(t, asSeller ? "buyer_to_seller" : "seller_to_buyer", k))
                            .join(", ")}`
                        : ""}
                    </p>
                  </>
                ) : null}
                {data.trade.total < 3 ? <p className="mt-1.5 sam-text-helper text-sam-muted">{t("crew_rep_peer_trade_few")}</p> : null}
                <p className="mt-2 sam-text-body-secondary text-sam-fg">
                  {t("crew_rep_peer_trade_reports")}{" "}
                  <b className={data.trade.confirmedTradeReports > 0 ? "text-sam-danger" : "text-sam-success"}>
                    {t("crew_rep_peer_count", { count: data.trade.confirmedTradeReports })}
                  </b>
                </p>
              </div>

              <h3 className="mt-4 sam-text-body font-semibold text-sam-fg">{t("crew_rep_peer_more_title")}</h3>
              <ul className="mt-2 divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border-soft bg-sam-surface sam-text-body-secondary">
                <li className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-sam-fg">{t("crew_rep_axis_manner")}</span>
                  <span className="text-sam-muted">
                    <b className="text-sam-fg tabular-nums">{Math.round(data.axes.manner)}</b> ·{" "}
                    {t("crew_rep_peer_manner_line", {
                      months: data.manner.cleanMonths,
                      attended: data.manner.moimAttended,
                      noShow: data.manner.moimNoShow,
                    })}
                  </span>
                </li>
                <li className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-sam-fg">{t("crew_rep_axis_participation")}</span>
                  <b className="text-sam-fg tabular-nums">{Math.round(data.axes.participation)}</b>
                </li>
              </ul>
              {data.newCrew ? <p className="mt-2 sam-text-helper text-sam-muted">{t("crew_rep_new_crew")}</p> : null}
              <p className="mt-3 sam-text-xxs text-sam-muted">{t("crew_rep_peer_privacy")}</p>
            </>
          )}
        </div>
      </DibayBottomSheet>
    </>
  );
}
