/** URL/API `je=` · PostgREST 필터 — 화이트리스트만 허용 */
export const JOB_EMPLOYMENT_FILTER_VALUES = [
  "short",
  "long",
  "one_day",
  "month_plus",
  "fulltime",
] as const;

export type JobEmploymentFilterValue = (typeof JOB_EMPLOYMENT_FILTER_VALUES)[number];

export function parseJobEmploymentFilterParam(raw: string | null | undefined): string | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return undefined;
  return (JOB_EMPLOYMENT_FILTER_VALUES as readonly string[]).includes(t) ? t : undefined;
}
