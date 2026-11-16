"use client";

/**
 * 내 CREW REP 상세 — S6 (설계 §4.7): 축별 점수 · 최근 90일 그래프 · 점수 변화 · 반영된 기록(0 처리 사유 포함) · 점수 기준.
 * 데이터: GET /api/me/crew-rep (서버 계산 결과 그대로, 화면에서 다시 계산하지 않는다).
 */
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { buildCrewRepView, CREW_REP_TIERS } from "@/lib/trust/crew-rep";
import {
  crewRepAxisKey,
  crewRepCauseKey,
  crewRepEventLabelKey,
  crewRepZeroReasonKey,
} from "@/components/trust/CrewRepLabels";

type Detail = {
  score: number;
  axes: { trade: number; manner: number; participation: number; sanction: number };
  newCrew: boolean;
  calculatedAt: string | null;
  history: { at: string; before: number | null; after: number; cause: string }[];
  contributions: {
    eventType: string;
    axis: string;
    sign: 1 | -1;
    value: number;
    counted: boolean;
    zeroReason: string | null;
    occurredAt: string;
  }[];
};

/** 필리핀 시간 날짜 MM-DD (Owner 규정: 표시만 PHT) */
const fmt = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(5, 10);
const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(n !== 0 && Math.abs(n) < 1 ? 2 : 1)}`;

function ScoreChart({ history, current, nowMs }: { history: Detail["history"]; current: number; nowMs: number }) {
  const W = 320;
  const H = 120;
  const L = 26;
  const startMs = nowMs - 90 * 86_400_000;
  const pts = [...history.map((h) => ({ t: new Date(h.at).getTime(), v: h.after })), { t: nowMs, v: current }]
    .filter((p) => p.t >= startMs)
    .sort((a, b) => a.t - b.t);
  if (pts.length === 1) pts.unshift({ t: startMs, v: current });
  const x = (t: number) => L + ((t - startMs) / (nowMs - startMs)) * (W - L - 4);
  const y = (v: number) => 4 + ((100 - v) / 100) * (H - 20);
  // 계단형(재계산 시점에 바뀜)
  let d = "";
  pts.forEach((p, i) => {
    if (i === 0) d += `M${x(startMs).toFixed(1)},${y(p.v).toFixed(1)}`;
    else d += ` H${x(p.t).toFixed(1)} V${y(p.v).toFixed(1)}`;
  });
  d += ` H${x(nowMs).toFixed(1)}`;
  const color = buildCrewRepView(current).color;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-hidden data-testid="crew-rep-chart">
      {CREW_REP_TIERS.map((tier) => (
        <rect
          key={tier.tier}
          x={L}
          y={y(tier.max + (tier.tier === 6 ? 0 : 1))}
          width={W - L - 4}
          height={y(tier.min) - y(tier.max + (tier.tier === 6 ? 0 : 1))}
          fill={tier.color}
          opacity={0.07}
        />
      ))}
      {[90, 75, 60, 40, 20].map((v) => (
        <text key={v} x={0} y={y(v) + 3} fontSize={9} fill="currentColor" opacity={0.45}>
          {v}
        </text>
      ))}
      <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
      <circle cx={x(nowMs)} cy={y(current)} r={3.5} fill={color} />
    </svg>
  );
}

export function CrewRepDetailSections() {
  const { t } = useI18n();
  const [data, setData] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const res = await fetch("/api/me/crew-rep", { credentials: "include" });
      const json = (await res.json()) as { ok?: boolean } & Detail;
      if (!res.ok || !json.ok) {
        setFailed(true);
        return;
      }
      setData(json);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <p className="mt-4 sam-text-helper text-sam-danger">{t("crew_rep_detail_load_failed")}</p>;
  if (!data) {
    return <div className="mt-4 h-40 rounded-ui-rect bg-sam-border-soft/50 motion-safe:animate-pulse" aria-busy="true" />;
  }

  const axes: { key: "trade" | "manner" | "participation"; weight: string }[] = [
    { key: "trade", weight: "×0.5" },
    { key: "manner", weight: "×0.3" },
    { key: "participation", weight: "×0.2" },
  ];
  const changes = [...data.history].filter((h) => h.cause !== "carry").reverse().slice(0, 20);

  return (
    <div className="mt-4 space-y-4" data-testid="crew-rep-detail">
      {data.newCrew ? (
        <p className="rounded-ui-rect bg-sam-surface-muted px-3 py-2 sam-text-helper text-sam-muted">{t("crew_rep_new_crew")}</p>
      ) : null}

      <section>
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("crew_rep_axes_title")}</h2>
        <div className="grid grid-cols-4 gap-1.5">
          {axes.map((a) => {
            const v = buildCrewRepView(data.axes[a.key]);
            return (
              <div key={a.key} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-1 py-2 text-center">
                <p className="text-[11px] text-sam-muted">{t(crewRepAxisKey(a.key))}</p>
                <p className="text-[15px] font-bold tabular-nums" style={{ color: v.color }}>
                  {Math.round(data.axes[a.key])}
                </p>
                <p className="text-[10px] text-sam-muted">{a.weight}</p>
              </div>
            );
          })}
          <div className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-1 py-2 text-center">
            <p className="text-[11px] text-sam-muted">{t("crew_rep_axis_sanction")}</p>
            <p className={`text-[15px] font-bold tabular-nums ${data.axes.sanction > 0 ? "text-sam-danger" : "text-sam-muted"}`}>
              {data.axes.sanction > 0 ? `−${Math.round(data.axes.sanction)}` : "0"}
            </p>
            <p className="text-[10px] text-sam-muted">{t("crew_rep_axis_sanction_hint")}</p>
          </div>
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3">
        <h2 className="mb-1 sam-text-body font-semibold text-sam-fg">{t("crew_rep_chart_title")}</h2>
        <div className="text-sam-fg">
          <ScoreChart history={data.history} current={data.score} nowMs={nowMs} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("crew_rep_changes_title")}</h2>
        {changes.length === 0 ? (
          <p className="sam-text-helper text-sam-muted">{t("crew_rep_changes_empty")}</p>
        ) : (
          <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border-soft bg-sam-surface">
            {changes.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex items-center gap-2 px-3 py-2.5 sam-text-body-secondary">
                <span className="shrink-0 text-sam-muted tabular-nums">{fmt(h.at)}</span>
                <span className="min-w-0 flex-1 truncate text-sam-fg">{t(crewRepCauseKey(h.cause))}</span>
                <span className="shrink-0 tabular-nums text-sam-muted">
                  {h.before != null ? `${Math.round(h.before)} → ` : ""}
                  <b className="text-sam-fg">{Math.round(h.after)}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("crew_rep_records_title")}</h2>
        {data.contributions.length === 0 ? (
          <p className="sam-text-helper text-sam-muted">{t("crew_rep_records_empty")}</p>
        ) : (
          <ul className="divide-y divide-sam-border-soft rounded-ui-rect border border-sam-border-soft bg-sam-surface" data-testid="crew-rep-records">
            {data.contributions.map((c, i) => (
              <li key={`${c.occurredAt}-${c.eventType}-${i}`} className="flex items-center gap-2 px-3 py-2.5 sam-text-body-secondary">
                <span className="shrink-0 text-sam-muted tabular-nums">{fmt(c.occurredAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sam-fg">{t(crewRepEventLabelKey(c.eventType))}</span>
                  <span className="block truncate text-[11px] text-sam-muted">
                    {t(crewRepAxisKey(c.axis))}
                    {!c.counted && c.zeroReason ? ` · ${t(crewRepZeroReasonKey(c.zeroReason))}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 font-bold tabular-nums ${
                    !c.counted ? "text-sam-muted" : c.sign > 0 ? "text-sam-success" : "text-sam-danger"
                  }`}
                >
                  {c.counted ? fmtSigned(c.sign * c.value) : "0"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 sam-text-xxs text-sam-muted">{t("crew_rep_records_note")}</p>
      </section>

      <section className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3">
        <h2 className="mb-2 sam-text-body font-semibold text-sam-fg">{t("crew_rep_rules_title")}</h2>
        <ul className="space-y-1.5 sam-text-helper text-sam-muted">
          {(["crew_rep_rule_trade", "crew_rep_rule_manner", "crew_rep_rule_participation", "crew_rep_rule_sanction", "crew_rep_rule_common"] as const).map(
            (k) => (
              <li key={k}>{t(k)}</li>
            )
          )}
        </ul>
      </section>
    </div>
  );
}
