"use client";

import { create } from "zustand";
import type { NotificationPresentation } from "@/lib/notifications/display/notification-presentation";
import type { InboxHrefRow } from "@/lib/notifications/resolve-notification-inbox-href";

/**
 * 앱 안 알림 배너 — 단일 store (Owner 시안 ④ 2026-10-29).
 * 메신저 메시지·부재중(참가자 unread 증가)과 회원 알림(notification_events INSERT Realtime) 이 같은 칸을 쓴다.
 * 표시값은 알림 표시 SSOT `NotificationPresentation` 하나만 그린다.
 */

/** 자동 소멸 — 메신저 배너·고객센터 배너와 같은 4초 */
export const IN_APP_NOTIFICATION_BANNER_AUTO_DISMISS_MS = 4_000;

/** 배너 이미지 대체 — DIBAY 앱 로고 (`public/images/brand`) */
export const IN_APP_NOTIFICATION_BANNER_LOGO_SRC = "/images/brand/dibay-app-icon.png";

export type InAppNotificationBannerTarget =
  | { type: "messenger_room"; roomId: string }
  | {
      type: "notification";
      notificationId: string | null;
      /** 알림센터 행과 같은 입력 — 탭 시 `activateNotificationDestination` 로 같은 목적지 */
      inboxRow: InboxHrefRow;
      /** 미리 판정한 목적지 (현재 화면 비교용) */
      href: string;
    };

export type InAppNotificationBannerItem = {
  presentation: NotificationPresentation;
  target: InAppNotificationBannerTarget;
  count: number;
  updatedAt: number;
  dedupeKey: string;
};

export type InAppNotificationBannerPush = {
  presentation: NotificationPresentation;
  target: InAppNotificationBannerTarget;
  dedupeKey: string;
  /** 지정하면 그 값, 없으면 같은 묶음일 때 +1 */
  count?: number;
};

type State = {
  banner: InAppNotificationBannerItem | null;
  pushOrMerge: (b: InAppNotificationBannerPush) => void;
  dismiss: () => void;
};

/** 같은 대상(대화방·주문)일 때만 묶음 키가 `<대상>:<id>` — 종류 이름뿐인 키(공지·시스템…)는 서로 다른 알림 */
function isTargetThreadKey(threadKey: string): boolean {
  return threadKey.includes(":");
}

/**
 * 같은 대상 묶음(threadKey `room:`·`order:`)이면 개수를 더하고 최신 문구로 바꾼다. 그 밖은 새 배너로 바꾼다.
 * 비어 있는 새 값은 이전 값을 유지한다(메신저 배너 기존 병합 규칙 그대로).
 */
export function mergeInAppNotificationBanner(
  prev: InAppNotificationBannerItem | null,
  next: InAppNotificationBannerPush,
  nowMs: number
): InAppNotificationBannerItem {
  if (
    prev &&
    prev.presentation.threadKey === next.presentation.threadKey &&
    isTargetThreadKey(next.presentation.threadKey)
  ) {
    const p = prev.presentation;
    const n = next.presentation;
    return {
      presentation: {
        ...n,
        title: n.title || p.title,
        body: n.body || p.body,
        imageUrl: n.imageUrl ?? p.imageUrl ?? null,
      },
      target: next.target,
      count: typeof next.count === "number" ? next.count : prev.count + 1,
      updatedAt: nowMs,
      dedupeKey: next.dedupeKey,
    };
  }
  return {
    presentation: next.presentation,
    target: next.target,
    count: Math.max(1, next.count ?? 1),
    updatedAt: nowMs,
    dedupeKey: next.dedupeKey,
  };
}

/** 자동 소멸까지 남은 시간 (갱신 시각 기준) */
export function inAppNotificationBannerRemainingMs(updatedAt: number, nowMs: number): number {
  return Math.max(0, IN_APP_NOTIFICATION_BANNER_AUTO_DISMISS_MS - (nowMs - updatedAt));
}

/** 이미지 — 사진이 없으면 DIBAY 로고 */
export function inAppNotificationBannerImageSrc(presentation: Pick<NotificationPresentation, "imageUrl">): string {
  return presentation.imageUrl || IN_APP_NOTIFICATION_BANNER_LOGO_SRC;
}

export const useInAppNotificationBannerStore = create<State>((set, get) => ({
  banner: null,
  pushOrMerge: (b) => {
    set({ banner: mergeInAppNotificationBanner(get().banner, b, Date.now()) });
  },
  dismiss: () => set({ banner: null }),
}));
