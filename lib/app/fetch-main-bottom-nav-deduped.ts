/**
 * GET /api/app/main-bottom-nav — 하단 탭이 여러 번 마운트되거나(Strict Mode) 동시에 불릴 때 한 번으로 합침.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

const TTL_MS = 60_000;
let cached: { expiresAt: number; items: BottomNavItemConfig[] | null } | null = null;

export type MainBottomNavDedupedResult = {
  ok: boolean;
  items: BottomNavItemConfig[] | null;
};

export function fetchMainBottomNavDeduped(): Promise<MainBottomNavDedupedResult> {
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
