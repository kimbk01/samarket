"use client";

import { useEffect, useState } from "react";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  DEFAULT_DELIVERY_LAUNCH_PUBLIC_STATE,
  normalizeDeliveryLaunchContent,
  normalizeDeliveryLaunchMode,
  normalizeFreeUntil,
  type DeliveryLaunchPublicState,
} from "@/lib/delivery/launch/delivery-launch-contract";

/**
 * 배달 오픈 상태 (클라이언트) — `/api/stores/launch-state` 1회 합침 + 짧은 메모리 캐시.
 * 첫 페인트: 이 기기에 마지막으로 받은 상태(localStorage)를 먼저 쓰고 네트워크 값으로 맞춘다.
 * 한 번도 받은 적 없으면 `null`(= 아직 모름) — 화면은 배너 자리만 잡고 목록은 막지 않는다.
 */

const TTL_MS = 20_000;
const LS_KEY = "dibay:delivery-launch-state:v1";

let memo: { state: DeliveryLaunchPublicState; expiresAt: number } | null = null;
const listeners = new Set<(s: DeliveryLaunchPublicState) => void>();

function parseState(raw: unknown): DeliveryLaunchPublicState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    mode: normalizeDeliveryLaunchMode(o.mode),
    freeUntil: normalizeFreeUntil(o.freeUntil),
    freePromoActive: o.freePromoActive === true,
    popupEnabled: o.popupEnabled !== false,
    fabEnabled: o.fabEnabled !== false,
    content: normalizeDeliveryLaunchContent(o.content),
  };
}

function readLastKnown(): DeliveryLaunchPublicState | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? parseState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLastKnown(s: DeliveryLaunchPublicState): void {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* 저장 불가 기기 — 무시 */
  }
}

export function peekDeliveryLaunchState(): DeliveryLaunchPublicState | null {
  if (memo && memo.expiresAt > Date.now()) return memo.state;
  if (typeof window === "undefined") return null;
  return readLastKnown();
}

export function fetchDeliveryLaunchState(opts?: { force?: boolean }): Promise<DeliveryLaunchPublicState> {
  if (!opts?.force && memo && memo.expiresAt > Date.now()) return Promise.resolve(memo.state);
  return runSingleFlight("delivery:launch-state", async () => {
    try {
      const res = await fetch("/api/stores/launch-state", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; state?: unknown };
      const parsed = data?.ok ? parseState(data.state) : null;
      if (!parsed) return memo?.state ?? readLastKnown() ?? DEFAULT_DELIVERY_LAUNCH_PUBLIC_STATE;
      memo = { state: parsed, expiresAt: Date.now() + TTL_MS };
      writeLastKnown(parsed);
      listeners.forEach((fn) => fn(parsed));
      return parsed;
    } catch {
      return memo?.state ?? readLastKnown() ?? DEFAULT_DELIVERY_LAUNCH_PUBLIC_STATE;
    }
  });
}

/**
 * `null` = 아직 모름(첫 방문 기기에서 첫 응답 전) 또는 `enabled=false`.
 * `enabled=false` 면 네트워크를 쓰지 않는다 (배달 밖 화면에서 불필요한 조회 방지).
 */
export function useDeliveryLaunchState(enabled = true): DeliveryLaunchPublicState | null {
  const [state, setState] = useState<DeliveryLaunchPublicState | null>(null);
  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let alive = true;
    const peek = peekDeliveryLaunchState();
    if (peek) setState(peek);
    const onChange = (s: DeliveryLaunchPublicState) => {
      if (alive) setState(s);
    };
    listeners.add(onChange);
    void fetchDeliveryLaunchState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, [enabled]);
  return state;
}

export function isDeliveryRecruiting(state: DeliveryLaunchPublicState | null): boolean {
  return state?.mode === "recruiting";
}
