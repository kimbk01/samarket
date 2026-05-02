/**
 * 일자리 리스트 `jc=` — `posts.job_category` 저장값(한글)과 매핑. 글쓰기 `WORK_CATEGORY_OPTIONS` 와 정합.
 */
import type { JobListIndustrySlug } from "@/lib/jobs/job-list-url-params";

/** 동일 버킷에 속할 수 있는 `job_category` 문자열 후보 */
export function jobCategoryValuesForIndustrySlug(slug: JobListIndustrySlug): string[] {
  switch (slug) {
    case "restaurant":
      return ["주방보조/설거지", "주방장/조리사"];
    case "serving_cafe":
      return ["서빙", "매장관리/판매"];
    case "retail":
      return ["매장관리/판매", "재고/물류"];
    case "office":
      return ["사무보조"];
    case "driver":
      return ["배달", "이사/짐"];
    case "cleaning":
      return ["청소"];
    case "massage_spa":
      return ["기타"];
    case "construction":
      return ["이사/짐"];
    case "online":
      return ["재고/물류"];
    case "other":
      return [];
    default:
      return [];
  }
}
