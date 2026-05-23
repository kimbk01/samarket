/**
 * Next/Webpack `dynamic()` 청크 로드 실패 완화.
 *
 * - dev: HMR·재컴파일 후 열린 탭이 **이전 청크 URL** 을 요청 → ChunkLoadError (오버레이에 stale 표시)
 * - prod: 배포 직후 예전 HTML/탭이 삭제된 청크를 요청할 때 동일
 */

export const SAMARKET_CHUNK_RELOAD_SESSION_KEY = "samarket:chunk-reload-once";

export function isWebpackChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "ChunkLoadError") return true;
  return /loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i.test(err.message);
}

export function clearChunkReloadSessionFlag(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SAMARKET_CHUNK_RELOAD_SESSION_KEY);
  } catch {
    /* noop */
  }
}

/** 세션당 1회 전체 새로고침 — 새 manifest·청크 해시를 받기 위함 */
export function scheduleChunkReloadOnce(): void {
  if (typeof window === "undefined") return;
  try {
    const n = Number(sessionStorage.getItem(SAMARKET_CHUNK_RELOAD_SESSION_KEY) ?? "0");
    if (n >= 1) return;
    sessionStorage.setItem(SAMARKET_CHUNK_RELOAD_SESSION_KEY, "1");
  } catch {
    /* noop */
  }
  window.location.reload();
}

export function importWithChunkRetry<T>(loader: () => Promise<T>, retriesLeft = 1): Promise<T> {
  return loader().catch((err: unknown) => {
    if (!isWebpackChunkLoadError(err)) throw err;
    if (retriesLeft > 0) {
      return importWithChunkRetry(loader, retriesLeft - 1);
    }
    scheduleChunkReloadOnce();
    return new Promise<T>(() => {
      /* reload 진행 중 — 무한 pending */
    });
  });
}
