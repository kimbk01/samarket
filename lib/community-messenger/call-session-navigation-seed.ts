import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { notifyCommunityMessengerCallInviteRingBestEffort } from "@/lib/community-messenger/call-invite-realtime-broadcast";

const KEY = "samarket.cm.call_session_seed.v1";

export type BuildCommunityMessengerOutgoingDialHrefArgs = {
  kind: CommunityMessengerCallKind;
  /** 이미 알고 있으면 세션 생성 전에 `POST .../calls` 까지 한 단계 줄인다. */
  roomId?: string;
  /** 방 ID 를 아직 모를 때(홈에서 DM 방 생성 API 를 기다리지 않고 진입). */
  peerUserId?: string;
  /** 발신 calling UI 용(선택). */
  peerLabel?: string;
};

/**
 * 발신 다이얼 URL — 레거시·딥링크용. 앱 내 발신은 `bootstrapCommunityMessengerOutgoingCallAndNavigate` 로
 * 세션 생성 후 곧바로 `/calls/:sessionId` 로 이동해 화면 전환이 한 번만 일어나게 한다.
 * `roomId` 또는 `peerUserId` 중 하나는 있어야 한다.
 */
export function buildCommunityMessengerOutgoingDialHref(args: BuildCommunityMessengerOutgoingDialHrefArgs): string {
  const q = new URLSearchParams();
  q.set("kind", args.kind);
  const rid = args.roomId?.trim();
  const pid = args.peerUserId?.trim();
  if (rid) q.set("roomId", rid);
  if (pid) q.set("peerUserId", pid);
  const pl = args.peerLabel?.trim();
  if (pl) q.set("peerLabel", pl);
  return `/community-messenger/calls/outgoing?${q.toString()}`;
}

export type OutgoingCallSessionBootstrapResult =
  | { ok: true; session: CommunityMessengerCallSession; roomId: string }
  | { ok: false; userMessage: string };

/**
 * `/calls/outgoing` 에서 세션 생성 — 방 ID 가 없으면 `POST /api/community-messenger/rooms` 후 `POST .../calls`.
 */
export async function bootstrapCommunityMessengerOutgoingCallSession(args: {
  signal?: AbortSignal;
  roomId: string | null;
  peerUserId: string | null;
  kind: CommunityMessengerCallKind;
}): Promise<OutgoingCallSessionBootstrapResult> {
  let roomId = args.roomId?.trim() ?? "";

  if (!roomId && args.peerUserId?.trim()) {
    const res = await fetch("/api/community-messenger/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomType: "direct", peerUserId: args.peerUserId.trim() }),
      signal: args.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; roomId?: string; error?: string };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, userMessage: "로그인이 필요합니다." };
    }
    if (!res.ok || !json.ok || !json.roomId) {
      return { ok: false, userMessage: "대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }
    roomId = String(json.roomId);
  }

  if (!roomId) {
    return { ok: false, userMessage: "방 정보가 없어 통화를 시작할 수 없습니다." };
  }

  const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(roomId)}/calls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callKind: args.kind }),
    signal: args.signal,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    session?: CommunityMessengerCallSession;
  };
  if (!res.ok || !json.ok || !json.session?.id) {
    if (json.error === "group_call_not_supported_yet") {
      return { ok: false, userMessage: "그룹 통화 실연결은 다음 단계에서 지원합니다." };
    }
    if (json.error === "peer_busy") {
      return { ok: false, userMessage: "상대방이 현재 통화중입니다." };
    }
    if (json.error === "room_unavailable" || json.error === "room_archived") {
      return { ok: false, userMessage: "이 대화방에서는 지금 통화를 시작할 수 없습니다." };
    }
    if (json.error === "trade_chat_calls_disabled") {
      return { ok: false, userMessage: "이 글의 판매자가 거래 채팅 통화를 허용하지 않았습니다." };
    }
    if (json.error === "trade_chat_video_not_allowed") {
      return { ok: false, userMessage: "이 글에서는 음성 통화만 허용되어 있습니다." };
    }
    return { ok: false, userMessage: "통화를 시작할 수 없습니다." };
  }
  if (json.session.sessionMode === "direct") {
    void notifyCommunityMessengerCallInviteRingBestEffort(json.session);
  }
  return { ok: true, session: json.session, roomId };
}

/**
 * 세션 POST → seed → `/community-messenger/calls/:id` 로 이동까지 한 번에 처리한다.
 * (중간 `/calls/outgoing` 전체 화면을 거치지 않는다.)
 */
export async function bootstrapCommunityMessengerOutgoingCallAndNavigate(
  input: {
    signal?: AbortSignal;
    roomId: string | null;
    peerUserId: string | null;
    kind: CommunityMessengerCallKind;
  },
  navigate: (href: string) => void
): Promise<OutgoingCallSessionBootstrapResult> {
  const result = await bootstrapCommunityMessengerOutgoingCallSession(input);
  if (!result.ok) return result;
  primeCommunityMessengerCallNavigationSeed(result.session.id, result.session);
  navigate(`/community-messenger/calls/${encodeURIComponent(result.session.id)}`);
  return result;
}

/**
 * 통화 발신 직후 `router.push` 시 RSC·클라이언트 GET 보다 먼저 세션을 알 수 있게 sessionStorage 에 두어
 * 통화 화면 첫 페인트·로딩 스피너를 줄인다.
 */
export function primeCommunityMessengerCallNavigationSeed(
  sessionId: string,
  session: CommunityMessengerCallSession
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ sessionId, session, at: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

export function consumeCommunityMessengerCallNavigationSeed(
  sessionId: string
): CommunityMessengerCallSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { sessionId?: string; session?: CommunityMessengerCallSession };
    if (!o.session || o.sessionId !== sessionId) return null;
    window.sessionStorage.removeItem(KEY);
    return o.session;
  } catch {
    return null;
  }
}
