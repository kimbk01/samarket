"use client";

/**
 * 거래 「판매」 허브(`/market/sell`) 개요 숫자 — 첫 그림 계약 (GROUP 2-B, Owner 승인 2026-11-10).
 *
 * - 첫 렌더: 같은 viewer 의 메모리·sessionStorage 스냅샷(10분)이 있으면 그 값, 없으면 `loading`(값 자리 스켈레톤).
 * - 숫자를 모르면 0 으로 채우지 않는다. 「—」는 조회 실패일 때만 (`docs/mypage-v2/dibay-mypage-v2-integrated-design.md` §158 과 같은 규칙).
 * - 조회는 viewer 당 단일 비행. 실패하면 직전 스냅샷 값은 유지한다.
 * - 스냅샷 키에 viewerId 를 넣어 다른 계정 값은 읽지 않는다.
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { Product } from "@/lib/types/product";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";
import { fetchTradeHistorySalesBySession } from "@/lib/mypage/trade-history-client";
import {
  countActiveListingProducts,
  countOpenSellerChatRows,
} from "@/lib/mypage/seller-listings-with-trades";

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

function readSnapshot(viewerId: string, now: number): SellHubOverviewValues | null {
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
    return parsed.values;
  } catch {
    return null;
  }
}

function writeSnapshot(viewerId: string, values: SellHubOverviewValues): void {
  try {
    window.sessionStorage.setItem(
      SESSION_PREFIX + viewerId,
      JSON.stringify({ viewerId, at: Date.now(), values })
    );
  } catch {
    /* quota/private */
  }
}

/** 동기 시드 — 렌더 전에 호출(네트워크 없음). viewer 가 바뀌면 이전 값을 버린다. */
export function seedSellHubOverview(viewerId: string, now = Date.now()): SellHubOverviewState | null {
  const uid = viewerId.trim();
  if (!uid || typeof window === "undefined") return null;
  if (state?.viewerId === uid) return state;
  const snap = readSnapshot(uid, now);
  state = { viewerId: uid, values: snap, loading: snap === null };
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
    return countActiveListingProducts(data.posts ?? []);
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
    state = { viewerId: uid, values, loading: false };
    if (activeListingCount !== null || openChatCount !== null || performance !== null) {
      writeSnapshot(uid, values);
    }
    emit();
  });
}

/** 로그아웃·계정 전환 */
export function clearSellHubOverview(): void {
  state = null;
  emit();
}

/** 테스트 전용 */
export function __resetSellHubOverviewForTests(): void {
  state = null;
  listeners.clear();
}
