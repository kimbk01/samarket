import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { isPhoneVerificationRequiredApiPayload } from "@/lib/auth/phone-verification-required-detect";
import { STORE_PHONE_GATE_MESSAGE } from "@/lib/auth/store-member-policy";
import {
  primeOutgoingRingbackWebAudioFromUserGesture,
  rememberOutgoingRingtonePrimedForSession,
  stopCommunityMessengerCallTone,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
} from "@/lib/community-messenger/call-feedback-sound";
import {
  cmCallFlow,
  cmCallIncomingTraceBindSession,
  cmCallIncomingTraceMarkCallPostStart,
  cmCallIncomingTracePatch,
  cmCallIncomingTracePublishToStorage,
  cmCallLatency,
  cmCallLatencyAnalysis,
  cmCallLatencyInfo,
} from "@/lib/community-messenger/cm-call-debug";
import { primeOutgoingCallMediaBeforeNavigate } from "@/lib/community-messenger/call-media-bootstrap";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { notifyCommunityMessengerCallInviteRingBestEffort } from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { appendLocalCallChatMessageForPeerBusy } from "@/lib/community-messenger/call-peer-busy-local-log";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const KEY = "samarket.cm.call_session_seed.v1";
const RETURN_PATH_KEY = "samarket.cm.call_return_path.v1";

/** 발신 즉시 진입용 임시 세션 id (`POST /calls` 완료 전 통화 UI 페인트) */
export const COMMUNITY_MESSENGER_TEMP_CALL_PREFIX = "tmp_" as const;

export function isCommunityMessengerTempCallSessionId(sessionId: string): boolean {
  return sessionId.trim().startsWith(COMMUNITY_MESSENGER_TEMP_CALL_PREFIX);
}

export function createCommunityMessengerTempCallSessionId(): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `${COMMUNITY_MESSENGER_TEMP_CALL_PREFIX}${id}`;
}

/** POST 전 통화 화면용 합성 세션 — 실제 id 로 replace 되기 전까지만 유효 */
export function buildSyntheticTempOutgoingCallSession(input: {
  tempSessionId: string;
  kind: CommunityMessengerCallKind;
  roomId: string;
  peerUserId: string | null;
  peerLabel: string;
  initiatorUserId: string;
}): CommunityMessengerCallSession {
  const startedAt = new Date().toISOString();
  return {
    id: input.tempSessionId,
    roomId: input.roomId,
    sessionMode: "direct",
    initiatorUserId: input.initiatorUserId,
    recipientUserId: input.peerUserId,
    peerUserId: input.peerUserId,
    peerLabel: input.peerLabel.trim() || "통화",
    peerAvatarUrl: null,
    callKind: input.kind,
    status: "ringing",
    startedAt,
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    isMineInitiator: true,
    participants: [],
  };
}

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
  const currentPath =
    typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : null;
  console.info("[call-flow] call_return_path_read", {
    returnPath: back,
    roomIdFallback: roomIdFallback?.trim() || null,
    currentPath,
  });
  if (back) {
    console.info("[call-flow] call_return_navigation_decision", {
      target: back,
      reason: "return_path",
      hasReturnPath: true,
      hasRoomIdFallback: Boolean(roomIdFallback?.trim()),
    });
    router.replace(back);
    return;
  }
  const room = roomIdFallback?.trim();
  if (room) {
    const target = `/community-messenger/rooms/${encodeURIComponent(room)}`;
    console.info("[call-flow] call_return_navigation_decision", {
      target,
      reason: "room_fallback",
      hasReturnPath: false,
      hasRoomIdFallback: true,
    });
    router.replace(target);
    return;
  }
  console.info("[call-flow] call_return_navigation_decision", {
    target: "/community-messenger?section=chats",
    reason: "messenger_fallback",
    hasReturnPath: false,
    hasRoomIdFallback: false,
  });
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
 * 발신 즉시 통화 라우트 — 임시 `tmp_*` 세션으로 먼저 `/calls/:id` 에 진입하고,
 * 백그라운드 `POST .../calls` 완료 후 실제 sessionId 로 `replace` 한다.
 * `roomId` 또는 `peerUserId` 중 하나는 있어야 한다.
 */
