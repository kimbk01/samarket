/**
 * 마켓 부트스트랩 요청을 URL 단위로 식별 — RSC 시드와 클라이언트 `fetch`가 같은 키인지 맞춤.
 */
export function buildMarketBootstrapQueryKey(
  slugOrId: string,
  topic: string,
  jk: string | null | undefined,
  fs: string | null | undefined = null,
  je: string | null | undefined = null,
  avail: string | null | undefined = null
): string {
  const t = (topic ?? "").trim().normalize("NFC");
  const j = (jk ?? "").trim().toLowerCase();
  const sort = (fs ?? "").trim().toLowerCase() || "latest";
  const jef = (je ?? "").trim().toLowerCase();
  const av = (avail ?? "").trim() === "1" ? "1" : "";
  return `${slugOrId.trim()}|${t}|${j}|${sort}|${jef}|${av}`;
}
