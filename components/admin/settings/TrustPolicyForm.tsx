"use client";

import type { AppSettings } from "@/lib/types/admin-settings";
import { BatteryPolicyReferencePanel } from "./BatteryPolicyReferencePanel";

interface TrustPolicyFormProps {
  values: Pick<AppSettings, "trustReviewEnabled" | "mannerScoreVisible" | "speedDisplayLabel">;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

export function TrustPolicyForm({ values, onChange }: TrustPolicyFormProps) {
  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        아래 토글·라벨만 운영설정에 저장됩니다. 배터리에 보이는 <strong className="text-sam-fg">%</strong>와 6단
        칸 수·이벤트 가산 근거는 코드 기준이며, 하단 <strong className="text-sam-fg">「신뢰 점수·배터리 기준」</strong>
        패널에 정리해 두었습니다.
      </p>
      <div className="rounded-ui-rect border border-sam-border bg-signature/5 px-3 py-2.5 sam-text-helper leading-relaxed text-sam-fg">
        <p className="font-medium text-sam-fg">배터리 % (화면 숫자)</p>
        <p className="mt-1 text-sam-muted">
          기본 데이터는 <code className="rounded bg-sam-surface/80 px-1 sam-text-xxs">profiles.trust_score</code>(0~100, 기본
          50)입니다. UI에 찍히는 %는 이 점수를 0~100으로 맞춘 뒤 <strong>반올림한 정수</strong>와 같습니다. 6칸
          단계(색·채움)는 같은 점수를 <strong>고정 구간</strong>으로 나눈 결과입니다. 레거시 °C(
          <code className="sam-text-xxs">manner_temperature</code>)만 별도 환산식이 있습니다.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="trustReviewEnabled"
          checked={values.trustReviewEnabled}
          onChange={(e) => onChange("trustReviewEnabled", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="trustReviewEnabled" className="sam-text-body text-sam-fg">
          후기·신뢰도 사용
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="mannerScoreVisible"
          checked={values.mannerScoreVisible}
          onChange={(e) => onChange("mannerScoreVisible", e.target.checked)}
          className="rounded border-sam-border"
        />
        <label htmlFor="mannerScoreVisible" className="sam-text-body text-sam-fg">
          배터리 노출
        </label>
      </div>
      <div>
        <label htmlFor="speedDisplayLabel" className="block sam-text-body text-sam-fg">
          배터리 표시 라벨
        </label>
        <input
          type="text"
          id="speedDisplayLabel"
          value={values.speedDisplayLabel ?? "배터리"}
          onChange={(e) => onChange("speedDisplayLabel", e.target.value.trim() || "배터리")}
          placeholder="배터리"
          className="mt-1 w-full max-w-xs rounded border border-sam-border px-3 py-2 sam-text-body"
        />
        <p className="mt-0.5 sam-text-helper text-sam-muted">
          표시 이름 (기본: 배터리)
        </p>
      </div>

      <BatteryPolicyReferencePanel />
    </div>
  );
}
