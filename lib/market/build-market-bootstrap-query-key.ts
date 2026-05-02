/**
 * 마켓 부트스트랩 요청을 URL 단위로 식별 — RSC 시드와 클라이언트 `fetch`가 같은 키인지 맞춤.
 * 일자리가 아닌 마켓에서는 `omitJobListFilters` 로 `jk`/`je`/`avail`/`jr`/`jc` 를 키·요청에서 생략한다.
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