export function buildCommunityMessengerInstantOutgoingCallHref(args: BuildCommunityMessengerOutgoingDialHrefArgs): string {
  const tempSessionId = createCommunityMessengerTempCallSessionId();
  const q = new URLSearchParams();
  q.set("kind", args.kind);
  const rid = args.roomId?.trim();
  const pid = args.peerUserId?.trim();
  if (rid) q.set("roomId", rid);
  if (pid) q.set("peerUserId", pid);
  const pl = args.peerLabel?.trim();
  if (pl) q.set("peerLabel", pl);
  return `/community-messenger/calls/${encodeURIComponent(tempSessionId)}?${q.toString()}`;
}

/** @alias — 기존 이름 유지(모두 즉시 통화 경로로 통일) */
export function buildCommunityMessengerOutgoingDialHref(args: BuildCommunityMessengerOutgoingDialHrefArgs): string {
  return buildCommunityMessengerInstantOutgoingCallHref(args);
}

export type OutgoingCallSessionBootstrapResult =
  | { ok: true; session: CommunityMessengerCallSession; roomId: string }
  | { ok: false; userMessage: string };

function outgoingCallMediaPrimeFailureMessage(kind: CommunityMessengerCallKind): string {
  const lang = getRuntimeAppLanguage();
  if (kind === "video") {
    return safeTranslate(lang, "cm_ui_call_permission_settings_video", {
      fallbackKo: "카메라/마이크 권한이 꺼져 있습니다. 설정에서 허용해 주세요.",
      fallbackEn: "Camera/microphone access is turned off. Allow it in settings.",
    });
  }
  return safeTranslate(lang, "cm_ui_call_permission_settings_voice", {
    fallbackKo: "마이크 권한이 꺼져 있습니다. 설정에서 허용해 주세요.",
    fallbackEn: "Microphone access is turned off. Allow it in settings.",
  });
}

/** 발신 세션 POST 는 사용자 대기 구간이므로 브라우저에 높은 네트워크 우선순위를 힌트한다. */
function outgoingCallFetchInit(init: RequestInit): RequestInit {
  return { ...init, priority: "high" } as RequestInit;
}

/**
 * 세션 생성 — 방 ID 가 없으면 `POST /api/community-messenger/rooms` 후 `POST .../calls`.
 * `ensureRoom` 과 `POST .../calls` 는 방 id 의존 때문에 직렬만 가능(단일 합쳐진 API 없으면 Promise.all 불가).
 * 동일 키(room|peer|kind) 동시 요청은 single-flight 로 합류해 이중 세션 생성을 막는다.
 */
export async function bootstrapCommunityMessengerOutgoingCallSession(args: {
  signal?: AbortSignal;
  roomId: string | null;
  peerUserId: string | null;
  kind: CommunityMessengerCallKind;
}): Promise<OutgoingCallSessionBootstrapResult> {
  const flightKey = `${args.roomId?.trim() ?? ""}|${args.peerUserId?.trim() ?? ""}|${args.kind}`;
  return runSingleFlight(`cm:outgoing-bootstrap:${flightKey}`, () =>
    runBootstrapCommunityMessengerOutgoingCallSessionCore(args)
  );
}

