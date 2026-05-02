/**
 * 일자리 리스트 `jr=` — PostgREST 필터 문자열 조각 (region/city ID는 `regions-data` 와 글쓰기 저장값 일치).
 */
import type { JobListRegionSlug } from "@/lib/jobs/job-list-url-params";

export type JobRegionDbConstraint =
  | { type: "region"; regionId: string }
  | { type: "region_city"; regionId: string; cityId: string }
  | { type: "or_cities"; regionId: string; cityIds: string[] }
  | { type: "region_ilike"; regionPattern: string };

export function jobRegionConstraintForSlug(slug: JobListRegionSlug): JobRegionDbConstraint | null {
  switch (slug) {
    case "manila":
      return { type: "region", regionId: "manila" };
    case "makati":
      return { type: "region_city", regionId: "manila", cityId: "m2" };
    case "bgc":
      return { type: "region_city", regionId: "manila", cityId: "m18" };
    case "pasay":
      return { type: "or_cities", regionId: "manila", cityIds: ["m36", "m37"] };
    case "quezon":
      return { type: "region", regionId: "quezon" };
    case "cebu":
      return { type: "region", regionId: "cebu" };
    case "clark":
      return { type: "region", regionId: "angeles" };
    case "davao":
      return { type: "region_ilike", regionPattern: "davao" };
    case "other":
      return null;
    default:
      return null;
  }
}
