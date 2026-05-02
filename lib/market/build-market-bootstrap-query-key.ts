/**
 * 마켓 부트스트랩 요청을 URL 단위로 식별 — RSC 시드와 클라이언트 `fetch`가 같은 키인지 맞춤.
 * `omitJobListFilters: true` 일 때 `jk`/`je`/`avail`/`jr`/`jc` 를 키에서 생략한다(일자리 목록 상단 필터 비사용 정책과 동일).
 */
export function buildMarketBootstrapQueryKey(
  slugOrId: string,
  topic: string,
  jk: string | null | undefined,
  fs: string | null | undefined = null,
  je: string | null | undefined = null,
  avail: string | null | undefined = null,
  jr: string | null | undefined = null,
  jc: string | null | undefined = null,
  options?: { omitJobListFilters?: boolean }
): string {
  const omit = options?.omitJobListFilters === true;
  const t = (topic ?? "").trim().normalize("NFC");
  const j = omit ? "" : (jk ?? "").trim().toLowerCase();
  const sort = (fs ?? "").trim().toLowerCase() || "latest";
  const jef = omit ? "" : (je ?? "").trim().toLowerCase();
  const av = omit ? "" : (avail ?? "").trim() === "1" ? "1" : "";
  const jrp = omit ? "" : (jr ?? "").trim().toLowerCase();
  const jcp = omit ? "" : (jc ?? "").trim().toLowerCase();
  return `${slugOrId.trim()}|${t}|${j}|${sort}|${jef}|${av}|${jrp}|${jcp}`;
}
