"use client";

/**
 * `AdminFilterBar` 의 도메인 특수 필터(children)용 선택 상자 — 필터 바와 같은 높이(40)·글자(16px)·라벨 배치.
 * 값은 `useAdminListQuery` 의 상태·추가 키를 그대로 넘긴다 (주소 보존은 훅 책임). 「전체」(value "")를 맨 앞에 자동으로 넣는다.
 */

import type { ReactNode } from "react";

export type AdminFilterSelectOption = { value: string; label: string };

const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)] focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-[var(--admin-console-accent)]";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";

export function AdminFilterSelect({
  ko,
  label,
  value,
  options,
  onChange,
  name,
  allLabel,
  includeAll = true,
  children,
}: {
  ko: boolean;
  label: ReactNode;
  value: string;
  /** 선택지 — 또는 `children` 으로 `<option>` 을 직접 넘긴다 (그때는 「전체」를 자동으로 넣지 않는다). */
  options?: readonly AdminFilterSelectOption[];
  onChange: (value: string) => void;
  name?: string;
  /** 「전체」 대신 쓸 문구 */
  allLabel?: string;
  /** false = 「전체」 없이 하나를 반드시 고르는 선택 (예: 관리 대상 surface) */
  includeAll?: boolean;
  children?: ReactNode;
}) {
  const opts = options ?? [];
  const withAll = !includeAll || opts.some((o) => o.value === "")
    ? opts
    : [{ value: "", label: allLabel ?? (ko ? "전체" : "All") }, ...opts];
  return (
    <label className={LABEL}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} name={name}>
        {children ??
          withAll.map((o) => (
            <option key={o.value || "__all"} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    </label>
  );
}

/** `AdminFilterBar` children 용 날짜 하나 선택 (즉시 적용 값 — 예: 점검 일자). 같은 높이·글자. */
export function AdminFilterDate({
  label,
  value,
  onChange,
  name,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  return (
    <label className={LABEL}>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={FIELD} name={name} />
    </label>
  );
}
