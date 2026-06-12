"use client";

/**
 * BN11-B — `/stores` browse hub ambient prewarm(menus/summary) lifecycle.
 * viewport·pointer_enter 등 non-force prewarm 은 공유 AbortSignal 을 쓰고,
 * `/stores` browse 를 벗어나면 in-flight 를 abort + single-flight 키 정리한다.
 * `force: true`(카드 탭 상세) 는 abort 대상에서 제외한다.
 */

import { forgetSingleFlightsWhere } from "@/lib/http/run-single-flight";

let ambientPrewarmController: AbortController | null = null;

function ensureAmbientPrewarmController(): AbortController {
  if (!ambientPrewarmController || ambientPrewarmController.signal.aborted) {
    ambientPrewarmController = new AbortController();
  }
  return ambientPrewarmController;
}

export function normalizeDeliveryPathname(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

/** browse hub — viewport ambient prewarm 허용 표면 */
export function isStoresBrowseHubPath(pathname: string | null | undefined): boolean {
  return normalizeDeliveryPathname(pathname) === "/stores";
}

/** browse hub + 매장 상세 — bottom-nav 이탈 시 abort 제외 대상 */
export function isStoresSurfacePath(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryPathname(pathname);
  return p === "/stores" || p.startsWith("/stores/");
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** non-force prewarm — `/stores` browse in-flight 공유 signal */
export function resolveStoresBrowseAmbientPrewarmSignal(opts?: { force?: boolean }): AbortSignal | undefined {
  if (opts?.force) return undefined;
  if (typeof window === "undefined") return undefined;
  return ensureAmbientPrewarmController().signal;
}

/** `/stores` browse → 비-stores 표면(메신저 등) 이탈 시 ambient menus/summary 정리 */
export function abortStoresBrowseAmbientPrewarm(reason: string): void {
  void reason;
  ambientPrewarmController?.abort();
  ambientPrewarmController = new AbortController();
  forgetSingleFlightsWhere(
    (key) => key.startsWith("stores:api:menus:") || key.startsWith("stores:api:summary:")
  );
}

/** non-force prewarm 시작 전 browse hub 여부 */
export function shouldStartStoresBrowseAmbientPrewarm(opts?: { force?: boolean }): boolean {
  if (opts?.force) return true;
  if (typeof window === "undefined") return false;
  return isStoresBrowseHubPath(window.location.pathname);
}

export function resetDeliveryStoreDetailPrewarmLifecycleForTests(): void {
  ambientPrewarmController?.abort();
  ambientPrewarmController = null;
}
