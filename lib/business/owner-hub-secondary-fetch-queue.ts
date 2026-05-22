/**
 * `/stores/owner` — 문의·상품·알림 등 2차 API를 **직렬**로만 실행해 연결 풀 Pending 폭주를 막는다.
 * `afterMs` 는 허브 **방문 1회** 기준 목표 시각(HMR·Strict remount 시 재스케줄 금지).
 */
import { isStoreOwnerAdminPathname, isStoreOwnerHubPathname } from "@/lib/business/owner-hub-path";

let hubMountT0 =
  typeof performance !== "undefined" ? performance.now() : 0;

let chain: Promise<void> = Promise.resolve();
const scheduledKeys = new Set<string>();
const completedKeys = new Set<string>();

let activeHubPath: string | null = null;
let hubVisitGeneration = 0;

function normalizeHubPath(pathname?: string | null): string {
  const raw =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  return raw.split("?")[0]?.trim().replace(/\/+$/, "") ?? "";
}

function visitKey(key: string): string {
  return `v${hubVisitGeneration}:${key}`;
}

/**
 * 허브 진입(동일 URL HMR remount 는 no-op) — 큐·완료 키 초기화.
 */
export function enterOwnerHubSecondaryFetchSchedule(pathname?: string | null): void {
  const p = normalizeHubPath(pathname);
  if (!isStoreOwnerHubPathname(p)) return;
  if (activeHubPath === p) return;

  activeHubPath = p;
  hubVisitGeneration += 1;
  hubMountT0 = performance.now();
  chain = Promise.resolve();
  scheduledKeys.clear();
  completedKeys.clear();
}

export function leaveOwnerHubSecondaryFetchSchedule(): void {
  activeHubPath = null;
}

/** @deprecated — `enterOwnerHubSecondaryFetchSchedule` 사용 */
export function resetOwnerHubSecondaryFetchSchedule(): void {
  enterOwnerHubSecondaryFetchSchedule(
    typeof window !== "undefined" ? window.location.pathname : "/stores/owner"
  );
}

export function cancelOwnerHubSecondaryFetchKey(key: string): void {
  const k = key.trim();
  if (!k) return;
  scheduledKeys.delete(visitKey(k));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function scheduleOwnerHubSecondaryFetch(
  run: () => Promise<void>,
  opts?: { afterMs?: number; key?: string }
): void {
  const key = opts?.key?.trim() ?? "";
  const vk = key ? visitKey(key) : "";
  if (vk) {
    if (completedKeys.has(vk) || scheduledKeys.has(vk)) return;
    scheduledKeys.add(vk);
  }

  const afterMs = Math.max(0, opts?.afterMs ?? 0);
  chain = chain
    .then(async () => {
      const elapsed = performance.now() - hubMountT0;
      const wait = Math.max(0, afterMs - elapsed);
      if (wait > 0) await sleep(wait);
      try {
        await run();
      } finally {
        if (vk) {
          scheduledKeys.delete(vk);
          completedKeys.add(vk);
        }
      }
    })
    .catch(() => {
      if (vk) scheduledKeys.delete(vk);
    });
}

/** 허브 2차 fetch 목표 시각(ms) — 문의 → 상품 → 알림 → 기타 전역 */
export const OWNER_HUB_SECONDARY_AFTER_MS = {
  inquiries: 1_200,
  products: 3_600,
  notifications: 4_800,
  notificationSettings: 5_000,
  addressGate: 5_200,
  messengerCallSound: 5_600,
  /** orders list + settlements — 첫 paint 비차단 */
  prefetchOrdersSettlements: 6_000,
} as const;

/** 매장 운영 화면이면 `afterMs` 뒤 직렬 큐, 아니면 즉시 */
export function runNowOrScheduleOnStoreOwnerAdmin(
  run: () => Promise<void>,
  afterMs: number,
  key?: string
): void {
  if (isStoreOwnerAdminPathname()) {
    scheduleOwnerHubSecondaryFetch(run, { afterMs, key });
    return;
  }
  void run().catch(() => {});
}
