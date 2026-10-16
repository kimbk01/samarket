"use client";

/**
 * 메신저 '미디어 자동 저장' — **앱 포그라운드 전역** 실행기 (메인 셸에 1회 마운트).
 *
 * 비용 계약: Capacitor 네이티브가 아니거나, 설정 OFF, 로그인 없음, 바이너리가 saveImages 미지원이면
 * 버스 구독·타이머·네트워크를 **하나도** 만들지 않는다. 새 Realtime 채널을 열지 않는다.
 *
 * 입력(모두 `autoSaveIncomingMessengerImages` 로 합류 — 원장/inflight 로 같은 id 는 1회만 저장):
 * 1) 버스 `cm.room.incoming_message` — 홈 목록 Realtime·열린 방 ingest 가 이미 발행하는 메시지 행(스냅샷).
 * 2) 버스 `cm.room.bump` — 전역 참여자 Realtime(`useCmParticipantsHubSync`)의 unread 증가 신호(행 없음)
 *    → 디바운스된 catch-up 조회로 메시지를 가져온다(홈/방 밖에서도 동작).
 * 3) 마운트·`visibilitychange → visible`(앱 포그라운드 복귀) → catch-up 조회.
 *
 * 알림: 짧은 창(실시간·catch-up 합산)마다 스낵바 1회(`cm_ui_photo_auto_saved_count`).
 * 스낵바 호스트는 메신저 레이아웃에만 있으므로 그 밖에서는 조용히 저장만 된다.
 *
 * 권한: 설정을 켤 때 미리 권한을 요청하지 않는다 — 저장 없이 add-only 권한만 요청하는 네이티브 API 가 없고,
 * 첫 자동 저장 시점에 OS 팝업이 1회 뜬다(거부 시 「설정 열기」 액션 제공).
 */
import { useEffect, useState } from "react";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import {
  autoSaveIncomingMessengerImages,
  messengerImageAutoSaveCatchUpSinceMs,
  noteMessengerImageAutoSaveCatchUpPage,
  type MessengerImageAutoSaveBatchSummary,
} from "@/lib/community-messenger/attachment/messenger-image-auto-save";
import {
  MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_PATH,
  messengerAutoSaveMessageFromRow,
} from "@/lib/community-messenger/attachment/messenger-image-auto-save-candidates";
import {
  openMessengerAppSettings,
  probeMessengerNativeImageSaveSupport,
} from "@/lib/community-messenger/attachment/messenger-photo-library";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";
import { onCommunityMessengerBusEvent, type MessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  COMMUNITY_MESSENGER_PREFERENCE_EVENT,
  readCommunityMessengerLocalSettings,
} from "@/lib/community-messenger/preferences";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { getSupabaseClient } from "@/lib/supabase/client";

/** 실시간 행을 모아 한 배치로 저장(알림도 1회) */
export const MESSENGER_AUTO_SAVE_REALTIME_COALESCE_MS = 700;
/** unread 증가 신호 → catch-up 디바운스 */
export const MESSENGER_AUTO_SAVE_BUMP_CATCH_UP_DEBOUNCE_MS = 1_500;
/** catch-up 최소 간격(서버 rate limit 30/min 보다 충분히 여유) */
export const MESSENGER_AUTO_SAVE_CATCH_UP_MIN_GAP_MS = 5_000;
/** 여러 배치 결과를 한 스낵바로 합치는 창 */
export const MESSENGER_AUTO_SAVE_NOTICE_COALESCE_MS = 1_200;

export type MessengerImageAutoSaveSourceAction =
  | { kind: "messages"; roomId: string; messages: CommunityMessengerMessage[] }
  | { kind: "catch_up"; roomId: string }
  | { kind: "room_signal"; roomId: string }
  | null;

/**
 * 버스 이벤트 → 자동 저장 입력 선택 (순수 함수 — 테스트 대상).
 * - 다른 계정용 이벤트, 내 메시지, 이미지가 아닌 행은 무시.
 * - `cm.room.bump` 는 행이 없으므로 catch-up 조회로 대체.
 * - 이 시청자의 다른 incoming 행(내 메시지·비이미지)은 `room_signal` — 그 방의 bump 는 이미 실시간으로
 *   전달됐으므로 catch-up 이 필요 없다는 표시로만 쓴다.
 */
