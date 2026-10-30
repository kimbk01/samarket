/**
 * 거래 글쓰기 사진 — 화면 순서(대표 = 첫 장)를 그대로 저장 URL 로 바꾼다 (TM-26).
 * `uploadedInFileOrder` 는 `items` 안 파일 항목 순서와 같은 순서의 업로드 결과 URL.
 * 이미 올라간 URL 과 새 파일이 섞여 있어도, 편집기로 바뀐 대표 사진이 뒤로 밀리지 않는다.
 */
export function mergeTradeWriteImageUrlsInOrder(
  items: ReadonlyArray<{ file?: File | null; url?: string | null }>,
  uploadedInFileOrder: readonly string[]
): string[] {
  const out: string[] = [];
  let fileIdx = 0;
  for (const item of items) {
    if (item.file) {
      const url = uploadedInFileOrder[fileIdx++];
      if (url) out.push(url);
      continue;
    }
    const url = typeof item.url === "string" ? item.url : "";
    if (url && !url.startsWith("blob:")) out.push(url);
  }
  return out;
}

/**
 * 업로드 일부 실패 후 화면 목록 — 성공한 파일 항목은 업로드 주소로 바꾸고 실패한 항목만 파일로 남긴다.
 * 다시 「등록」하면 실패한 사진만 올라간다.
 * `uploadedSnapshot` = 업로드를 시작한 시점 목록(결과 순서 = 그 안 파일 항목 순서). 반영은 **현재 목록** `current` 에
 * 사진 주소(blob url)로 맞춰 한다 — 업로드 중 붙은 기기 보관 `localId`·순서 변경을 덮지 않는다.
 */
export function keepUploadedTradeWriteImages<T extends { file?: File | null; url?: string | null; localId?: string }>(
  current: readonly T[],
  uploadedSnapshot: ReadonlyArray<{ file?: File | null; url?: string | null }>,
  resultsInFileOrder: ReadonlyArray<{ ok: true; url: string } | { ok: false }>
): Array<T | { url: string }> {
  const uploadedByBlobUrl = new Map<string, string>();
  let fileIdx = 0;
  for (const item of uploadedSnapshot) {
    if (!item.file) continue;
    const r = resultsInFileOrder[fileIdx++];
    if (r && r.ok && item.url) uploadedByBlobUrl.set(item.url, r.url);
  }
  return current.map((item) => {
    if (!item.file || !item.url) return item;
    const uploaded = uploadedByBlobUrl.get(item.url);
    return uploaded ? { url: uploaded } : item;
  });
}
