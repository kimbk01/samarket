"use client";

/**
 * 거래 「판매」 허브(`/market/sell`) 개요 숫자 — 첫 그림 계약 (GROUP 2-B, Owner 승인 2026-11-10).
 *
 * - 첫 렌더: 같은 viewer 의 메모리·sessionStorage 스냅샷(10분)이 있으면 그 값, 없으면 `loading`(값 자리 스켈레톤).
 * - 숫자를 모르면 0 으로 채우지 않는다. 「—」는 조회 실패일 때만 (`docs/mypage-v2/dibay-mypage-v2-integrated-design.md` §158 과 같은 규칙).
 * - 조회는 viewer 당 단일 비행. 실패하면 직전 스냅샷 값은 유지한다.
 * - 스냅샷 키에 viewerId 를 넣어 다른 계정 값은 읽지 않는다.
 * - 재감사 보완(2026-11-10): 메모리 값도 10분 제한 · 로그아웃·계정 전환 때 메모리와 sessionStorage 전부 폐기 ·
 *   「판매중」 = `/mypage/products` 판매중 탭·내정보 요약과 같은 규칙(`filterMyProductsByListingAxis(...,"active")`).
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { Product } from "@/lib/types/product";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";
import { fetchTradeHistorySalesBySession } from "@/lib/mypage/trade-history-client";
import { countOpenSellerChatRows } from "@/lib/mypage/seller-listings-with-trades";
import { filterMyProductsByListingAxis } from "@/lib/products/my-product-listing-filter";

export type SellHubTradePerformance = { views: number; favorites: number; reports: number };

export type SellHubOverviewValues = {
  activeListingCount: number | null;
  openChatCount: number | null;
  performance: SellHubTradePerformance | null;
};

export type SellHubOverviewState = {
  viewerId: string;
  /** null = 아직 값이 한 번도 없음(스냅샷도 없음) */
  values: SellHubOverviewValues | null;
  /** values 를 받은 시각(ms) — 0 = 값 없음 */
  fetchedAt: number;
  loading: boolean;
};

const SESSION_PREFIX = "dibay.sell-hub-overview.v1:";
export const SELL_HUB_OVERVIEW_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

let state: SellHubOverviewState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeSellHubOverview(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSellHubOverviewState(): SellHubOverviewState | null {
  return state;
}

function readSnapshot(viewerId: string, now: number): { values: SellHubOverviewValues; at: number } | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_PREFIX + viewerId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { viewerId?: string; at?: number; values?: SellHubOverviewValues };
    if ((parsed.viewerId ?? "") !== viewerId || !parsed.values) return null;
    const at = Number(parsed.at ?? 0);
    if (!Number.isFinite(at) || now - at > SELL_HUB_OVERVIEW_SNAPSHOT_TTL_MS) {
      window.sessionStorage.removeItem(SESSION_PREFIX + viewerId);
      return null;
    }
    return { values: parsed.values, at };
  } catch {
    return null;
  }
}

function writeSnapshot(viewerId: string, values: SellHubOverviewValues, at: number): void {
  try {
    window.sessionStorage.setItem(SESSION_PREFIX + viewerId, JSON.stringify({ viewerId, at, values }));
  } catch {
    /* quota/private */
  }
}

/** 동기 시드 — 렌더 전에 호출(네트워크 없음). viewer 가 바뀌면 이전 값을 버린다. */
export function seedSellHubOverview(viewerId: string, now = Date.now()): SellHubOverviewState | null {
  const uid = viewerId.trim();
  if (!uid || typeof window === "undefined") return null;
  /** 같은 viewer 라도 메모리 값이 10분을 넘으면 버린다(sessionStorage 와 같은 제한). */
  if (state?.viewerId === uid && (state.values === null || now - state.fetchedAt <= SELL_HUB_OVERVIEW_SNAPSHOT_TTL_MS)) {
    return state;
  }
  const snap = readSnapshot(uid, now);
  state = snap
    ? { viewerId: uid, values: snap.values, fetchedAt: snap.at, loading: false }
    : { viewerId: uid, values: null, fetchedAt: 0, loading: true };
  return state;
}

async function requestPerformance(): Promise<SellHubTradePerformance | null> {
  try {
    const res = await fetch("/api/my/trade-performance", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as Partial<SellHubTradePerformance> & { ok?: boolean };
    if (!res.ok || !data.ok) return null;
    return {
      views: Number(data.views) || 0,
      favorites: Number(data.favorites) || 0,
      reports: Number(data.reports) || 0,
    };
  } catch {
    return null;
  }
}

async function requestActiveListingCount(): Promise<number | null> {
  try {
    const res = await fetch("/api/my/posts");
    if (!res.ok) return null;
    const data = (await res.json()) as { posts?: Product[] };
    return filterMyProductsByListingAxis(data.posts ?? [], "active").length;
  } catch {
    return null;
  }
}

async function requestOpenChatCount(): Promise<number | null> {
  try {
    const rows: SalesHistoryRow[] = await fetchTradeHistorySalesBySession();
    return countOpenSellerChatRows(rows);
  } catch {
    return null;
  }
}

/** 개요 1회 조회(viewer 당 단일 비행). 응답 도착 때 viewer 가 바뀌었으면 버린다. */
export async function loadSellHubOverview(viewerId: string): Promise<void> {
  const uid = viewerId.trim();
  if (!uid) return;
  seedSellHubOverview(uid);
  await runSingleFlight(`trade:sell-hub-overview:${uid}`, async () => {
    const [performance, activeListingCount, openChatCount] = await Promise.all([
      requestPerformance(),
      requestActiveListingCount(),
      requestOpenChatCount(),
    ]);
    if (!state || state.viewerId !== uid) return;
    const prev = state.values;
    // 실패한 칸은 직전 값 유지(없으면 null = 「—」). 0 으로 채우지 않는다.
    const values: SellHubOverviewValues = {
      activeListingCount: activeListingCount ?? prev?.activeListingCount ?? null,
      openChatCount: openChatCount ?? prev?.openChatCount ?? null,
      performance: performance ?? prev?.performance ?? null,
    };
    const anyFresh = activeListingCount !== null || openChatCount !== null || performance !== null;
    const fetchedAt = anyFresh ? Date.now() : state.fetchedAt;
    state = { viewerId: uid, values, fetchedAt, loading: false };
    if (anyFresh) writeSnapshot(uid, values, fetchedAt);
    emit();
  });
}

function removeAllSnapshots(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(SESSION_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/** 로그아웃·계정 전환 — 메모리·sessionStorage 전부 폐기 */
export function clearSellHubOverview(): void {
  state = null;
  removeAllSnapshots();
  emit();
}

/** 테스트 전용 */
export function __resetSellHubOverviewForTests(): void {
  state = null;
  listeners.clear();
}