export function selectMessengerImageAutoSaveSourceAction(
  ev: MessengerBusEvent,
  viewerUserId: string,
): MessengerImageAutoSaveSourceAction {
  const viewer = viewerUserId.trim();
  if (!viewer) return null;
  if (ev.type === "cm.room.incoming_message") {
    if (String(ev.viewerUserId ?? "").trim() !== viewer) return null;
    const roomId = String(ev.roomId ?? "").trim();
    if (!roomId) return null;
    const m = messengerAutoSaveMessageFromRow(ev.messageRow, viewer);
    if (!m || m.isMine || !m.senderId) return { kind: "room_signal", roomId };
    return { kind: "messages", roomId, messages: [m] };
  }
  if (ev.type === "cm.room.bump") {
    const roomId = String(ev.roomId ?? "").trim();
    return roomId ? { kind: "catch_up", roomId } : null;
  }
  return null;
}

export type MessengerImageAutoSaveAggregateNotice = {
  key: "cm_ui_photo_auto_saved_count" | "cm_ui_photo_save_failed" | "cm_ui_photo_save_permission_denied";
  params?: { count: number };
  variant: "success" | "error";
  action?: "open_settings";
};

/** 합산 결과 → 스낵바 1건 (순수 함수). 아무것도 없으면 null. */
export function messengerImageAutoSaveAggregateNotice(
  s: MessengerImageAutoSaveBatchSummary,
): MessengerImageAutoSaveAggregateNotice | null {
  if (s.saved > 0) return { key: "cm_ui_photo_auto_saved_count", params: { count: s.saved }, variant: "success" };
  if (s.denied) return { key: "cm_ui_photo_save_permission_denied", variant: "error", action: "open_settings" };
  if (s.failed > 0) return { key: "cm_ui_photo_save_failed", variant: "error" };
  return null;
}

function readAutoSaveEnabled(): boolean {
  try {
    return readCommunityMessengerLocalSettings().mediaAutoSaveEnabled === true;
  } catch {
    return false;
  }
}

function isForeground(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

function useMessengerAutoSaveViewerId(active: boolean): string | null {
  const [viewer, setViewer] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const sync = () => {
      void getCurrentUserIdForDb().then((id) => {
        if (alive) setViewer(id?.trim() || null);
      });
    };
    sync();
    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      sync();
    });
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, sync);
    return () => {
      alive = false;
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, sync);
      authSub?.data.subscription.unsubscribe();
    };
  }, [active]);
  return active ? viewer : null;
}

function useMessengerAutoSaveSetting(active: boolean): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!active) return;
    const sync = () => setEnabled(readAutoSaveEnabled());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.includes("communityMessenger")) sync();
    };
    window.addEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [active]);
  return active && enabled;
}