async function runBootstrapCommunityMessengerOutgoingCallSessionCore(args: {
  signal?: AbortSignal;
  roomId: string | null;
  peerUserId: string | null;
  kind: CommunityMessengerCallKind;
}): Promise<OutgoingCallSessionBootstrapResult> {
  let roomId = args.roomId?.trim() ?? "";

  cmCallLatencyInfo("bootstrap_start", {
    roomId: roomId || undefined,
    peerUserId: args.peerUserId?.trim() || undefined,
    callKind: args.kind,
    role: "initiator",
  });

  if (roomId) {
    cmCallLatencyInfo("ensure_room_start", {
      roomId,
      callKind: args.kind,
      role: "initiator",
      reusedExistingRoomId: true,
    });
    cmCallLatencyInfo("ensure_room_done", {
      roomId,
      callKind: args.kind,
      role: "initiator",
      skippedFetch: true,
    });
  }

  if (!roomId && args.peerUserId?.trim()) {
    cmCallLatencyInfo("ensure_room_start", {
      peerUserId: args.peerUserId.trim(),
      callKind: args.kind,
      role: "initiator",
    });
    const ensureT0 = typeof performance !== "undefined" ? performance.now() : 0;
    const res = await fetch(
      "/api/community-messenger/rooms",
      outgoingCallFetchInit({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomType: "direct", peerUserId: args.peerUserId.trim() }),
        signal: args.signal,
      })
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      roomId?: string;
      error?: string;
      code?: string;
    };
    if (res.status === 401) {
      return { ok: false, userMessage: "로그인이 필요합니다." };
    }
    if (isPhoneVerificationRequiredApiPayload(json)) {
      return { ok: false, userMessage: String(json.error ?? "").trim() || STORE_PHONE_GATE_MESSAGE };
    }
    if (res.status === 403) {
      const err = String(json.error ?? "").trim();
      return { ok: false, userMessage: err || "요청을 처리할 수 없습니다." };
    }
    if (!res.ok || !json.ok || !json.roomId) {
      const err = String(json.error ?? "").trim();
      return {
        ok: false,
        userMessage: err || "대화방을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
    roomId = String(json.roomId);
    cmCallLatencyInfo("ensure_room_done", {
      roomId,
      durationMs:
        typeof performance !== "undefined" ? Math.round(performance.now() - ensureT0) : undefined,
      callKind: args.kind,
      role: "initiator",
    });
  }

  if (!roomId) {
    return { ok: false, userMessage: "방 정보가 없어 통화를 시작할 수 없습니다." };
  }

  cmCallLatencyInfo("create_call_session_post_start", {
    roomId,
    callKind: args.kind,
    role: "initiator",
  });
  cmCallLatencyInfo("db_insert_or_rpc_start", {
    roomId,
    callKind: args.kind,
    role: "initiator",
  });
  cmCallIncomingTraceMarkCallPostStart();
  const postT0 = typeof performance !== "undefined" ? performance.now() : 0;
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
    code?: string;
    session?: CommunityMessengerCallSession;
    _callStartTimingsMs?: Record<string, number>;
  };
  if (!res.ok || !json.ok || !json.session?.id) {
    if (isPhoneVerificationRequiredApiPayload(json)) {
      return { ok: false, userMessage: String(json.error ?? "").trim() || STORE_PHONE_GATE_MESSAGE };
    }
    if (json.error === "group_call_not_supported_yet") {
      return { ok: false, userMessage: "그룹 통화 실연결은 다음 단계에서 지원합니다." };
    }
    if (json.error === "peer_busy") {
      const viewerId = getSyncViewerUserIdForClient()?.trim();
      if (roomId && viewerId) {
        appendLocalCallChatMessageForPeerBusy({
          roomId,
          initiatorUserId: viewerId,
          peerUserId: args.peerUserId,
          callKind: args.kind,
        });
      }
      cmCallFlow("outgoing_peer_busy", { roomId, callKind: args.kind, peerUserId: args.peerUserId?.trim() });
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
    if (json.error === "trade_chat_call_friend_required_after_complete") {
      return { ok: false, userMessage: "통화를 원하면 친구를 요청하세요." };
    }
    return { ok: false, userMessage: "통화를 시작할 수 없습니다." };
  }
  const clientPostMs =
    typeof performance !== "undefined" ? Math.round(performance.now() - postT0) : undefined;
  cmCallIncomingTraceBindSession(json.session.id);
  cmCallIncomingTracePatch(json.session.id, { call_post_done_ms: Date.now() });
  cmCallIncomingTracePublishToStorage(json.session.id);
  cmCallLatencyInfo("create_call_session_post_done", {
    sessionId: json.session.id,
    roomId,
    durationMs: clientPostMs,
    callKind: args.kind,
    role: "initiator",
    ...(json._callStartTimingsMs && typeof json._callStartTimingsMs === "object"
      ? { serverMs: json._callStartTimingsMs }
      : {}),
  });
  cmCallFlow("session_created", { sessionId: json.session.id, roomId, callKind: args.kind });
  cmCallLatencyAnalysis({
    totalMs: clientPostMs,
    serverMs: json._callStartTimingsMs,
  });
  if (json._callStartTimingsMs && typeof json._callStartTimingsMs === "object") {
    cmCallLatencyInfo("db_insert_or_rpc_done", {
      sessionId: json.session.id,
      roomId,
      callKind: args.kind,
      role: "initiator",
      ...json._callStartTimingsMs,
    });
  }
  cmCallLatency("session_post_complete", { sessionId: json.session.id, roomId });
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
  /** 첫 `await` 전에만 유효한 사용자 활성화 — 링백·GUM 프라임·자동재생 정책 대응 */
  unlockCommunityMessengerCallPlaybackFromUserGesture();
  primeOutgoingRingbackWebAudioFromUserGesture(input.kind);
  const primeResult = await primeOutgoingCallMediaBeforeNavigate(input.kind);
  if (!primeResult.ok) {
    stopCommunityMessengerCallTone();
    return { ok: false, userMessage: outgoingCallMediaPrimeFailureMessage(input.kind) };
  }
  if (typeof window !== "undefined") {
    rememberCallNavigationReturnPath();
  }
  const result = await bootstrapCommunityMessengerOutgoingCallSession(input);
  if (!result.ok) {
    stopCommunityMessengerCallTone();
    return result;
  }
  primeCommunityMessengerCallNavigationSeed(result.session.id, result.session);
  rememberOutgoingRingtonePrimedForSession(result.session.id);
  cmCallLatencyInfo("route_replace_session_start", {
    sessionId: result.session.id,
    callKind: input.kind,
    role: "initiator",
    roomId: result.roomId,
  });
  const dialTmpBeforeRoute =
    typeof window !== "undefined"
      ? (() => {
          try {
            const m = window.location.pathname.match(/\/community-messenger\/calls\/([^/]+)/);
            const raw = m?.[1] ? decodeURIComponent(m[1]).trim() : "";
            return isCommunityMessengerTempCallSessionId(raw) ? raw : null;
          } catch {
            return null;
          }
        })()
      : null;
  navigate(`/community-messenger/calls/${encodeURIComponent(result.session.id)}`);
  if (result.session.sessionMode === "direct") {
    void notifyCommunityMessengerCallInviteRingBestEffort(result.session, {
      dialTmpSessionId: dialTmpBeforeRoute,
    });
  }
  return result;
}

