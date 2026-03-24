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
      <p className="text-[13px] text-gray-500">
        아래 토글·라벨만 운영설정에 저장됩니다. 배터리에 보이는 <strong className="text-gray-700">%</strong>와 6단
        칸 수·이벤트 가산 근거는 코드 기준이며, 하단 <strong className="text-gray-700">「신뢰 점수·배터리 기준」</strong>
        패널에 정리해 두었습니다.
      </p>
      <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5 text-[12px] leading-relaxed text-gray-700">
        <p className="font-medium text-violet-900">배터리 % (화면 숫자)</p>
        <p className="mt-1 text-gray-600">
          기본 데이터는 <code className="rounded bg-white/80 px-1 text-[11px]">profiles.trust_score</code>(0~100, 기본
          50)입니다. UI에 찍히는 %는 이 점수를 0~100으로 맞춘 뒤 <strong>반올림한 정수</strong>와 같습니다. 6칸
          단계(색·채움)는 같은 점수를 <strong>고정 구간</strong>으로 나눈 결과입니다. 레거시 °C(
          <code className="text-[11px]">manner_temperature</code>)만 별도 환산식이 있습니다.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="trustReviewEnabled"
          checked={values.trustReviewEnabled}
          onChange={(e) => onChange("trustReviewEnabled", e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="trustReviewEnabled" className="text-[14px] text-gray-700">
          후기·신뢰도 사용
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="mannerScoreVisible"
          checked={values.mannerScoreVisible}
          onChange={(e) => onChange("mannerScoreVisible", e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="mannerScoreVisible" className="text-[14px] text-gray-700">
          배터리 노출
        </label>
      </div>
      <div>
        <label htmlFor="speedDisplayLabel" className="block text-[14px] text-gray-700">
          배터리 표시 라벨
        </label>
        <input
          type="text"
          id="speedDisplayLabel"
          value={values.speedDisplayLabel ?? "배터리"}
          onChange={(e) => onChange("speedDisplayLabel", e.target.value.trim() || "배터리")}
          placeholder="배터리"
          className="mt-1 w-full max-w-xs rounded border border-gray-300 px-3 py-2 text-[14px]"
        />
        <p className="mt-0.5 text-[12px] text-gray-500">
          표시 이름 (기본: 배터리)
        </p>
      </div>

      <BatteryPolicyReferencePanel />
    </div>
  );
}
