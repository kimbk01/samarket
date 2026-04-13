/**
 * 마켓 부트스트랩 요청을 URL 단위로 식별 — RSC 시드와 클라이언트 `fetch`가 같은 키인지 맞춤.
 */
export function buildMarketBootstrapQueryKey(
  slugOrId: string,
  topic: string,
  jk: string | null | undefined
): string {
  const t = (topic ?? "").trim().normalize("NFC");
  const j = (jk ?? "").trim().toLowerCase();
  return `${slugOrId.trim()}|${t}|${j}`;
}
