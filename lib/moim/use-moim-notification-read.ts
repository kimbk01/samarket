"use client";

import { useEffect } from "react";
import { postNotificationThreadRead } from "@/lib/notifications/client/notification-event-read-client";
import { getNotificationBadgeCountSnapshot } from "@/lib/notifications/notification-badge-count-store";
import { isMoimNotificationReadTargetPath } from "@/lib/moim/moim-notification-read-target";

/** 같은 경로를 이 시간 안에 다시 열면 읽음 요청을 생략한다 (요청량 — 설계 R2 §3-4) */
const REPEAT_SKIP_MS = 60_000;
const lastSent = new Map<string, number>();

/**
 * 모임 알림이 여는 화면에 들어가 내용이 보이면, 그 화면으로 가는 모임 알림을 읽음으로 (R2 N-06 · 정책 §2 `community_activity`).
 * - `ready` = 화면 데이터를 다 읽어 내용이 보이는 때(정책 §1 「최신 콘텐츠 영역이 로드」).
 * - 커뮤니티 활동 안 읽은 알림이 0 으로 알려져 있으면 부르지 않는다(대부분의 화면 열기는 요청 0).
 */
export function useMoimNotificationRead(path: string | null | undefined, ready: boolean): void {
  useEffect(() => {
    const p = (path ?? "").trim();
    if (!ready || !p || !isMoimNotificationReadTargetPath(p)) return;
    const snap = getNotificationBadgeCountSnapshot();
    if (snap && (snap.communityActivity ?? 0) <= 0) return;
    const now = Date.now();
    if (now - (lastSent.get(p) ?? 0) < REPEAT_SKIP_MS) return;
    lastSent.set(p, now);
    void postNotificationThreadRead(p, {
      threadType: "moim",
      readReason: "moim_target_opened",
      categories: ["community_activity"],
    });
  }, [path, ready]);
}
