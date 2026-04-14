import type { PostWithMeta } from "@/lib/posts/schema";
import type { CategoryLite } from "@/lib/posts/category-lite";

/** 스펙 서비스 타입 — `category.icon_key`·`meta` 기준 */
export type ServiceSegment = "used" | "car" | "real_estate" | "exchange" | "job";

/**
 * 부동산/환전/중고차 분기와 정합 — `category.icon_key` 우선.
 * 카테고리 로드 전·메타만 있는 경우 보조.
 */
export function resolveServiceSegment(post: PostWithMeta, category: CategoryLite | null): ServiceSegment {
  const meta = (post.meta ?? {}) as Record<string, unknown>;
  const key = category?.icon_key?.trim() ?? "";

  if (key === "used-car") return "car";
  if (key === "real-estate") return "real_estate";
  if (key === "exchange") return "exchange";
  if (key === "jobs" || key === "job") return "job";

  if (!category) {
    if (
      meta.deal_type != null ||
      meta.estate_type != null ||
      meta.deposit != null ||
      meta.monthly != null
    ) {
      return "real_estate";
    }
    if (
      meta.car_model != null ||
      meta.car_year != null ||
      meta.mileage != null ||
      meta.car_trade != null
    ) {
      return "car";
    }
    if (meta.from_currency != null || meta.to_currency != null || meta.exchange_rate != null) {
      return "exchange";
    }
    if (
      meta.job_type != null ||
      meta.work_category != null ||
      meta.listing_kind === "job"
    ) {
      return "job";
    }
  }

  return "used";
}
