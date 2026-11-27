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
  notePromotionDeviceStateWrite();

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

/** 손님 → 회원 정리 완료 표지 (계정 + 기기). 값 = 그때의 기기 기록 순번. 로그아웃 정리 때 함께 지워진다. */
export const PROMOTION_RECONCILE_DONE_KEY_PREFIX = "dibay:promo_reconcile_done:";
/**
 * 이 기기의 팝업 숨김·방문 기록 순번. 기록을 보낼 때마다 1 올린다.
 * 세션 만료처럼 로그아웃 정리 없이 손님이 된 뒤 남긴 기록도, 다음 로그인에 순번이 달라 정리를 1번 다시 보낸다.
 */
export const PROMOTION_DEVICE_STATE_SEQ_KEY = "dibay:promo_device_state_seq";

export function promotionReconcileDoneKey(userId: string, deviceKey: string): string {
  return `${PROMOTION_RECONCILE_DONE_KEY_PREFIX}${userId}:${deviceKey}`;
}

function readLs(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLs(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 저장 실패 = 다음 로그인 이벤트에 1번 더 보낸다(서버가 중복 복사를 막는다) */
  }
}

function readDeviceStateSeq(): string {
  return readLs(PROMOTION_DEVICE_STATE_SEQ_KEY) ?? "0";
}

/** 팝업 숨김·방문 기록을 보낼 때 부른다 — 회원·손님 구분 없이(구분은 서버가 한다) */
export function notePromotionDeviceStateWrite(): void {
  if (typeof window === "undefined") return;
  const next = (Number.parseInt(readDeviceStateSeq(), 10) || 0) + 1;
  writeLs(PROMOTION_DEVICE_STATE_SEQ_KEY, String(next));
}

/** 같은 계정·기기 요청이 이미 가는 중이면 겹쳐 보내지 않는다(동시 SIGNED_IN → 서버 동시 복사 방지) */
const reconcileInflight = new Set<string>();

/**
 * 손님 → 회원 정리. 로그인 라이브러리는 앱이 다시 열릴 때마다 `SIGNED_IN` 을 다시 알린다
 * (`@supabase/auth-js` `_onVisibilityChanged` → `_recoverAndRefresh`).
 * 같은 계정·같은 기기는 기기 기록 순번이 바뀌지 않은 동안 성공 1번만 보낸다.
 * 근거: docs/audit/supabase-request-surge-2026-11-18/resume-fixed-cost-design-2026-11-27.md §2
 */
export function reconcileGuestPromotionLifecycleClient(): void {
  if (typeof window === "undefined") return;
  const deviceKey = ensureClientInstanceId();
  if (!deviceKey) return;
  const userId = getBoundAuthUserId();
  const doneKey = userId ? promotionReconcileDoneKey(userId, deviceKey) : null;
  const seqAtSend = readDeviceStateSeq();
  if (doneKey) {
    if (readLs(doneKey) === seqAtSend) return;
    if (reconcileInflight.has(doneKey)) return;
    reconcileInflight.add(doneKey);
  }
  void fetch("/api/platform-promotion/reconcile-guest", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceKey }),
  })
    .then(async (res) => {
      if (!doneKey || !res.ok) return;
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      /** 보내는 사이 새 기록이 생겼으면 그때 순번이 남아 다음에 1번 더 보낸다 */
      if (json?.ok === true) writeLs(doneKey, seqAtSend);
    })
    .catch((err) => {
      console.error("[promotion-lifecycle] reconcile_guest_client_failed", err);
    })
    .finally(() => {
      if (doneKey) reconcileInflight.delete(doneKey);
    });
}
