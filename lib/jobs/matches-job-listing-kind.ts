/**
 * 일자리 피드·관리자 필터 — meta.listing_kind / 레거시 job_type
 */

export type JobListingKindFilter = "hire" | "work";

export function postMetaMatchesJobListingKind(
  meta: Record<string, unknown> | null | undefined,
  kind: JobListingKindFilter
): boolean {
  if (!meta || typeof meta !== "object") {
    return kind === "hire";
  }
  const lk = String((meta as { listing_kind?: unknown }).listing_kind ?? "").trim();
  const jt = String((meta as { job_type?: unknown }).job_type ?? "").trim();

  if (kind === "work") {
    return lk === "work" || jt === "seek";
  }
  if (lk === "hire") return true;
  if (lk === "work") return false;
  if (jt === "seek") return false;
  return true;
}