async function fetchAutoSaveCandidates(
  sinceMs: number,
): Promise<{ messages: CommunityMessengerMessage[]; hasMore: boolean } | null> {
  try {
    const url = `${MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_PATH}?since=${encodeURIComponent(new Date(sinceMs).toISOString())}`;
    const res = await fetch(url, { method: "GET", cache: "no-store", credentials: "include" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { ok?: boolean; messages?: unknown; hasMore?: unknown } | null;
    if (!json?.ok || !Array.isArray(json.messages)) return null;
    return { messages: json.messages as CommunityMessengerMessage[], hasMore: json.hasMore === true };
  } catch {
    return null;
  }
}

function showAggregateNotice(summary: MessengerImageAutoSaveBatchSummary): void {
  const notice = messengerImageAutoSaveAggregateNotice(summary);
  if (!notice) return;
  const action =
    notice.action === "open_settings"
      ? {
          label: translateCmUi("cm_ui_photo_save_open_settings"),
          onPress: () => {
            void openMessengerAppSettings().then((opened) => {
              if (!opened) showMessengerSnackbar(translateCmUi("cm_ui_photo_save_open_settings_unavailable"));
            });
          },
        }
      : undefined;
  showMessengerSnackbar(translateCmUi(notice.key, notice.params), {
    variant: notice.variant,
    ...(action ? { action } : {}),
  });
}

/**
 * 메인 셸 1회 마운트. 네이티브 + 설정 ON + 로그인 + 저장 지원일 때만 동작.
 */
export function useMessengerImageAutoSaveGlobal(): void {
  const [native] = useState(() => isCapacitorNativePlatform());
  const enabled = useMessengerAutoSaveSetting(native);
  /** 설정 OFF 면 로그인 조회조차 하지 않는다. */
  const viewer = useMessengerAutoSaveViewerId(native && enabled);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (!native || !enabled || !viewer) return;
    let alive = true;
    void probeMessengerNativeImageSaveSupport().then((ok) => {
      if (alive) setSupported(ok);
    });
    return () => {
      alive = false;
    };
  }, [native, enabled, viewer]);

  useEffect(() => {
    if (!native || !enabled || !viewer || !supported) return;
    let disposed = false;
    let pending: CommunityMessengerMessage[] = [];
    let realtimeTimer: ReturnType<typeof setTimeout> | null = null;
    let catchUpTimer: ReturnType<typeof setTimeout> | null = null;
    let noticeTimer: ReturnType<typeof setTimeout> | null = null;
    let catchUpInFlight = false;
    let lastCatchUpAt = 0;
    /** 다음 catch-up 이 반드시 서버를 봐야 하는가(마운트·포그라운드 복귀) */
    let forceCatchUp = true;
    /** unread 증가 신호를 받았지만 실시간 행이 아직 안 온 방 — 비어 있으면 bump 발 catch-up 생략 */
    const bumpedRoomsWithoutRow = new Set<string>();
    let noticeAcc: MessengerImageAutoSaveBatchSummary = { saved: 0, failed: 0, denied: false };

    const onNotice = (n: { summary: MessengerImageAutoSaveBatchSummary }) => {
      if (disposed) return;
      noticeAcc = {
        saved: noticeAcc.saved + n.summary.saved,
        failed: noticeAcc.failed + n.summary.failed,
        denied: noticeAcc.denied || n.summary.denied,
      };
      if (noticeTimer) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => {
        noticeTimer = null;
        const acc = noticeAcc;
        noticeAcc = { saved: 0, failed: 0, denied: false };
        showAggregateNotice(acc);
      }, MESSENGER_AUTO_SAVE_NOTICE_COALESCE_MS);
    };

    const feed = (messages: CommunityMessengerMessage[]) => {
      if (disposed || messages.length === 0) return;
      autoSaveIncomingMessengerImages({ enabled: true, viewerUserId: viewer, messages, onNotice });
    };

    const flushRealtime = () => {
      realtimeTimer = null;
      const batch = pending;
      pending = [];
      if (!isForeground()) return; /** 포그라운드 복귀 catch-up 이 다시 가져온다 */
      feed(batch);
    };

    const runCatchUp = async () => {
      catchUpTimer = null;
      if (disposed || !isForeground()) return;
      if (catchUpInFlight) return;
      if (!forceCatchUp && bumpedRoomsWithoutRow.size === 0) return;
      const now = Date.now();
      if (now - lastCatchUpAt < MESSENGER_AUTO_SAVE_CATCH_UP_MIN_GAP_MS) {
        scheduleCatchUp(MESSENGER_AUTO_SAVE_CATCH_UP_MIN_GAP_MS - (now - lastCatchUpAt));
        return;
      }
      catchUpInFlight = true;
      lastCatchUpAt = now;
      forceCatchUp = false;
      bumpedRoomsWithoutRow.clear();
      try {
        const sinceMs = messengerImageAutoSaveCatchUpSinceMs(viewer, now);
        const page = await fetchAutoSaveCandidates(sinceMs);
        if (disposed || !page) return;
        noteMessengerImageAutoSaveCatchUpPage(viewer, page.messages);
        feed(page.messages);
        /** 50건 초과 — 저장 큐가 원장을 채운 뒤 다음 페이지(커서가 처리된 항목 뒤로 이동). */
        if (page.hasMore) {
          forceCatchUp = true;
          scheduleCatchUp(MESSENGER_AUTO_SAVE_CATCH_UP_MIN_GAP_MS);
        }
      } finally {
        catchUpInFlight = false;
      }
    };

    const scheduleCatchUp = (delayMs: number) => {
      if (disposed || catchUpTimer) return;
      catchUpTimer = setTimeout(() => void runCatchUp(), Math.max(0, delayMs));
    };

    const offBus = onCommunityMessengerBusEvent((ev) => {
      const action = selectMessengerImageAutoSaveSourceAction(ev, viewer);
      if (!action) return;
      if (action.kind === "catch_up") {
        bumpedRoomsWithoutRow.add(action.roomId);
        scheduleCatchUp(MESSENGER_AUTO_SAVE_BUMP_CATCH_UP_DEBOUNCE_MS);
        return;
      }
      /** 실시간 행이 온 방은 bump 발 catch-up 불필요(이미 행을 받음) */
      bumpedRoomsWithoutRow.delete(action.roomId);
      if (action.kind === "room_signal") return;
      pending.push(...action.messages);
      if (!realtimeTimer) realtimeTimer = setTimeout(flushRealtime, MESSENGER_AUTO_SAVE_REALTIME_COALESCE_MS);
    });

    const onVisibility = () => {
      if (!isForeground()) return;
      forceCatchUp = true;
      scheduleCatchUp(300);
    };
    document.addEventListener("visibilitychange", onVisibility);
    scheduleCatchUp(0);

    return () => {
      disposed = true;
      offBus();
      document.removeEventListener("visibilitychange", onVisibility);
      if (realtimeTimer) clearTimeout(realtimeTimer);
      if (catchUpTimer) clearTimeout(catchUpTimer);
      if (noticeTimer) clearTimeout(noticeTimer);
    };
  }, [native, enabled, viewer, supported]);
}
