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
    <div className="mt-8 space-y-6 rounded-ui-rect border border-gray-200 bg-gray-50/80 p-5">
      <div>
        <h3 className="text-[15px] font-semibold text-gray-900">신뢰 점수·배터리(6단) 기준</h3>
        <p className="mt-1 text-[12px] text-gray-500">
          원본은 <strong className="text-gray-800">profiles.trust_score</strong>(0~100, 기본 50)이며, 화면의{" "}
          <strong className="text-gray-800">% 숫자</strong>와 <strong className="text-gray-800">6단계 배터리</strong>는
          아래 규칙으로만 결정됩니다. 당근 매너온도(°C)는 참고용입니다. 구현:{" "}
          <code className="rounded bg-white px-1 text-[11px]">web/lib/trust/trust-score-core.ts</code> (
          <code className="text-[11px]">trustScoreToUiPercent</code>, <code className="text-[11px]">trustScoreToBatteryLevel</code>
          ).
        </p>
      </div>

      <section className="rounded-ui-rect border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
        <h4 className="text-[13px] font-semibold text-emerald-900">0) 배터리 %(UI 표기) 산출</h4>
        <ul className="mt-2 space-y-1.5 text-[13px] text-gray-800">
          <li>
            <strong>표시 %</strong> = 내부 신뢰 점수 <code className="text-[12px]">s</code>에 대해 소수 둘째 자리까지
            반올림 후 0~100으로 자른 값을, 다시 <strong>정수 %로 반올림</strong>한 것과 동일합니다. (코드:{" "}
            <code className="rounded bg-white px-1 text-[12px]">clampTrustScore</code> →{" "}
            <code className="rounded bg-white px-1 text-[12px]">trustScoreToUiPercent</code>)
          </li>
          <li>
            <strong>6칸 채움·단계</strong>는 표시 %가 아니라 같은 내부 점수 <code className="text-[12px]">s</code>를
            구간으로 나눈 <code className="text-[12px]">trustScoreToBatteryLevel(s)</code> 결과입니다. (아래 3) 표)
          </li>
          <li>
            <code className="text-[12px]">trust_score</code>가 없을 때만 레거시 필드로 점수를 만든 뒤 위와 동일하게 %
            · 단계를 냅니다. (아래 2))
          </li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-white bg-white p-4 shadow-sm">
        <h4 className="text-[13px] font-semibold text-gray-900">1) 당근 매너 온도 (참고)</h4>
        <p className="mt-2 text-[13px] leading-relaxed text-gray-700">{DAANGN_MANNER_TEMP_REFERENCE.citationNote}</p>
        <ul className="mt-2 list-inside list-disc text-[12px] text-gray-600">
          <li>
            중립으로 자주 인용되는 예:{" "}
            <strong className="text-gray-800">{DAANGN_MANNER_TEMP_REFERENCE.neutralExampleC}°C</strong>
          </li>
          <li>
            체감 범위 예: 약 {DAANGN_MANNER_TEMP_REFERENCE.typicalRangeC.min}°C ~{" "}
            {DAANGN_MANNER_TEMP_REFERENCE.typicalRangeC.max}°C (참고)
          </li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-white bg-white p-4 shadow-sm">
        <h4 className="text-[13px] font-semibold text-amber-900">2) 레거시 °C → 점수 (manner_temperature)</h4>
        <p className="mt-2 text-[13px] text-gray-700">
          <code className="text-[12px]">trust_score</code>가 없고{" "}
          <code className="text-[12px]">manner_temperature</code>만 있을 때만 아래 식으로 0~100 점으로 환산합니다.{" "}
          <code className="text-[12px]">manner_score</code> 단독은 같은 점수로 간주(추가 °C 환산 없음)합니다.
        </p>
        <ul className="mt-2 space-y-1.5 text-[13px] text-gray-700">
          <li>
            소수이고 0 초과 ~ {KASAMA_LEGACY_TEMP_INPUT_MAX} 이하 →{" "}
            <code className="rounded bg-amber-50 px-1.5 py-0.5 text-[12px]">
              round(clamp((°C ÷ {KASAMA_LEGACY_TEMP_NEUTRAL}) × {KASAMA_NEUTRAL_BATTERY_PERCENT}, 0, 100))
            </code>
          </li>
          <li>그 외 → 0~100 클램프 후 반올림 (정수 점수)</li>
        </ul>
      </section>

      <section className="rounded-ui-rect border border-white bg-white p-4 shadow-sm">
        <h4 className="text-[13px] font-semibold text-sky-900">3) 배터리 단계 — 점수 구간 고정 매핑</h4>
        <p className="mt-2 text-[13px] text-gray-700">
          내부 점수 s(0~100)를 <strong>6등분 ceil이 아니라</strong> 아래 고정 구간으로 단계를 정합니다. 단계 k는 채워지는 칸
          수와 같습니다.
        </p>
        <p className="mt-2 font-mono text-[12px] text-gray-800">{KASAMA_PERCENT_TO_TIER_FORMULA}</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <th className="py-2 pr-3 font-medium">단계</th>
                <th className="py-2 pr-3 font-medium">채움 칸</th>
                <th className="py-2 font-medium">점수 구간</th>
              </tr>
            </thead>
            <tbody>
              {tierRows.map((row) => (
                <tr key={row.tier} className="border-b border-gray-100">
                  <td className="py-2 pr-3 tabular-nums">{row.tier}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.segmentsFilled}</td>
                  <td className="py-2 text-gray-700">{row.percentRangeLabelKo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-gray-500">
          예: 점수 <strong>50</strong> → <strong>3단계(3칸)</strong> · 점수 <strong>75</strong> →{" "}
          <strong>5단계(5칸)</strong>
        </p>
      </section>

      <section className="rounded-ui-rect border border-white bg-white p-4 shadow-sm">
        <h4 className="text-[13px] font-semibold text-gray-900">4) 이벤트·가중·일일 상한 (서버 반영)</h4>
        <ul className="mt-2 list-inside list-disc text-[12px] text-gray-700">
          <li>
            가산 이벤트는 최근 30일이면 <strong>×{TRUST_POLICY_CHEATSHEET.recentPositiveMultiplier}</strong>, 감산은 배율
            없음
          </li>
          <li>
            UTC 기준 <strong>하루 가산 합</strong>은 최대 <strong>+{TRUST_POLICY_CHEATSHEET.dailyPositiveCap}</strong> (
            관리자 조정·감산은 별도)
          </li>
        </ul>
        <div className="mt-3 overflow-x-auto rounded border border-gray-100 bg-gray-50/80 p-2 text-[11px] text-gray-800">
          <table className="w-full min-w-[280px] border-collapse text-left">
            <tbody>
              {(Object.entries(deltas) as [keyof typeof deltas, number][]).map(([k, v]) => (
                <tr key={k} className="border-b border-gray-100 last:border-0">
                  <td className="py-1 pr-2 font-mono text-gray-600">{k}</td>
                  <td className="py-1 tabular-nums">{v > 0 ? `+${v}` : v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-ui-rect border border-white bg-white p-4 shadow-sm">
        <h4 className="text-[13px] font-semibold text-gray-900">5) 산출 흐름 도식</h4>
        <div className="mt-3 rounded-ui-rect bg-gray-50 p-3">
          <BatteryPolicyFlowDiagram />
        </div>
      </section>

      <section className="rounded-ui-rect border border-white bg-white p-4 shadow-sm">
        <h4 className="text-[13px] font-semibold text-gray-900">6) 단계별 아이콘 예시 (1~6칸)</h4>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          {([1, 2, 3, 4, 5, 6] as const).map((t) => {
            const p = TIER_SAMPLE_SCORES[t];
            return (
              <div key={t} className="flex flex-col items-center gap-1">
                <MannerBatteryIcon tier={t as MannerBatteryTier} percent={p} size="sm" />
                <span className="text-[10px] text-gray-500">{t}단계</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-ui-rect border border-dashed border-gray-200 bg-signature/5 p-4">
        <h4 className="text-[13px] font-semibold text-gray-900">미리보기</h4>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="block text-[12px] text-gray-600">
            입력값
            <input
              type="text"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              className="ml-2 mt-1 w-28 rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              placeholder="50"
            />
          </label>
          <fieldset className="flex flex-wrap gap-3 text-[12px] text-gray-700">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="previewMode"
                checked={previewMode === "trust"}
                onChange={() => setPreviewMode("trust")}
              />
              신뢰 점수 (0~100)
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="previewMode"
                checked={previewMode === "legacy_temp"}
                onChange={() => setPreviewMode("legacy_temp")}
              />
              레거시 °C
            </label>
          </fieldset>
          {preview ? (
            <div className="flex items-center gap-3">
              <div className="text-[13px] text-gray-700">
                → <strong className="tabular-nums">{preview.percent}%</strong> · <strong>{preview.tier}단계</strong>
              </div>
              <MannerBatteryIcon tier={preview.tier} percent={preview.percent} size="md" />
            </div>
          ) : (
            <p className="text-[12px] text-red-600">숫자를 입력해 주세요.</p>
          )}
        </div>
      </section>

      <p className="text-[11px] text-gray-400">배터리 시각 단계 수: {BATTERY_SEGMENT_COUNT}</p>
    </div>
  );
}
