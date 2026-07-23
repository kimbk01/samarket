import type { RefObject } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
import {
  applyCmParticipantUnreadFullEffects,
  type CmParticipantUnreadFullEffectsArgs,
} from "@/lib/community-messenger/notifications/cm-participant-unread-full-effects";

type TranslateFn = ReturnType<typeof useI18n>["t"];

export type ScheduleParticipantUnreadFullEffectsArgs = Omit<
  CmParticipantUnreadFullEffectsArgs,
  "pathnameRef" | "visibilityRef" | "surfaceRef" | "tRef" | "routerRef"
> & {
  pathnameRef: RefObject<string | null>;
  visibilityRef: RefObject<DocumentVisibilityState>;
  surfaceRef: RefObject<ReturnType<typeof useNotificationSurface>>;
  tRef: RefObject<TranslateFn>;
  routerRef: RefObject<AppRouterInstance>;
};

/** event-path lazy — room snapshot prefetch */
export function prefetchRoomSnapshotLazy(roomId: string): void {
  void import("@/lib/community-messenger/room-snapshot-cache").then((mod) => {
    void mod.prefetchCommunityMessengerRoomSnapshot(roomId, { force: true });
  });
}

/**
 * sound·banner — 정적 import 동기 호출 (Bottom/list 와 같은 턴).
 * (이전 dynamic import 는 청크 로드만큼 알림음이 늦어짐)
 */
export function scheduleParticipantUnreadFullEffects(args: ScheduleParticipantUnreadFullEffectsArgs): void {
  applyCmParticipantUnreadFullEffects(args);
}
