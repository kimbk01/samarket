"use client";

/**
 * Phase 3 — Canonical Projection Cutover feature flag (READ PATH ONLY).
 *
 * 이 플래그는 메신저 홈 인박스 목록의 **표시 데이터 소스**만 고른다.
 *  - Writer / Reducer / Realtime / Cache / Bootstrap 은 건드리지 않는다 (Phase 2 LOCK).
 *  - 기본값 `legacy` 에서는 렌더 경로가 기존과 완전히 동일하다 (adapter 가 legacy 객체를 그대로 반환).
 *
 * 설계 근거: docs/dibay-messenger-home-inbox-phase3-canonical-projection-cutover-design.md §8
 */

import { useEffect, useState } from "react";
import {
  peekCmHomeCutoverGate,
  resolveCmHomeCutoverReadSource,
  subscribeCmHomeCutoverGate,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-client";

export type MessengerHomeProjectionSource = "legacy" | "canonical" | "dual";

/** 단계별 검증용(dev/staging) — 특정 pillar 만 canonical 로 읽어 3-1~3-5 를 격리 검증한다. 기본 all. */
export type MessengerHomeProjectionPillarScope = "all" | "trade" | "delivery" | "inbox";

export const MESSENGER_HOME_PROJECTION_SOURCE_STORAGE_KEY = "samarket:cm-home-projection-source";
export const MESSENGER_HOME_PROJECTION_PILLAR_STORAGE_KEY = "samarket:cm-home-projection-pillar";
export const MESSENGER_HOME_PROJECTION_SOURCE_CHANGED_EVENT = "samarket:cm-home-projection-source-changed";

function normalizeSource(raw: string | null | undefined): MessengerHomeProjectionSource {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "canonical" || v === "dual" || v === "legacy") return v;
  return "legacy";
}

function normalizePillarScope(raw: string | null | undefined): MessengerHomeProjectionPillarScope {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "trade" || v === "delivery" || v === "inbox" || v === "all") return v;
  return "all";
}

/**
 * SSR·초기 렌더 안전: 값이 없으면 legacy. Production 도 기본 legacy(현재 제품 유지).
 *
 * Runtime Gate 권위:
 *  - Production 은 **localStorage override 를 무시**하고 Gate read(seed-gated) 만 사용한다.
 *    Gate row 가 없으면 Gate read=legacy → 현재 제품과 동일.
 *  - dev/staging 은 Gate 가 canonical/dual 을 켜면 그것을, 아니면 기존 localStorage 검증 override 를 쓴다.
 */
export function readMessengerHomeProjectionSource(): MessengerHomeProjectionSource {
  if (typeof window === "undefined") return "legacy";
  const gateRead = resolveCmHomeCutoverReadSource();
  if (process.env.NODE_ENV === "production") return gateRead;
  if (gateRead !== "legacy") return gateRead;
  try {
    return normalizeSource(window.localStorage.getItem(MESSENGER_HOME_PROJECTION_SOURCE_STORAGE_KEY));
  } catch {
    return "legacy";
  }
}

export function readMessengerHomeProjectionPillarScope(): MessengerHomeProjectionPillarScope {
  if (typeof window === "undefined") return "all";
  const gate = peekCmHomeCutoverGate();
  if (process.env.NODE_ENV === "production") {
    return gate.read !== "legacy" ? gate.pillarScope : "all";
  }
  if (gate.read !== "legacy") return gate.pillarScope;
  try {
    return normalizePillarScope(window.localStorage.getItem(MESSENGER_HOME_PROJECTION_PILLAR_STORAGE_KEY));
  } catch {
    return "all";
  }
}

export type MessengerHomeProjectionFlags = {
  source: MessengerHomeProjectionSource;
  pillarScope: MessengerHomeProjectionPillarScope;
};

/**
 * 홈 컴포넌트에서 사용하는 반응형 플래그.
 * localStorage `storage` 이벤트(다른 탭)와 동일 탭 커스텀 이벤트를 모두 구독한다.
 * 초기값은 마운트 시 1회 동기 읽기 — 기본 legacy 이므로 첫 페인트는 항상 현재 제품과 동일.
 */
export function useMessengerHomeProjectionFlags(): MessengerHomeProjectionFlags {
  const [flags, setFlags] = useState<MessengerHomeProjectionFlags>(() => ({
    source: readMessengerHomeProjectionSource(),
    pillarScope: readMessengerHomeProjectionPillarScope(),
  }));

  useEffect(() => {
    const sync = () => {
      setFlags((prev) => {
        const next: MessengerHomeProjectionFlags = {
          source: readMessengerHomeProjectionSource(),
          pillarScope: readMessengerHomeProjectionPillarScope(),
        };
        if (prev.source === next.source && prev.pillarScope === next.pillarScope) return prev;
        return next;
      });
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(MESSENGER_HOME_PROJECTION_SOURCE_CHANGED_EVENT, sync);
    // Runtime Gate 변경(버전/kill/seedComplete) 시 read source 재평가.
    const unsubscribeGate = subscribeCmHomeCutoverGate(sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(MESSENGER_HOME_PROJECTION_SOURCE_CHANGED_EVENT, sync);
      unsubscribeGate();
    };
  }, []);

  return flags;
}
