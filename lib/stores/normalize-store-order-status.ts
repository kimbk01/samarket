/**
 * 구매자 목록·필터에서 DB/레거시 표기 차이를 흡수 (탭·뱃지와 일치시키기 위함).
 */
export function normalizeStoreOrderStatusForBuyer(raw: unknown): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  s = s.toLowerCase().replace(/\s+/g, "_");
  if (s === "complete" || s === "done") return "completed";
  return s;
}
