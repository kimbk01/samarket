"use client";

/**
 * 어드민 「CREW REP 정책」 안내 — S7 (Owner 2026-11-16 「S7 진행해」).
 * 표의 모든 숫자는 정책 단일 정의 `lib/trust/crew-rep-policy.ts`·`lib/trust/crew-rep.ts` 에서 바로 읽는다
 * (화면에 숫자를 따로 적지 않는다 — 계산기와 어긋나지 않게). 읽기 전용, 저장할 설정 없음.
 */
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CrewRepBadge } from "@/components/trust/CrewRep";
import { crewRepAxisKey, crewRepEventLabelKey } from "@/components/trust/CrewRepLabels";
import { CREW_REP_TIERS } from "@/lib/trust/crew-rep";
import {
  CREW_REP_AXIS_K,
  CREW_REP_AXIS_WEIGHT,
  CREW_REP_CLEAN_MONTH_POINTS,
  CREW_REP_DECAY_FULL_DAYS,
  CREW_REP_DECAY_HALF_MULT,
  CREW_REP_EVENT_RULES,
  CREW_REP_MANNER_RULES,
  CREW_REP_MANNER_START_ISO,
  CREW_REP_MANUAL_ADJUSTMENT_CAP,
  CREW_REP_PAIR_COOLDOWN_DAYS,
  CREW_REP_PAIR_LIFETIME_MAX,
  CREW_REP_PARTICIPATION_RULES,
  CREW_REP_PARTICIPATION_START_ISO,
  CREW_REP_PARTICIPATION_WEEKLY_CAP,
  CREW_REP_POLICY_VERSION,
  CREW_REP_RATER,
  CREW_REP_SUSPENSION_CAP,
  CREW_REP_TRADE_RATING,
  CREW_REP_WINDOW_DAYS,
} from "@/lib/trust/crew-rep-policy";

/** 옛 이름(trade_review_*)은 같은 규칙이라 표에서 뺀다 */
const HIDDEN_TYPES = new Set(["trade_review_good", "trade_review_normal", "trade_review_bad"]);

const cell = "border border-sam-border-soft px-2 py-1.5 align-top";

