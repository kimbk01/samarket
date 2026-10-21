"use client";

import { useEffect, useRef } from "react";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import type { MessengerRoomBootstrapRefreshFn } from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";

export const VISIBILITY_CATCHUP_COOLDOWN_MS = 4_000;
const BUS_CATCHUP_COOLDOWN_MS = 2_000;
/** 탭 복귀 직후 full bootstrap refresh 금지 — idle 이후 catch-up 만 */
export const VISIBILITY_RESTORE_QUIET_MS = 900;

/**
 * 복귀 1회 정합 — `after=` 와 최신 창 재조회를 **동시에 시작**한다.
 * 빈 방(앵커 없음)은 `catchUpNewerMessages` 가 내부에서 latest 를 single-flight 로 등록하므로
 * 여기서의 latest 호출은 같은 비행을 공유한다(이전: after= 완료 후 latest 를 한 번 더 → 빈 방 latest 2회).
 * silent_delta(`refresh(true)`, full bootstrap 아님 — 백그라운드 동안 놓친 읽음·통화 배너 정합)는
 * 기존대로 `after=` 가 새 행을 병합하지 않았을 때만.
 */
export async function runMessengerRoomVisibilityResumeCatchup(args: {
  catchUpNewerMessages: () => Promise<boolean>;
  reconcileLatestMessages?: () => Promise<boolean>;
  refresh: MessengerRoomBootstrapRefreshFn;
}): Promise<void> {
  const newer = args.catchUpNewerMessages();
  const latest = args.reconcileLatestMessages ? args.reconcileLatestMessages() : null;
  const merged = await newer;
  if (latest) void latest.catch(() => false);
  if (merged) return;
  void args.refresh(true, { triggerReason: "visibilitychange" });
}

/** 재연결 복구 트리거(I-2) — 모두 `onRoomRealtimeResumed(reason)` 하나로 들어온다. */
export type MessengerRoomResumeReason = "visibilitychange" | "pageshow" | "app_state_active" | "resubscribed";

type ResumeKind = "full" | "catchup";

function resumeKindOf(reason: MessengerRoomResumeReason): ResumeKind {
  /** SUBSCRIBED 재합류는 메시지 정합 1회만(after=) — 복귀 경로의 latest·silent_delta 는 화면 복귀 때만. */
  return reason === "resubscribed" ? "catchup" : "full";
}

export type MessengerRoomResumeCatchupController = {
  /** 문서 hidden / 앱 비활성 — 900ms quiet 창 기준 시각 */
  onHidden: () => void;
  onRoomRealtimeResumed: (reason: MessengerRoomResumeReason) => void;
  dispose: () => void;
};

/**
 * M-7·I-2 — 방 단위 복귀 정합 컨트롤러(React 비의존, 테스트 대상).
 * - hidden 후 900ms 안의 복귀는 **버리지 않고** `hiddenAt + 900ms` 로 지연 예약한다.
 * - 4초 쿨다운 안의 복귀도 버리지 않고 쿨다운 종료 시점으로 1회 예약(예약은 방당 1개로 합친다).
 * - single-flight: 실행 중 새 트리거가 오면 끝난 뒤 1회 더 돌린다.
 * - `resubscribed` 는 quiet·쿨다운 없이 single-flight 만 적용(재합류 사이 누락 구간 1회 정합).
 */
export function createMessengerRoomResumeCatchupController(deps: {
  runFullResume: () => Promise<void>;
  runCatchUpOnly: () => Promise<void>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  quietMs?: number;
  cooldownMs?: number;
}): MessengerRoomResumeCatchupController {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const quietMs = deps.quietMs ?? VISIBILITY_RESTORE_QUIET_MS;
  const cooldownMs = deps.cooldownMs ?? VISIBILITY_CATCHUP_COOLDOWN_MS;

  let disposed = false;
  let hiddenAt = 0;
  let lastFullStartedAt = 0;
  let running = false;
  let rerunKind: ResumeKind | null = null;
  let deferredTimer: unknown = null;

  const mergeKind = (a: ResumeKind | null, b: ResumeKind): ResumeKind => (a === "full" || b === "full" ? "full" : "catchup");

  const execute = (kind: ResumeKind) => {
    if (disposed) return;
    if (running) {
      rerunKind = mergeKind(rerunKind, kind);
      return;
    }
    running = true;
    if (kind === "full") lastFullStartedAt = now();
    const task = kind === "full" ? deps.runFullResume : deps.runCatchUpOnly;
    void Promise.resolve()
      .then(task)
      .catch(() => undefined)
      .finally(() => {
        running = false;
        const again = rerunKind;
        rerunKind = null;
        if (again && !disposed) execute(again);
      });
  };

  const onRoomRealtimeResumed = (reason: MessengerRoomResumeReason) => {
    if (disposed) return;
    const kind = resumeKindOf(reason);
    if (kind === "catchup") {
      execute("catchup");
      return;
    }
    const t = now();
    const quietUntil = hiddenAt > 0 ? hiddenAt + quietMs : 0;
    const cooldownUntil = lastFullStartedAt > 0 ? lastFullStartedAt + cooldownMs : 0;
    const earliest = Math.max(quietUntil, cooldownUntil);
    if (t < earliest) {
      if (deferredTimer != null) return;
      deferredTimer = setTimer(() => {
        deferredTimer = null;
        execute("full");
      }, earliest - t);
      return;
    }
    if (deferredTimer != null) {
      clearTimer(deferredTimer);
      deferredTimer = null;
    }
    execute("full");
  };

  return {
    onHidden: () => {
      hiddenAt = now();
      /** 다시 숨겨지면 예약한 복귀는 다음 복귀가 다시 판단한다. */
      if (deferredTimer != null) {
        clearTimer(deferredTimer);
        deferredTimer = null;
      }
    },
    onRoomRealtimeResumed,
    dispose: () => {
      disposed = true;
      if (deferredTimer != null) clearTimer(deferredTimer);
      deferredTimer = null;
    },
  };
}

