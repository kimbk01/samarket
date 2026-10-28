"use client";

import { messengerInAppBannerPresentation } from "@/lib/community-messenger/notifications/messenger-in-app-banner-content";
import { useInAppNotificationBannerStore } from "@/lib/notifications/in-app-banner/in-app-notification-banner-store";

/**
 * 메신저 → 앱 안 알림 배너 진입점. 배너 칸은 회원 알림과 같은 단일 store
 * (`lib/notifications/in-app-banner/in-app-notification-banner-store`) — 여기서는 메신저 문구를
 * 알림 표시 SSOT 모양으로 바꿔 넣고, 현재 배너가 어느 방 것인지만 돌려준다.
 * 같은 방 병합(개수 +1)·자동 소멸·건너뛰기 규칙은 기존 그대로.
 */
export type MessengerInAppMessageBannerPush = {
  roomId: string;
  title: string;
  preview: string;
  /** 보낸 사람 프로필 사진 — 없으면 기본 얼굴 */
  avatarUrl?: string | null;
  /** 부재중 통화면 "missed_call" — 본문 경고색 */
  kind?: "message" | "missed_call";
  dedupeKey: string;
  count?: number;
};

/** 현재 배너가 메신저 방 배너일 때 그 방 */
export type MessengerInAppMessageBannerView = { roomId: string; dedupeKey: string; count: number };

function currentMessengerBanner(): MessengerInAppMessageBannerView | null {
  const b = useInAppNotificationBannerStore.getState().banner;
  if (!b || b.target.type !== "messenger_room") return null;
  return { roomId: b.target.roomId, dedupeKey: b.dedupeKey, count: b.count };
}

export function pushMessengerInAppMessageBanner(b: MessengerInAppMessageBannerPush): void {
  useInAppNotificationBannerStore.getState().pushOrMerge({
    presentation: messengerInAppBannerPresentation({
      roomId: b.roomId,
      title: b.title,
      preview: b.preview,
      avatarUrl: b.avatarUrl,
      kind: b.kind,
      occurredAt: new Date().toISOString(),
    }),
    target: { type: "messenger_room", roomId: b.roomId },
    dedupeKey: b.dedupeKey,
    count: b.count,
  });
}

/** 메신저 배너만 닫는다 — 다른 종류 배너는 그대로 */
export function dismissMessengerInAppMessageBanner(): void {
  if (!currentMessengerBanner()) return;
  useInAppNotificationBannerStore.getState().dismiss();
}

/** 기존 호출부(`getState().pushOrMerge / banner / dismiss`) 호환 */
export const useMessengerInAppMessageBannerStore = {
  getState: () => ({
    banner: currentMessengerBanner(),
    pushOrMerge: pushMessengerInAppMessageBanner,
    dismiss: dismissMessengerInAppMessageBanner,
  }),
};
