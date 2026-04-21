import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { unlockCommunityMessengerCallPlaybackFromUserGesture } from "@/lib/community-messenger/call-feedback-sound";
import { notifyCommunityMessengerCallInviteRingBestEffort } from "@/lib/community-messenger/call-invite-realtime-broadcast";

const KEY = "samarket.cm.call_session_seed.v1";
const RETURN_PATH_KEY = "samarket.cm.call_return_path.v1";

/** React Strict Mode 등으로 consume 이 두 번 호출될 때 두 번째는 storage 가 비어 있어도 동일 세션을 돌려준다. */
let lastConsumedNavigationSeed: { sessionId: string; session: CommunityMessengerCallSession } | null = null;

/** 라우트의 sessionId 와 메모리 캐시가 어긋나면(다른 통화로 전환 등) 잘못된 시드를 쓰지 않도록 비운다. */
export function ensureCallNavigationSeedMemoryMatchesRoute(routedSessionId: string): void {
  const sid = routedSessionId.trim();
  if (!sid) return;
  if (lastConsumedNavigationSeed && lastConsumedNavigationSeed.sessionId !== sid) {
    lastConsumedNavigationSeed = null;
  }
}

/**
 * `/calls/:sessionId` 첫 렌더 — `initialSession` 이 없어도 네비 직전 `sessionStorage` 시드로 세션을 동기 채운다.
 * 번들 로드가 클라이언트에서만 일어나면(`dynamic` `ssr:false`) 스피너 한 틱·Permissions 대기 없이 통화 UI 로 진입한다.
 */
export function hydrateCommunityMessengerCallClientSession(
  sessionId: string,
  initialSession: CommunityMessengerCallSession | null | undefined
): { session: CommunityMessengerCallSession | null; loading: boolean } {
  if (initialSession != null) {
    return { session: initialSession, loading: false };
  }
  if (typeof window === "undefined") {
    return { session: null, loading: true };
  }
  ensureCallNavigationSeedMemoryMatchesRoute(sessionId);
  const seeded = consumeCommunityMessengerCallNavigationSeed(sessionId);
  return seeded ? { session: seeded, loading: false } : { session: null, loading: true };
}

/**
 * 통화 전 화면 URL(채팅·메신저 홈 등)을 저장해, 종료·취소 시 `router.replace` 로 그대로 돌아간다.
 * 통화 라우트 자체는 저장하지 않는다(루프 방지).
 */
export function rememberCallNavigationReturnPath(): void {
  if (typeof window === "undefined") return;
  try {
    const p = `${window.location.pathname}${window.location.search}`;
    if (p.includes("/community-messenger/calls/")) return;
    if (!p.startsWith("/") || p.startsWith("//") || p.length > 512) return;
    window.sessionStorage.setItem(RETURN_PATH_KEY, p);
  } catch {
    /* quota / private mode */
  }
}

/** 한 번 읽으면 제거. 유효한 앱 내부 경로만 반환한다. */
export function takeCallNavigationReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(RETURN_PATH_KEY);
    sessionStorage.removeItem(RETURN_PATH_KEY);
    if (!v || !v.startsWith("/") || v.startsWith("//") || v.length > 512) return null;
    if (v.includes("/community-messenger/calls/")) return null;
    return v;
  } catch {
    return null;
  }
}

export function navigateBackFromCommunityMessengerCall(
  router: { replace: (href: string) => void },
  roomIdFallback: string | null | undefined
): void {
  const back = takeCallNavigationReturnPath();
  if (back) {
    router.replace(back);
    return;
  }
  const room = roomIdFallback?.trim();
  if (room) {
    router.replace(`/community-messenger/rooms/${encodeURIComponent(room)}`);
    return;
  }
  router.replace("/community-messenger?section=chats");
}

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
 * 발신 다이얼 URL — **딥링크·북마크·외부 공유** 등으로만 사용한다.
 * 앱 내 발신은 `startOutgoingCallSessionAndOpen` 으로 이 경로를 거치지 않는 것이 안전하다
 * (중간 `/calls/outgoing` CallScreen 과 `/calls/:id` 가 한 화면에 겹쳐 보일 수 있음).
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

/** 발신 세션 POST 는 사용자 대기 구간이므로 브라우저에 높은 네트워크 우선순위를 힌트한다. */
function outgoingCallFetchInit(init: RequestInit): RequestInit {
  return { ...init, priority: "high" } as RequestInit;
}

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
    const res = await fetch(
      "/api/community-messenger/rooms",
      outgoingCallFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomType: "direct", peerUserId: args.peerUserId.trim() }),
        signal: args.signal,
      })
    );
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

  const res = await fetch(
    `/api/community-messenger/rooms/${encodeURIComponent(roomId)}/calls`,
    outgoingCallFetchInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callKind: args.kind }),
      signal: args.signal,
    })
  );
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
  /** 첫 `await` 전에만 유효한 사용자 활성화 — 링백·관리자 벨 URL 재생 자동재생 정책 대응 */
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  const result = await bootstrapCommunityMessengerOutgoingCallSession(input);
  if (!result.ok) return result;
  if (typeof window !== "undefined") {
    rememberCallNavigationReturnPath();
  }
  primeCommunityMessengerCallNavigationSeed(result.session.id, result.session);
  navigate(`/community-messenger/calls/${encodeURIComponent(result.session.id)}`);
  return result;
}

/**
 * 앱 내 발신: `/calls/outgoing` 셸 없이 세션 POST 후 곧바로 `/calls/:sessionId` 로 이동한다.
 * (중간 다이얼 UI와 실제 통화 화면이 겹쳐 보이는 이중 렌더 방지)
 */
export async function startOutgoingCallSessionAndOpen(
  input: {
    signal?: AbortSignal;
    roomId: string | null;
    peerUserId: string | null;
    kind: CommunityMessengerCallKind;
  },
  router: { push: (href: string) => void }
): Promise<OutgoingCallSessionBootstrapResult> {
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  const result = await bootstrapCommunityMessengerOutgoingCallSession(input);
  if (!result.ok) return result;
  if (typeof window !== "undefined") {
    rememberCallNavigationReturnPath();
  }
  primeCommunityMessengerCallNavigationSeed(result.session.id, result.session);
  router.push(`/community-messenger/calls/${encodeURIComponent(result.session.id)}`);
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
  lastConsumedNavigationSeed = null;
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
  if (lastConsumedNavigationSeed?.sessionId === sessionId) {
    return lastConsumedNavigationSeed.session;
  }
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { sessionId?: string; session?: CommunityMessengerCallSession };
    if (!o.session || o.sessionId !== sessionId) return null;
    window.sessionStorage.removeItem(KEY);
    lastConsumedNavigationSeed = { sessionId, session: o.session };
    return o.session;
  } catch {
    return null;
  }
}
