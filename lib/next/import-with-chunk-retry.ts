/**
 * Next/Webpack `dynamic()` 청크 로드 실패 완화.
 *
 * - dev: HMR·재컴파일 후 열린 탭이 **이전 청크 URL** 을 요청 → ChunkLoadError (오버레이에 stale 표시)
 * - prod: 배포 직후 예전 HTML/탭이 삭제된 청크를 요청할 때 동일
 */

import { noteEntryFailure } from "@/lib/telemetry/entry-telemetry.client";

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
  // C8 관측 — 새로고침 직전 즉시 송신, 다음 문서가 회복 여부(after_reload)를 남긴다. 새로고침 동작은 그대로.
  noteEntryFailure("chunk_reload");
  window.location.reload();
}

/**
 * 같은 빌드로 새로고침을 이미 했으면 다시 하지 않는 키 (R2-b — app-entry-resume-stabilization-plan §1).
 * `SAMARKET_CHUNK_RELOAD_SESSION_KEY` 는 AppBootProvider 가 마운트마다 지워 「페이지 로드당 1회」가 되어, 마운트 뒤에도
 * 계속 실패하는 청크가 있으면 새로고침이 끝없이 반복될 수 있었다. 이 키는 지우지 않는다 — 같은 빌드로 다시 실패하면
 * 새로고침해도 소용없으므로 오류 화면(「다시 시도」)에 맡긴다. 새 배포(빌드 SHA 변경)면 1회 다시 허용.
 */
export const SAMARKET_CHUNK_RELOAD_BUILD_KEY = "samarket:chunk-reload-build";

function currentWebBuildKey(): string {
  const sha = (process.env.NEXT_PUBLIC_WEB_DEPLOY_SHA ?? "").trim();
  return sha || "dev";
}

/**
 * 비통화 경로 전용 — 루트 오류 화면·최상위 오류 화면·AppBootProvider 전역 미처리 거부.
 * 통화 청크 경계(IncomingCallOverlayChunkBoundary·importWithChunkRetry)는 통화 규정상 `scheduleChunkReloadOnce` 그대로.
 * @returns 새로고침을 시작했으면 true
 */
export function scheduleChunkReloadOncePerBuild(): boolean {
  if (typeof window === "undefined") return false;
  const build = currentWebBuildKey();
  try {
    if (sessionStorage.getItem(SAMARKET_CHUNK_RELOAD_BUILD_KEY) === build) return false;
    sessionStorage.setItem(SAMARKET_CHUNK_RELOAD_BUILD_KEY, build);
  } catch {
    // 저장소를 못 쓰면 반복을 막을 수 없다 → 새로고침하지 않고 오류 화면에 맡긴다.
    return false;
  }
  noteEntryFailure("chunk_reload");
  window.location.reload();
  return true;
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
