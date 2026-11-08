"use client";

/**
 * U2 (Owner 「U2 승인」 2026-11-08) — V4 웹 수신 통화 Realtime 병행 수신.
 * 설계: docs/audit/supabase-request-surge-design-supplement-2026-11-08.md §5
 *
 * - 운영 V4 웹에는 수신 울림 실시간 경로가 없었다(2초 HTTP 폴링만). 이 모듈은 「신호」만 준다.
 *   화면 판단은 기존 `startCallV4IncomingDiscovery` 의 tick(HTTP 재조회 → 기존 판단 경로)이 한다.
 * - 구독: Legacy `GlobalCommunityMessengerIncomingCall` 과 같은 채널·옵션·필터
 *   (`community-messenger-incoming-call:<uid>`, private, `postgres_changes` recipient_user_id=eq.<uid>).
 *   Legacy 와 V4 는 `CallIncomingChrome` 에서 배타적으로 마운트된다.
 * - K3 대응: 공용 holder·채널 레지스트리는 「첫 생성자의 핸들러」만 붙인다. 이 모듈은 사용자당 채널 1개에
 *   리스너 목록을 두고 모든 리스너에 나눠 준다(fan-out). Legacy holder 는 바꾸지 않는다.
 * - ringing 은 `onRinging`(발견 신호), ringing 이 아닌 내 수신 행 변경은 `onSessionStatus`(원격 종료 확인 신호)로 나눠 준다.
 *   상태 변경은 「신호」일 뿐이다 — 정리는 `confirmCallV4IncomingRemoteTerminal` 이 서버를 다시 읽고 확정할 때만 한다
 *   (docs/audit/call-v4-web-incoming-remote-terminal-root-cause-design-2026-11-08.md T1).
 */

import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import { messengerPrivateBroadcastChannelOptions } from "@/lib/community-messenger/realtime/private-broadcast-client";

export const CALL_V4_INCOMING_REALTIME_SCOPE = "call_v4_incoming";

export type CallV4IncomingRealtimeRinging = {
  callId: string;
  startedAt: string | null;
};

export type CallV4IncomingRealtimeSessionStatus = {
  callId: string;
  status: string;
};

export type CallV4IncomingRealtimeListener = {
  onRinging: (event: CallV4IncomingRealtimeRinging) => void;
  /** 내 수신 1:1 세션이 ringing 이 아닌 상태로 바뀌었다(취소·부재중·거절·종료·다른 기기 수락 등). */
  onSessionStatus?: (event: CallV4IncomingRealtimeSessionStatus) => void;
  onStatus?: (status: string) => void;
};

type FeedRow = {
  stop: () => void;
  listeners: Set<CallV4IncomingRealtimeListener>;
  lastStatus: string | null;
  stopped: boolean;
};

const feedByUserId = new Map<string, FeedRow>();

function normalizeUserId(userId: string): string {
  return userId.trim().toLowerCase();
}

/** 순수 함수 — postgres_changes 페이로드에서 「나에게 온 울림」만 꺼낸다. */
export function readCallV4IncomingRingingFromPayload(
  payload: unknown,
  userId: string,
): CallV4IncomingRealtimeRinging | null {
  if (!payload || typeof payload !== "object") return null;
  const row = (payload as { new?: unknown }).new;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) return null;
  if (r.status !== "ringing") return null;
  if (r.session_mode != null && r.session_mode !== "direct") return null;
  const recipient = typeof r.recipient_user_id === "string" ? normalizeUserId(r.recipient_user_id) : "";
  if (!recipient || recipient !== normalizeUserId(userId)) return null;
  return { callId: id, startedAt: typeof r.started_at === "string" ? r.started_at : null };
}

/** 순수 함수 — 나에게 온 1:1 세션의 「ringing 이 아닌」 상태 변경만 꺼낸다. */
export function readCallV4IncomingSessionStatusFromPayload(
  payload: unknown,
  userId: string,
): CallV4IncomingRealtimeSessionStatus | null {
  if (!payload || typeof payload !== "object") return null;
  const row = (payload as { new?: unknown }).new;
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) return null;
  const status = typeof r.status === "string" ? r.status.trim().toLowerCase() : "";
  if (!status || status === "ringing") return null;
  if (r.session_mode != null && r.session_mode !== "direct") return null;
  const recipient = typeof r.recipient_user_id === "string" ? normalizeUserId(r.recipient_user_id) : "";
  if (!recipient || recipient !== normalizeUserId(userId)) return null;
  return { callId: id, status };
}

/**
 * 사용자당 채널 1개를 공유하고 리스너를 등록한다. 반환 함수로 해제(마지막 리스너가 빠지면 채널 정리).
 * Supabase 클라이언트가 없으면 아무것도 하지 않는다(기존 HTTP 폴링이 그대로 수신을 맡는다).
 */
export function acquireCallV4IncomingRealtimeFeed(
  userId: string,
  listener: CallV4IncomingRealtimeListener,
): () => void {
  const uid = normalizeUserId(userId);
  if (!uid) return () => {};

  let row = feedByUserId.get(uid);
  if (!row) {
    const sb = getSupabaseClient();
    if (!sb) return () => {};
    const created: FeedRow = { stop: () => {}, listeners: new Set(), lastStatus: null, stopped: false };
    feedByUserId.set(uid, created);
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-incoming-call:${uid}`,
      channelOptions: messengerPrivateBroadcastChannelOptions(),
      scope: CALL_V4_INCOMING_REALTIME_SCOPE,
      isCancelled: () => created.stopped,
      onStatus: (status) => {
        created.lastStatus = status;
        for (const l of [...created.listeners]) {
          try {
            l.onStatus?.(status);
          } catch {
            /* 리스너 오류가 다른 리스너·채널에 번지지 않게 */
          }
        }
      },
      build: (channel) =>
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_call_sessions",
            filter: `recipient_user_id=eq.${uid}`,
          },
          (payload) => {
            const ringing = readCallV4IncomingRingingFromPayload(payload, uid);
            if (ringing) {
              for (const l of [...created.listeners]) {
                try {
                  l.onRinging(ringing);
                } catch {
                  /* 리스너 오류 격리 */
                }
              }
              return;
            }
            const changed = readCallV4IncomingSessionStatusFromPayload(payload, uid);
            if (!changed) return;
            for (const l of [...created.listeners]) {
              try {
                l.onSessionStatus?.(changed);
              } catch {
                /* 리스너 오류 격리 */
              }
            }
          },
        ),
    });
    created.stop = () => sub.stop();
    row = created;
  }

  row.listeners.add(listener);
  if (row.lastStatus) {
    try {
      listener.onStatus?.(row.lastStatus);
    } catch {
      /* ignore */
    }
  }

  const owned = row;
  return () => {
    owned.listeners.delete(listener);
    if (owned.listeners.size > 0 || owned.stopped) return;
    owned.stopped = true;
    if (feedByUserId.get(uid) === owned) feedByUserId.delete(uid);
    try {
      owned.stop();
    } catch {
      /* ignore */
    }
  };
}

/** 테스트 전용 */
export function __resetCallV4IncomingRealtimeFeedForTests(): void {
  for (const row of feedByUserId.values()) {
    row.stopped = true;
    try {
      row.stop();
    } catch {
      /* ignore */
    }
  }
  feedByUserId.clear();
}