/**
 * 레거시 헬퍼: 세션 POST 완료 후에만 `/calls/:sessionId` 로 이동한다.
 * 즉시 UI 가 필요하면 `buildCommunityMessengerOutgoingDialHref` + `router.push` 를 선호한다.
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
  primeOutgoingRingbackWebAudioFromUserGesture(input.kind);
  const primeResult = await primeOutgoingCallMediaBeforeNavigate(input.kind);
  if (!primeResult.ok) {
    stopCommunityMessengerCallTone();
    return { ok: false, userMessage: outgoingCallMediaPrimeFailureMessage(input.kind) };
  }
  if (typeof window !== "undefined") {
    rememberCallNavigationReturnPath();
  }
  const result = await bootstrapCommunityMessengerOutgoingCallSession(input);
  if (!result.ok) {
    stopCommunityMessengerCallTone();
    return result;
  }
  primeCommunityMessengerCallNavigationSeed(result.session.id, result.session);
  rememberOutgoingRingtonePrimedForSession(result.session.id);
  cmCallLatencyInfo("route_replace_session_start", {
    sessionId: result.session.id,
    callKind: input.kind,
    role: "initiator",
    roomId: result.roomId,
  });
  const dialTmpBeforeRoute =
    typeof window !== "undefined"
      ? (() => {
          try {
            const m = window.location.pathname.match(/\/community-messenger\/calls\/([^/]+)/);
            const raw = m?.[1] ? decodeURIComponent(m[1]).trim() : "";
            return isCommunityMessengerTempCallSessionId(raw) ? raw : null;
          } catch {
            return null;
          }
        })()
      : null;
  router.push(`/community-messenger/calls/${encodeURIComponent(result.session.id)}`);
  if (result.session.sessionMode === "direct") {
    void notifyCommunityMessengerCallInviteRingBestEffort(result.session, {
      dialTmpSessionId: dialTmpBeforeRoute,
    });
  }
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
