"use client";

import { useMemo, useState } from "react";
import {
  DAANGN_MANNER_TEMP_REFERENCE,
  KASAMA_LEGACY_TEMP_INPUT_MAX,
  KASAMA_LEGACY_TEMP_NEUTRAL,
  KASAMA_NEUTRAL_BATTERY_PERCENT,
  KASAMA_PERCENT_TO_TIER_FORMULA,
  TRUST_POLICY_CHEATSHEET,
  getBatteryTierRangeTable,
  previewBatteryFromRaw,
} from "@/lib/trust/battery-policy-reference";
import type { MannerBatteryTier } from "@/lib/trust/manner-battery";
import { BATTERY_SEGMENT_COUNT } from "@/lib/trust/manner-battery";
import { MannerBatteryIcon } from "@/components/trust/MannerBatteryIcon";
import { BatteryPolicyFlowDiagram } from "./BatteryPolicyDiagram";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 단계별 아이콘 미리보기용 대표 점수(구간 중앙 부근) */
const TIER_SAMPLE_SCORES: Record<MannerBatteryTier, number> = {
  1: 10,
  2: 30,
  3: 50,
  4: 67,
  5: 82,
  6: 95,
};

export function BatteryPolicyReferencePanel() {
  const { t } = useI18n();
  const [rawInput, setRawInput] = useState("50");
  const [previewMode, setPreviewMode] = useState<"trust" | "legacy_temp">("trust");
  const preview = useMemo(() => {
    const n = Number(String(rawInput).replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return previewBatteryFromRaw(n, previewMode);
  }, [rawInput, previewMode]);

  const tierRows = useMemo(() => getBatteryTierRangeTable(), []);
  const deltas = TRUST_POLICY_CHEATSHEET.eventDeltas;

  return (
    <div className="mt-8 space-y-6 rounded-ui-rect border border-sam-border bg-sam-app/80 p-5">
      <div>
        <h3 className="sam-text-body font-semibold text-sam-fg">{t("admin_settings_battery_ref_title")}</h3>
        <p className="mt-1 sam-text-helper text-sam-muted">{t("admin_settings_battery_ref_intro")}</p>
      </div>

      <section className="rounded-ui-rect border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
        <h4 className="sam-text-body-secondary font-semibold text-emerald-900">
          {t("admin_settings_battery_ref_s0_title")}
        </h4>
        <ul className="mt-2 space-y-1.5 sam-text-body-secondary text-sam-fg">
          <li>{t("admin_settings_battery_ref_s0_li1")}</li>
          <li>{t("admin_settings_battery_ref_s0_li2")}</li>
          <li>{t("admin_settings_battery_ref_s0_li3")}</li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-sam-surface bg-sam-surface p-4 shadow-sm">
        <h4 className="sam-text-body-secondary font-semibold text-sam-fg">
          {t("admin_settings_battery_ref_s1_title")}
        </h4>
        <p className="mt-2 sam-text-body-secondary leading-relaxed text-sam-fg">
          {DAANGN_MANNER_TEMP_REFERENCE.citationNote}
        </p>
        <ul className="mt-2 list-inside list-disc sam-text-helper text-sam-muted">
          <li>
            {t("admin_settings_battery_ref_s1_neutral")}{" "}
            <strong className="text-sam-fg">{DAANGN_MANNER_TEMP_REFERENCE.neutralExampleC}°C</strong>
          </li>
          <li>
            {t("admin_settings_battery_ref_s1_range", {
              min: DAANGN_MANNER_TEMP_REFERENCE.typicalRangeC.min,
              max: DAANGN_MANNER_TEMP_REFERENCE.typicalRangeC.max,
            })}
          </li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-sam-surface bg-sam-surface p-4 shadow-sm">
        <h4 className="sam-text-body-secondary font-semibold text-amber-900">
          {t("admin_settings_battery_ref_s2_title")}
        </h4>
        <p className="mt-2 sam-text-body-secondary text-sam-fg">{t("admin_settings_battery_ref_s2_intro")}</p>
        <ul className="mt-2 space-y-1.5 sam-text-body-secondary text-sam-fg">
          <li>
            {t("admin_settings_battery_ref_s2_formula", {
              max: KASAMA_LEGACY_TEMP_INPUT_MAX,
              neutral: KASAMA_LEGACY_TEMP_NEUTRAL,
              percent: KASAMA_NEUTRAL_BATTERY_PERCENT,
            })}
          </li>
          <li>{t("admin_settings_battery_ref_s2_else")}</li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-sam-surface bg-sam-surface p-4 shadow-sm">
        <h4 className="sam-text-body-secondary font-semibold text-sky-900">
          {t("admin_settings_battery_ref_s3_title")}
        </h4>
        <p className="mt-2 sam-text-body-secondary text-sam-fg">{t("admin_settings_battery_ref_s3_intro")}</p>
        <p className="mt-2 font-mono sam-text-helper text-sam-fg">{KASAMA_PERCENT_TO_TIER_FORMULA}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-left sam-text-helper">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app text-sam-muted">
                <th className="py-2 pr-3 font-medium">{t("admin_settings_battery_ref_th_tier")}</th>
                <th className="py-2 pr-3 font-medium">{t("admin_settings_battery_ref_th_segments")}</th>
                <th className="py-2 font-medium">{t("admin_settings_battery_ref_th_range")}</th>
              </tr>
            </thead>
            <tbody>
              {tierRows.map((row) => (
                <tr key={row.tier} className="border-b border-sam-border-soft">
                  <td className="py-2 pr-3 tabular-nums">{row.tier}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.segmentsFilled}</td>
                  <td className="py-2 text-sam-fg">{row.percentRangeLabelKo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 sam-text-xxs text-sam-muted">{t("admin_settings_battery_ref_s3_example")}</p>
      </section>

      <section className="rounded-ui-rect border border-sam-surface bg-sam-surface p-4 shadow-sm">
        <h4 className="sam-text-body-secondary font-semibold text-sam-fg">
          {t("admin_settings_battery_ref_s4_title")}
        </h4>
        <ul className="mt-2 list-inside list-disc sam-text-helper text-sam-fg">
          <li>
            {t("admin_settings_battery_ref_s4_li1", {
              mult: TRUST_POLICY_CHEATSHEET.recentPositiveMultiplier,
            })}
          </li>
          <li>
            {t("admin_settings_battery_ref_s4_li2", {
              cap: TRUST_POLICY_CHEATSHEET.dailyPositiveCap,
            })}
          </li>
        </ul>
        <div className="mt-3 overflow-x-auto rounded border border-sam-border-soft bg-sam-app/80 p-2 sam-text-xxs text-sam-fg">
          <table className="w-full min-w-[280px] border-collapse text-left">
            <tbody>
              {(Object.entries(deltas) as [keyof typeof deltas, number][]).map(([k, v]) => (
                <tr key={k} className="border-b border-sam-border-soft last:border-0">
                  <td className="py-1 pr-2 font-mono text-sam-muted">{k}</td>
                  <td className="py-1 tabular-nums">{v > 0 ? `+${v}` : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-surface bg-sam-surface p-4 shadow-sm">
        <h4 className="sam-text-body-secondary font-semibold text-sam-fg">
          {t("admin_settings_battery_ref_s5_title")}
        </h4>
        <div className="mt-3 rounded-ui-rect bg-sam-app p-3">
          <BatteryPolicyFlowDiagram />
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-surface bg-sam-surface p-4 shadow-sm">
        <h4 className="sam-text-body-secondary font-semibold text-sam-fg">
          {t("admin_settings_battery_ref_s6_title")}
        </h4>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          {([1, 2, 3, 4, 5, 6] as const).map((tier) => {
            const p = TIER_SAMPLE_SCORES[tier];
            return (
              <div key={tier} className="flex flex-col items-center gap-1">
                <MannerBatteryIcon tier={tier as MannerBatteryTier} percent={p} size="sm" />
                <span className="sam-text-xxs text-sam-muted">
                  {t("admin_settings_battery_ref_tier_label", { tier })}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-ui-rect border border-dashed border-sam-border bg-signature/5 p-4">
        <h4 className="sam-text-body-secondary font-semibold text-sam-fg">
          {t("admin_settings_battery_ref_preview")}
        </h4>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="block sam-text-helper text-sam-muted">
            {t("admin_settings_battery_ref_input")}
            <input
              type="text"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              className="ml-2 mt-1 w-28 rounded border border-sam-border px-2 py-1.5 sam-text-body-secondary"
              placeholder="50"
            />
          </label>
          <fieldset className="flex flex-wrap gap-3 sam-text-helper text-sam-fg">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="previewMode"
                checked={previewMode === "trust"}
                onChange={() => setPreviewMode("trust")}
              />
              {t("admin_settings_battery_ref_mode_trust")}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="previewMode"
                checked={previewMode === "legacy_temp"}
                onChange={() => setPreviewMode("legacy_temp")}
              />
              {t("admin_settings_battery_ref_mode_legacy")}
            </label>
          </fieldset>
          {preview ? (
            <div className="flex items-center gap-3">
              <div className="sam-text-body-secondary text-sam-fg">
                {t("admin_settings_battery_ref_preview_result", {
                  percent: preview.percent,
                  tier: preview.tier,
                })}
              </div>
              <MannerBatteryIcon tier={preview.tier} percent={preview.percent} size="md" />
            </div>
          ) : (
            <p className="sam-text-helper text-red-600">{t("admin_settings_battery_ref_invalid_number")}</p>
          )}
        </div>
      </section>

      <p className="sam-text-xxs text-sam-meta">
        {t("admin_settings_battery_ref_segment_count", { count: BATTERY_SEGMENT_COUNT })}
      </p>
    </div>
  );
}
