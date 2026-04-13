/**
 * GET /api/app/main-bottom-nav — 하단 탭이 여러 번 마운트되거나(Strict Mode) 동시에 불릴 때 한 번으로 합침.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { KASAMA_MAIN_BOTTOM_NAV_UPDATED } from "@/lib/chats/chat-channel-events";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

/** 짧게: 거래 메뉴·하단 탭 저장 직후 갱신이 오래 남지 않게 */
const TTL_MS = 15_000;
let cached: { expiresAt: number; items: BottomNavItemConfig[] | null } | null = null;

/** 다른 탭·창과 동기화 — storage 이벤트용 */
const MAIN_BOTTOM_NAV_LS_REV_KEY = "kasama:main-bottom-nav:rev";

export type MainBottomNavDedupedResult = {
  ok: boolean;
  items: BottomNavItemConfig[] | null;
};

export type FetchMainBottomNavOptions = {
  /** true면 메모리 캐시 무시 후 네트워크(관리자 저장 직후·관리 화면 이탈 등) */
  force?: boolean;
};

export function fetchMainBottomNavDeduped(
  opts?: FetchMainBottomNavOptions
): Promise<MainBottomNavDedupedResult> {
  if (opts?.force === true) {
    cached = null;
  }
  const now = Date.now();
  if (cached && cached.expiresAt > now && cached.items) {
    return Promise.resolve({ ok: true, items: cached.items });
  }
  return runSingleFlight("app:main-bottom-nav", async (): Promise<MainBottomNavDedupedResult> => {
    try {
      const res = await fetch("/api/app/main-bottom-nav", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        items?: BottomNavItemConfig[];
      };
      if (!data?.ok || !Array.isArray(data.items) || data.items.length === 0) {
        return { ok: false, items: null };
      }
      cached = { items: data.items, expiresAt: Date.now() + TTL_MS };
      return { ok: true, items: data.items };
    } catch {
      return { ok: false, items: null };
    }
  });
}

/** 관리자가 탭을 바꾼 뒤 즉시 반영해야 할 때 */
export function invalidateMainBottomNavDedupedCache(): void {
  cached = null;
}

/**
 * DB 저장 후: 메모리 캐시 무효화 + 같은 브라우저의 다른 탭·BottomNav에 갱신 알림.
 * (하단 탭은 레이아웃에 고정 마운트라 pathname 만으로는 재조회가 안 되던 문제 보완)
 */
export function notifyMainBottomNavConfigChanged(): void {
  invalidateMainBottomNavDedupedCache();
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MAIN_BOTTOM_NAV_LS_REV_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(KASAMA_MAIN_BOTTOM_NAV_UPDATED));
}

export { MAIN_BOTTOM_NAV_LS_REV_KEY };