type RoomResumeListener = (reason: MessengerRoomResumeReason) => void;
const roomResumeListeners = new Map<string, Set<RoomResumeListener>>();

function resumeRoomKey(roomId: string): string {
  return String(roomId ?? "").trim().toLowerCase();
}

/**
 * 방 Realtime 채널이 **재합류(SUBSCRIBED, 첫 구독 제외)** 했을 때 등 — 그 방의 복귀 정합 1회를 요청한다.
 * 리스너가 없으면 무시(방이 닫혀 있음).
 */
export function notifyMessengerRoomRealtimeResumed(roomId: string, reason: MessengerRoomResumeReason): void {
  const key = resumeRoomKey(roomId);
  if (!key) return;
  const set = roomResumeListeners.get(key);
  if (!set) return;
  for (const l of [...set]) l(reason);
}

function addRoomResumeListener(roomIds: string[], listener: RoomResumeListener): () => void {
  const keys = [...new Set(roomIds.map(resumeRoomKey).filter(Boolean))];
  for (const k of keys) {
    let set = roomResumeListeners.get(k);
    if (!set) {
      set = new Set();
      roomResumeListeners.set(k, set);
    }
    set.add(listener);
  }
  return () => {
    for (const k of keys) {
      const set = roomResumeListeners.get(k);
      if (!set) continue;
      set.delete(listener);
      if (set.size === 0) roomResumeListeners.delete(k);
    }
  };
}

/**
 * 통화 종료 후 탭 복귀 시 스냅샷 정합, 멀티탭에서 동일 방 메시지 시 증분 catch-up.
 * 복귀 트리거: visibilitychange · pageshow · Capacitor `appStateChange`(isActive) · 방 채널 SUBSCRIBED 재합류.
 */
export function useMessengerRoomVisibilityBusCatchup({
  roomId,
  streamRoomId,
  catchUpNewerMessages,
  reconcileLatestMessages,
  refresh,
}: {
  roomId: string;
  streamRoomId: string;
  catchUpNewerMessages: () => Promise<boolean>;
  /** 복귀 시 최신 창 재조회 — 백그라운드 동안의 제자리 갱신·과거 created_at 기록(통화) 정합 */
  reconcileLatestMessages?: () => Promise<boolean>;
  refresh: MessengerRoomBootstrapRefreshFn;
}): void {
  const fnsRef = useRef({ catchUpNewerMessages, reconcileLatestMessages, refresh });
  useEffect(() => {
    fnsRef.current = { catchUpNewerMessages, reconcileLatestMessages, refresh };
  }, [catchUpNewerMessages, reconcileLatestMessages, refresh]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const controller = createMessengerRoomResumeCatchupController({
      runFullResume: () =>
        new Promise<void>((resolve) => {
          scheduleWhenBrowserIdle(() => {
            const f = fnsRef.current;
            /** 메시지 정합 전용 — silent_delta(읽음·통화 배너) 판단은 기존대로 `after=` 결과만 따른다. */
            void runMessengerRoomVisibilityResumeCatchup({
              catchUpNewerMessages: f.catchUpNewerMessages,
              reconcileLatestMessages: f.reconcileLatestMessages,
              refresh: f.refresh,
            }).finally(resolve);
          }, 1200);
        }),
      runCatchUpOnly: async () => {
        await fnsRef.current.catchUpNewerMessages();
      },
    });

    const onVisibility = (ev: Event) => {
      if (document.visibilityState !== "visible") {
        controller.onHidden();
        return;
      }
      controller.onRoomRealtimeResumed(ev.type === "pageshow" ? "pageshow" : "visibilitychange");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);

    let disposed = false;
    let appStateHandle: { remove: () => unknown } | null = null;
    if (isCapacitorNativePlatform()) {
      void import("@capacitor/app")
        .then(({ App }) =>
          App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) controller.onRoomRealtimeResumed("app_state_active");
            else controller.onHidden();
          })
        )
        .then((handle) => {
          if (disposed) void handle.remove();
          else appStateHandle = handle;
        })
        .catch(() => undefined);
    }

    const unlistenRoom = addRoomResumeListener([roomId, streamRoomId], (reason) =>
      controller.onRoomRealtimeResumed(reason)
    );

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
      if (appStateHandle) void appStateHandle.remove();
      appStateHandle = null;
      unlistenRoom();
      controller.dispose();
    };
  }, [roomId, streamRoomId]);

  // Multi-tab: another tab sent a message in this room -> catch up quickly without full reload storms.
  useEffect(() => {
    const route = roomId?.trim();
    const stream = streamRoomId?.trim();
    if (!route && !stream) return;
    let lastAt = 0;
    return onCommunityMessengerBusEvent((ev) => {
      if (ev.type === "cm.room.local_unread" || ev.type === "cm.home.merge_room_summary") return;
      if (ev.type !== "cm.room.message_sent" && ev.type !== "cm.room.bump") return;
      const evr = ev.roomId.trim();
      if (evr !== route && evr !== stream) return;
      const now = Date.now();
      if (now - lastAt < BUS_CATCHUP_COOLDOWN_MS) return;
      lastAt = now;
      scheduleWhenBrowserIdle(() => {
        void (async () => {
          const merged = await catchUpNewerMessages();
          if (merged) return;
          void refresh(true, { triggerReason: "realtime_bus" });
        })();
      }, 640);
    });
  }, [catchUpNewerMessages, refresh, roomId, streamRoomId]);
}
