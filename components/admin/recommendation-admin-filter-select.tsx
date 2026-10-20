"use client";

/**
 * 추천 관리 화면 필터 선택 (R7) — `AdminFilterBar` 의 도메인 필터(children) 칸.
 * 값은 `useAdminListQuery` 의 추가 키(주소 보존)로 넘긴다. 입력 글자 16px · 높이 40 (필터 바 규격).
 */

export type RecommendationFilterOption = { value: string; label: string };

const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";
const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)] focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-[var(--admin-console-accent)]";

export function RecommendationFilterSelect({
  label,
  value,
  options,
  allLabel,
  onChange,
  name,
}: {
  label: string;
  value: string;
  options: readonly RecommendationFilterOption[];
  /** 「전체」 문구 (value "") */
  allLabel: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  return (
    <label className={LABEL}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} name={name}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
