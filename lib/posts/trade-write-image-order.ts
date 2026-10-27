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