export function CrewRepPolicyPanel() {
  const { t } = useI18n();
  const [raw, setRaw] = useState("50");
  const preview = useMemo(() => {
    const n = Number(raw.trim());
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  }, [raw]);

  const rows = Object.entries(CREW_REP_EVENT_RULES).filter(([type]) => !HIDDEN_TYPES.has(type));

  const ruleText = (type: string): string => {
    const r = CREW_REP_EVENT_RULES[type]!;
    const parts: string[] = [];
    if (r.raterWeighted) parts.push(t("admin_crew_rep_rule_rater"));
    if (r.pairRule) parts.push(t("admin_crew_rep_rule_pair", { days: CREW_REP_PAIR_COOLDOWN_DAYS, max: CREW_REP_PAIR_LIFETIME_MAX }));
    if (r.dailyCount != null) parts.push(t("admin_crew_rep_rule_daily_count", { n: r.dailyCount }));
    if (r.dailyPoints != null) parts.push(t("admin_crew_rep_rule_daily_points", { n: r.dailyPoints }));
    if (r.perTargetPoints != null) parts.push(t("admin_crew_rep_rule_per_target", { n: r.perTargetPoints }));
    if (r.oncePerTargetCounterparty) parts.push(t("admin_crew_rep_rule_once_per_person"));
    if (type === "sanction_suspension") parts.push(t("admin_crew_rep_rule_suspension_cap", { n: CREW_REP_SUSPENSION_CAP }));
    if (type === "manual_adjustment") parts.push(t("admin_crew_rep_rule_manual_cap", { n: CREW_REP_MANUAL_ADJUSTMENT_CAP }));
    if (type === "trade_completed") parts.push(t("admin_crew_rep_rule_trade_completed"));
    return parts.join(" · ");
  };

  const pointsText = (type: string): string => {
    const r = CREW_REP_EVENT_RULES[type]!;
    if (r.axis === "ops") return t("admin_crew_rep_points_manual");
    if (r.points === 0) return "0";
    return `${r.sign > 0 ? "+" : "−"}${r.points}`;
  };

  return (
    <div className="space-y-4" data-testid="admin-crew-rep-policy">
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_crew_rep_formula_title")}</h3>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-ui-rect bg-sam-surface-muted p-3 font-mono text-[12px] leading-relaxed text-sam-fg">
{`X = 50 + 50 × (X⁺ − X⁻) / (X⁺ + X⁻ + K)   K: T=${CREW_REP_AXIS_K.trade} · M=${CREW_REP_AXIS_K.manner} · P=${CREW_REP_AXIS_K.participation}
CREW REP = 50 + ${CREW_REP_AXIS_WEIGHT.trade}(T−50) + ${CREW_REP_AXIS_WEIGHT.manner}(M−50) + ${CREW_REP_AXIS_WEIGHT.participation}(P−50) − S ± ${t("admin_crew_rep_manual_short")}(≤${CREW_REP_MANUAL_ADJUSTMENT_CAP})
→ 0~100 · ${t("admin_crew_rep_suspension_short", { n: CREW_REP_SUSPENSION_CAP })}
d: 0~${CREW_REP_DECAY_FULL_DAYS}${t("admin_crew_rep_days")} ×1 · ~${CREW_REP_WINDOW_DAYS}${t("admin_crew_rep_days")} ×${CREW_REP_DECAY_HALF_MULT} · ${t("admin_crew_rep_after_window")} 0`}
        </pre>
        <p className="mt-2 sam-text-helper text-sam-muted">
          {t("admin_crew_rep_formula_note", { version: CREW_REP_POLICY_VERSION })}
        </p>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_crew_rep_tiers_title")}</h3>
        <div className="mt-2 flex flex-wrap gap-3">
          {CREW_REP_TIERS.map((tier) => (
            <div key={tier.tier} className="flex flex-col items-start gap-1">
              <CrewRepBadge score={tier.tier === 3 ? 50 : tier.min} />
              <span className="sam-text-xxs text-sam-muted">
                {tier.min}~{tier.max}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 sam-text-helper text-sam-muted">{t("admin_crew_rep_new_crew_note")}</p>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_crew_rep_events_title")}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse sam-text-helper text-sam-fg">
            <thead>
              <tr className="bg-sam-surface-muted text-left">
                <th className={cell}>{t("admin_crew_rep_th_event")}</th>
                <th className={cell}>{t("admin_crew_rep_th_axis")}</th>
                <th className={cell}>{t("admin_crew_rep_th_points")}</th>
                <th className={cell}>{t("admin_crew_rep_th_rules")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([type, r]) => (
                <tr key={type}>
                  <td className={cell}>
                    {t(crewRepEventLabelKey(type))}
                    <span className="block font-mono sam-text-xxs text-sam-muted">{type}</span>
                  </td>
                  <td className={cell}>{t(crewRepAxisKey(r.axis))}</td>
                  <td className={`${cell} tabular-nums`}>{pointsText(type)}</td>
                  <td className={cell}>{ruleText(type)}</td>
                </tr>
              ))}
              <tr>
                <td className={cell}>{t("crew_rep_event_clean_month")}</td>
                <td className={cell}>{t("crew_rep_axis_manner")}</td>
                <td className={`${cell} tabular-nums`}>+{CREW_REP_CLEAN_MONTH_POINTS}</td>
                <td className={cell}>{t("admin_crew_rep_rule_clean_month")}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 sam-text-helper text-sam-muted">
          {t("admin_crew_rep_events_note", { cap: CREW_REP_PARTICIPATION_WEEKLY_CAP })}
        </p>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_crew_rep_rater_title")}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-helper text-sam-fg">
          <li>{t("admin_crew_rep_rater_full", { days: CREW_REP_RATER.fullMinAccountDays, score: CREW_REP_RATER.fullMinScore })}</li>
          <li>{t("admin_crew_rep_rater_half", { mult: CREW_REP_RATER.unknownMult })}</li>
          <li>{t("admin_crew_rep_rater_zero", { days: CREW_REP_RATER.zeroMaxAccountDays, score: CREW_REP_RATER.zeroBelowScore })}</li>
          <li>
            {t("admin_crew_rep_rater_harsh", {
              min: CREW_REP_RATER.harshMinRatings,
              ratio: Math.round(CREW_REP_RATER.harshBadRatio * 100),
              mult: CREW_REP_RATER.harshMult,
            })}
          </li>
          <li>{t("admin_crew_rep_rater_ring", { n: CREW_REP_RATER.ringMinEachWay, mult: CREW_REP_RATER.ringMult })}</li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_crew_rep_trade_title")}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-helper text-sam-fg">
          <li>
            {t("admin_crew_rep_trade_eligibility", {
              msgs: CREW_REP_TRADE_RATING.minMessagesEach,
              minutes: CREW_REP_TRADE_RATING.minConversationMinutes,
              open: CREW_REP_TRADE_RATING.openAfterFirstMessageDays,
              window: CREW_REP_TRADE_RATING.windowDays,
            })}
          </li>
          <li>{t("admin_crew_rep_trade_reveal", { days: CREW_REP_TRADE_RATING.revealAfterDays })}</li>
          <li>{t("admin_crew_rep_trade_dispute", { days: CREW_REP_TRADE_RATING.disputeDays })}</li>
          <li>
            {t("admin_crew_rep_trade_weight", {
              both: CREW_REP_TRADE_RATING.weightBothYes,
              one: CREW_REP_TRADE_RATING.weightOneYes,
              chat: CREW_REP_TRADE_RATING.weightChatOnly,
            })}
          </li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_crew_rep_sources_title")}</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 sam-text-helper text-sam-fg">
          <li>
            {t("admin_crew_rep_sources_participation", {
              start: CREW_REP_PARTICIPATION_START_ISO.slice(0, 10),
              post: CREW_REP_PARTICIPATION_RULES.postHoldHours,
              comment: CREW_REP_PARTICIPATION_RULES.commentHoldHours,
              chars: CREW_REP_PARTICIPATION_RULES.commentMinChars,
              review: CREW_REP_PARTICIPATION_RULES.storeReviewMaxDaysAfterComplete,
            })}
          </li>
          <li>
            {t("admin_crew_rep_sources_manner", {
              start: CREW_REP_MANNER_START_ISO.slice(0, 10),
              noShow: CREW_REP_MANNER_RULES.moimNoShowHoldDays,
            })}
          </li>
          <li>{t("admin_crew_rep_sources_reports")}</li>
          <li>{t("admin_crew_rep_sources_schedule")}</li>
          <li>{t("admin_crew_rep_sources_order_no_show")}</li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_crew_rep_preview_title")}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="sam-text-helper text-sam-muted">
            {t("admin_crew_rep_preview_input")}
            <input
              type="text"
              inputMode="decimal"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="ml-2 w-24 rounded border border-sam-border px-2 py-1.5 sam-text-body-secondary"
            />
          </label>
          {preview != null ? <CrewRepBadge score={preview} /> : null}
        </div>
      </section>
    </div>
  );
}
