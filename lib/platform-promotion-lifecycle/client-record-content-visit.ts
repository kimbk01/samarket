"use client";

import { ensureClientInstanceId, getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { getOrCreatePlatformPopupAppSessionId } from "@/lib/platform-popup/popup-app-session";
import {
  extractEventIdFromHref,
  isPromotionCoordinationChannel,
  type PromotionCoordinationChannel,
} from "@/lib/platform-promotion-lifecycle/content-visit-contract";

/**
 * Fire-and-forget client writer. Never blocks navigation.
 * Only promotion coordination channels; DIRECT is ignored.
 */
export function recordPromotionContentVisitClient(input: {
  hrefOrEventId: string;
  sourceChannel: PromotionCoordinationChannel | string;
  distributionId?: string | null;
}): void {
  const channel = String(input.sourceChannel ?? "").trim();
  if (!isPromotionCoordinationChannel(channel)) return;

  const raw = String(input.hrefOrEventId ?? "").trim();
  if (!raw) return;
  const eventId = raw.startsWith("/") || raw.includes("://") ? extractEventIdFromHref(raw) : raw;
  if (!eventId) return;

  const sessionKey = getOrCreatePlatformPopupAppSessionId();
  const deviceKey = ensureClientInstanceId();

  void fetch("/api/platform-promotion/content-visit", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventId,
      sourceChannel: channel,
      sessionKey,
      deviceKey,
      distributionId: input.distributionId ?? null,
    }),
  }).catch((err) => {
    console.error("[promotion-lifecycle] content_visit_client_failed", err);
  });
}

/** 손님 → 회원 정리 완료 표지 (계정 + 기기). 로그아웃 정리 때 함께 지워져 다음 로그인에 1번 다시 보낸다. */
export const PROMOTION_RECONCILE_DONE_KEY_PREFIX = "dibay:promo_reconcile_done:";

export function promotionReconcileDoneKey(userId: string, deviceKey: string): string {
  return `${PROMOTION_RECONCILE_DONE_KEY_PREFIX}${userId}:${deviceKey}`;
}

function readDone(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDone(key: string): void {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    /* 저장 실패 = 다음 로그인 이벤트에 1번 더 보낸다(서버가 중복 복사를 막는다) */
  }
}

/**
 * 손님 → 회원 정리. 로그인 라이브러리는 앱이 다시 열릴 때마다 `SIGNED_IN` 을 다시 알린다
 * (`@supabase/auth-js` `_onVisibilityChanged` → `_recoverAndRefresh`) — 같은 계정·같은 기기는 성공 1번만 보낸다.
 * 근거: docs/audit/supabase-request-surge-2026-11-18/resume-fixed-cost-design-2026-11-27.md §2
 */
export function reconcileGuestPromotionLifecycleClient(): void {
  if (typeof window === "undefined") return;
  const deviceKey = ensureClientInstanceId();
  if (!deviceKey) return;
  const userId = getBoundAuthUserId();
  const doneKey = userId ? promotionReconcileDoneKey(userId, deviceKey) : null;
  if (doneKey && readDone(doneKey)) return;
  void fetch("/api/platform-promotion/reconcile-guest", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKey }),
  })
    .then(async (res) => {
      if (!doneKey || !res.ok) return;
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (json?.ok === true) writeDone(doneKey);
    })
    .catch((err) => {
      console.error("[promotion-lifecycle] reconcile_guest_client_failed", err);
    });
}
