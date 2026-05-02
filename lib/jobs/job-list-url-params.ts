/**
 * 일자리 마켓 리스트 URL (`jr`/`jc`) — 화이트리스트만 허용.
 */

/** UI 값과 동일한 slug — `posts.region` / `posts.city` 또는 `job_category` 매칭에 사용 */
export const JOB_LIST_REGION_SLUGS = [
  "manila",
  "makati",
  "bgc",
  "pasay",
  "quezon",
  "cebu",
  "clark",
  "davao",
  "other",
] as const;

export type JobListRegionSlug = (typeof JOB_LIST_REGION_SLUGS)[number];

export const JOB_LIST_INDUSTRY_SLUGS = [
  "restaurant",
  "serving_cafe",
  "retail",
  "office",
  "driver",
  "cleaning",
  "massage_spa",
  "construction",
  "online",
  "other",
] as const;

export type JobListIndustrySlug = (typeof JOB_LIST_INDUSTRY_SLUGS)[number];

export function parseJobListRegionParam(raw: string | null | undefined): JobListRegionSlug | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return undefined;
  return (JOB_LIST_REGION_SLUGS as readonly string[]).includes(t) ? (t as JobListRegionSlug) : undefined;
}

export function parseJobListIndustryParam(raw: string | null | undefined): JobListIndustrySlug | undefined {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return undefined;
  return (JOB_LIST_INDUSTRY_SLUGS as readonly string[]).includes(t)
    ? (t as JobListIndustrySlug)
    : undefined;
}
