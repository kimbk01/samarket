import { discardCommunityUploads } from "@/lib/philife/discard-community-uploads";

/**
 * 글쓰기 한 번(작성 세션)에 올린 사진 — 쓰지 않은 사진 정리 요청 (Owner 승인 ③ · 고아 방지 2026-11-01).
 *
 * - `note(url)`: 업로드가 끝난 사진을 기록한다. 세션이 이미 끝났으면(업로드 중 나가기) 바로 정리 요청한다.
 * - `close(keep)`: 등록·수정 성공(keep = 저장된 사진) 또는 나가기(keep 없음) — 안 쓴 사진 정리 후 세션 종료.
 * - `abandon()`: 작성기가 등록·나가기 없이 사라질 때 — 남은 사진 전부 정리.
 * - `reopen()`: 같은 작성기가 다시 붙을 때(개발 StrictMode 재마운트).
 * 서버는 본인·24시간 이내·어디서도 참조 안 되는 사진만 지운다(`community_post_image_discardable`).
 *
 * 정리 경로 (재감사 2026-11-02 · 고아 8개):
 * - ✕·뒤로·등록 → `close` · 작성기 언마운트(화면·탭 이동) → `abandon` · 문서 내려감(새로고침·창 닫기·전체 이동) → `pagehide` 에서 `abandon`
 *   (언마운트 정리는 문서가 내려갈 때 실행되지 않는다).
 * - 앱 프로세스 강제 종료·업로드 응답 전 종료·정리 요청 실패 → 클라이언트가 알 수 없다 → 매일 정리 크론(72시간 경과·미참조)만.
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

/**
 * 문서가 내려갈 때(`pagehide`) 남은 사진 정리 — bfcache 로 보관되는 경우(`persisted`)는 돌아올 수 있어 두고 간다.
 * 정리 요청은 keepalive fetch 라 문서가 내려가는 중에도 전송된다. 반환값 = 구독 해제.
 */
export function abandonWriteUploadSessionOnPageHide(
  session: Pick<WriteUploadSession, "abandon">,
  target: Pick<Window, "addEventListener" | "removeEventListener"> = window
): () => void {
  const onPageHide = (e: Event) => {
    if ((e as PageTransitionEvent).persisted) return;
    session.abandon();
  };
  target.addEventListener("pagehide", onPageHide);
  return () => target.removeEventListener("pagehide", onPageHide);
}
