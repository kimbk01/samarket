import { discardCommunityUploads } from "@/lib/philife/discard-community-uploads";

/**
 * 글쓰기 한 번(작성 세션)에 올린 사진 — 쓰지 않은 사진 정리 요청 (Owner 승인 ③ · 고아 방지 2026-11-01).
 *
 * - `note(url)`: 업로드가 끝난 사진을 기록한다. 세션이 이미 끝났으면(업로드 중 나가기) 바로 정리 요청한다.
 * - `close(keep)`: 등록·수정 성공(keep = 저장된 사진) 또는 나가기(keep 없음) — 안 쓴 사진 정리 후 세션 종료.
 * - `abandon()`: 작성기가 등록·나가기 없이 사라질 때 — 남은 사진 전부 정리.
 * - `reopen()`: 같은 작성기가 다시 붙을 때(개발 StrictMode 재마운트).
 * 서버는 본인·24시간 이내·어디서도 참조 안 되는 사진만 지운다(`community_post_image_discardable`).
 */
export type WriteUploadSession = {
  note: (url: string) => void;
  close: (keep: readonly string[]) => void;
  abandon: () => void;
  reopen: () => void;
};

export function createWriteUploadSession(
  discard: (urls: readonly string[]) => void = discardCommunityUploads
): WriteUploadSession {
  const uploads = new Set<string>();
  let closed = false;
  const flush = (keep: readonly string[]) => {
    closed = true;
    const keepSet = new Set(keep);
    const urls = [...uploads].filter((u) => !keepSet.has(u));
    uploads.clear();
    if (urls.length) discard(urls);
  };
  return {
    note: (url) => {
      if (closed) {
        discard([url]);
        return;
      }
      uploads.add(url);
    },
    close: (keep) => flush(keep),
    abandon: () => {
      if (closed) return;
      flush([]);
    },
    reopen: () => {
      closed = false;
    },
  };
}
