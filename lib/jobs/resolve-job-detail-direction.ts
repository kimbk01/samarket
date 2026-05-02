/**
 * 일자리 상세 구인/구직 — 스펙의 job_direction 과 동일 의미.
 * 저장소는 주로 meta.listing_kind / 레거시 meta.job_type 을 사용한다.
 */
export type JobDetailDirection = "hiring" | "seeking";

const SEEKING_LISTING = new Set(["work", "seeking"]);
const HIRING_LISTING = new Set(["hire", "hiring"]);

export function resolveJobDetailDirection(meta: Record<string, unknown> | null | undefined): JobDetailDirection {
  const m = meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  const jd = String((m as { job_direction?: unknown }).job_direction ?? "")
    .trim()
    .toLowerCase();
  if (jd === "seeking" || jd === "seek") return "seeking";
  if (jd === "hiring" || jd === "hire") return "hiring";

  const lk = String((m as { listing_kind?: unknown }).listing_kind ?? "")
    .trim()
    .toLowerCase();
  if (SEEKING_LISTING.has(lk)) return "seeking";
  if (HIRING_LISTING.has(lk)) return "hiring";

  const jt = String((m as { job_type?: unknown }).job_type ?? "")
    .trim()
    .toLowerCase();
  if (jt === "seek") return "seeking";
  if (jt === "hire") return "hiring";

  return "hiring";
}
