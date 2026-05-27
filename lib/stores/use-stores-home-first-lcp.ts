"use client";

import { useEffect, useState } from "react";
import {
  STORES_HOME_CLIENT_AFTER_LCP_FALLBACK_MS,
} from "@/lib/stores/stores-home-lcp-policy";

declare global {
  interface Window {
    __storesHomeLcpElement?: {
      startTime: number;
      tagName: string;
      id: string;
      className: string;
      attr: string | null;
      url?: string;
      size?: number;
    } | null;
  }
}

type LcpEntry = PerformanceEntry & {
  element?: Element;
  url?: string;
  size?: number;
};

let lcpSeen = false;
let observerStarted = false;
const subscribers = new Set<() => void>();

function readStoresLcpAttr(el: Element | undefined): string | null {
  let node: Element | null | undefined = el;
  while (node) {
    const hit =
      node.getAttribute("data-stores-lcp") ?? node.getAttribute("data-stores-perf");
    if (hit) return hit;
    node = node.parentElement;
  }
  return null;
}

function captureLcpEntry(entry: LcpEntry): void {
  if (typeof window === "undefined") return;
  const el = entry.element;
  window.__storesHomeLcpElement = {
    startTime: entry.startTime,
    tagName: el?.tagName ?? "",
    id: el?.id ?? "",
    className: typeof el?.className === "string" ? el.className.slice(0, 120) : "",
    attr: readStoresLcpAttr(el),
    url: entry.url,
    size: entry.size,
  };
}

function markLcpSeen(): void {
  if (lcpSeen) return;
  lcpSeen = true;
  for (const fn of subscribers) fn();
  subscribers.clear();
}

function ensureLcpObserver(fallbackMs: number): void {
  if (observerStarted || typeof window === "undefined") return;
  observerStarted = true;

  try {
    const buffered = performance.getEntriesByType("largest-contentful-paint") as LcpEntry[];
    if (buffered.length > 0) {
      captureLcpEntry(buffered[buffered.length - 1]!);
      markLcpSeen();
      return;
    }
  } catch {
    /* noop */
  }

  let obs: PerformanceObserver | null = null;
  try {
    obs = new PerformanceObserver((list) => {
      const entries = list.getEntries() as LcpEntry[];
      const last = entries[entries.length - 1];
      if (last) captureLcpEntry(last);
      if (entries.length > 0) markLcpSeen();
    });
    obs.observe({ type: "largest-contentful-paint", buffered: true } as PerformanceObserverInit);
  } catch {
    markLcpSeen();
  }

  window.setTimeout(markLcpSeen, fallbackMs);
}

/** SSR hero LCP 기록 후 true — client hub·feed rail 단일 게이트 */
export function useStoresHomeFirstLcp(
  fallbackMs = STORES_HOME_CLIENT_AFTER_LCP_FALLBACK_MS
): boolean {
  const [ready, setReady] = useState(() => lcpSeen);

  useEffect(() => {
    if (lcpSeen) {
      setReady(true);
      return;
    }
    const onReady = () => setReady(true);
    subscribers.add(onReady);
    ensureLcpObserver(fallbackMs);
    return () => {
      subscribers.delete(onReady);
    };
  }, [fallbackMs]);

  return ready;
}

/** feed rail — LCP 확정 후에만 food 카드(이미지) 마운트 */
export function useStoresHomeFeedRailLcpGate(): boolean {
  return useStoresHomeFirstLcp();
}

/** React hydration 전·초기에 LCP observer 선기동 — `/stores` page 에서 1회 호출 */
export function ensureStoresHomeLcpObserver(
  fallbackMs = STORES_HOME_CLIENT_AFTER_LCP_FALLBACK_MS
): void {
  ensureLcpObserver(fallbackMs);
}

/** 테스트/HMR */
export function resetStoresHomeFirstLcpForTests(): void {
  lcpSeen = false;
  observerStarted = false;
  subscribers.clear();
  if (typeof window !== "undefined") window.__storesHomeLcpElement = null;
}
