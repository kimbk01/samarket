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
 *
 * 감사 C (Owner 「결함 수정 진행」 2026-11-10):
 * - 기기 저장값에는 보는 사람 판정(`viewerBypass`)을 넣지 않는다 — 계정을 바꿔도 이전 계정 판정이 쓰이지 않게.
 * - 경로 막기·매장 진입 막기는 `{ confirmedOnly: true }` = 이번 실행에서 서버가 준 값만 쓴다.
 *   기기 저장값(이전 상태)으로 정식 운영 중에 화면을 막지 않는다. 서버 조회 실패면 정식 운영(막지 않음).
 */

const TTL_MS = 20_000;
const LS_KEY = "dibay:delivery-launch-state:v1";

/** 이번 실행에서 서버가 준 값만 담는다(기기 저장값은 넣지 않음) */
let memo: { state: DeliveryLaunchPublicState; expiresAt: number } | null = null;
const listeners = new Set<(s: DeliveryLaunchPublicState) => void>();

function parseState(raw: unknown): DeliveryLaunchPublicState | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    mode: normalizeDeliveryLaunchMode(o.mode),
    freeUntil: normalizeFreeUntil(o.freeUntil),
    freePromoActive: o.freePromoActive === true,
    fabEnabled: o.fabEnabled !== false,
    content: normalizeDeliveryLaunchContent(o.content),
    viewerBypass: o.viewerBypass === true,
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
    window.localStorage.setItem(LS_KEY, JSON.stringify({ ...s, viewerBypass: false }));
  } catch {
    /* 저장 불가 기기 — 무시 */
  }
}

export function peekDeliveryLaunchState(opts?: { confirmedOnly?: boolean }): DeliveryLaunchPublicState | null {
  if (memo && memo.expiresAt > Date.now()) return memo.state;
  if (opts?.confirmedOnly || typeof window === "undefined") return null;
  return readLastKnown();
}

/** 서버 값 — 조회 실패 시 막는 쪽은 정식 운영(막지 않음), 화면 표시 쪽은 마지막 값 */
function fallbackState(confirmedOnly: boolean): DeliveryLaunchPublicState {
  if (confirmedOnly) return memo?.state ?? DEFAULT_DELIVERY_LAUNCH_PUBLIC_STATE;
  return memo?.state ?? readLastKnown() ?? DEFAULT_DELIVERY_LAUNCH_PUBLIC_STATE;
}

export function fetchDeliveryLaunchState(opts?: {
  force?: boolean;
  confirmedOnly?: boolean;
}): Promise<DeliveryLaunchPublicState> {
  if (!opts?.force && memo && memo.expiresAt > Date.now()) return Promise.resolve(memo.state);
  const confirmedOnly = opts?.confirmedOnly === true;
  return runSingleFlight("delivery:launch-state", async (): Promise<DeliveryLaunchPublicState | null> => {
    try {
      const res = await fetch("/api/stores/launch-state", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; state?: unknown };
      const parsed = data?.ok ? parseState(data.state) : null;
      if (!parsed) return null;
      memo = { state: parsed, expiresAt: Date.now() + TTL_MS };
      writeLastKnown(parsed);
      listeners.forEach((fn) => fn(parsed));
      return parsed;
    } catch {
      return null;
    }
  }).then((s) => s ?? fallbackState(confirmedOnly));
}

/**
 * `null` = 아직 모름(첫 방문 기기에서 첫 응답 전) 또는 `enabled=false`.
 * `enabled=false` 면 네트워크를 쓰지 않는다 (배달 밖 화면에서 불필요한 조회 방지).
 */
export function useDeliveryLaunchState(
  enabled = true,
  opts?: { confirmedOnly?: boolean }
): DeliveryLaunchPublicState | null {
  const [state, setState] = useState<DeliveryLaunchPublicState | null>(null);
  const confirmedOnly = opts?.confirmedOnly === true;
  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let alive = true;
    const peek = peekDeliveryLaunchState({ confirmedOnly });
    if (peek) setState(peek);
    const onChange = (s: DeliveryLaunchPublicState) => {
      if (alive) setState(s);
    };
    listeners.add(onChange);
    void fetchDeliveryLaunchState({ confirmedOnly }).then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
      listeners.delete(onChange);
    };
  }, [enabled, confirmedOnly]);
  return state;
}

/** 이 사람 화면에 매장 모집(배너·흐림·FAB·경로 막기)을 적용하는가 — 어드민이 지정한 확인용 계정은 false */
export function isDeliveryRecruiting(state: DeliveryLaunchPublicState | null): boolean {
  return state?.mode === "recruiting" && state.viewerBypass !== true;
}

/** 매장 모집 중인데 보는 사람이 어드민이 지정한 확인용 계정 — 화면은 정식 운영처럼, 주문만 막는다 */
export function isDeliveryRecruitingReviewer(state: DeliveryLaunchPublicState | null): boolean {
  return state?.mode === "recruiting" && state.viewerBypass === true;
}
