/**
 * 커뮤니티 메신저 1:1 통화 — 채팅 스텁 문구·터미널 이벤트 해석 단일 정의.
 */
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallStatus,
  CommunityMessengerMessage,
} from "@/lib/community-messenger/types";
import { formatCallEventForViewer } from "@/lib/community-messenger/call-event-presentation";
import { resolveCanonicalTerminalReason } from "@/lib/community-messenger/call-authority/call-terminal-reason-authority";

export type CallSessionViewerRole = "caller" | "callee";

/** 세션 + 역할 기준 최종 의미 (스텁 표시·저장 공통) */
export type CallSessionResolvedEvent =
  | "outgoing_started"
  | "incoming_received"
  | "cancelled_by_caller"
  | "rejected_by_callee"
  | "missed"
  | "ended"
  | "failed"
  | "disconnected"
  /** 세션 미생성 peer_busy — 로컬 스텁 전용 */
  | "peer_busy";

export function resolveViewerCallRole(
  viewerUserId: string | null | undefined,
  initiatorUserId: string | null | undefined,
  recipientUserId: string | null | undefined
): CallSessionViewerRole | null {
  const v = viewerUserId?.trim() ?? "";
  const i = initiatorUserId?.trim() ?? "";
  const r = recipientUserId?.trim() ?? "";
  if (!v || !i || !r) return null;
  if (v === i) return "caller";
  if (v === r) return "callee";
  return null;
}

function trimLower(s: unknown): string {
  return typeof s === "string" ? s.trim().toLowerCase() : "";
}

/**
 * DB 세션 상태·타임스탬프·hangup 사유로 표시할 이벤트 타입 결정.
 * cancel / reject 혼동 방지: DB status 우선, ended_reason → CUT3 canonical.
 */
export function resolveCallSessionEventType(input: {
  status: string;
  answeredAt?: string | null;
  hangupReason?: string | null;
  endedReason?: string | null;
  terminalActorUserId?: string | null;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
}): CallSessionResolvedEvent | null {
  const status = trimLower(input.status);
  const hr = trimLower(input.hangupReason);
  const answered = typeof input.answeredAt === "string" && input.answeredAt.trim().length > 0;

  if (status === "ringing" || status === "active") return null;

  if (hr === "callee_reject" || hr === "rejected_by_callee") return "rejected_by_callee";
  if (hr === "caller_cancel" || hr === "cancelled_by_caller") return "cancelled_by_caller";

  const canonical = resolveCanonicalTerminalReason({
    status: input.status,
    endedReason: input.endedReason,
    terminalActorUserId: input.terminalActorUserId,
    initiatorUserId: input.initiatorUserId,
    recipientUserId: input.recipientUserId,
    answeredAt: input.answeredAt,
  });

  if (canonical === "callee_rejected" || status === "rejected") return "rejected_by_callee";
  if (canonical === "missed_timeout" || status === "missed" || status === "timeout") return "missed";
  if (canonical === "caller_cancelled" || status === "cancelled") return "cancelled_by_caller";
  if (canonical === "busy") return "peer_busy";
  if (canonical === "failed_setup" || canonical === "failed_network") return "failed";
  if (canonical === "disconnected") return "disconnected";
  if (canonical === "ended_by_caller" || canonical === "ended_by_callee") {
    return answered ? "ended" : "cancelled_by_caller";
  }
  if (status === "ended") {
    if (answered) return "ended";
    return "cancelled_by_caller";
  }

  if (status === "failed") {
    return "failed";
  }

  return null;
}

/** CommunityMessengerCallStatus 스토어/API 호환 값 */
export function mapResolvedEventToCallStatus(ev: CallSessionResolvedEvent): CommunityMessengerCallStatus {
  switch (ev) {
    case "outgoing_started":
      return "dialing";
    case "incoming_received":
      return "incoming";
    case "cancelled_by_caller":
      return "cancelled";
    case "rejected_by_callee":
      return "rejected";
    case "missed":
      return "missed";
    case "ended":
    case "disconnected":
      return "ended";
    case "failed":
      return "ended";
    case "peer_busy":
      return "cancelled";
    default:
      return "cancelled";
  }
}

function resolveViewerRoleFromSender(
  viewerUserId: string,
  senderUserId: string | null | undefined
): CallSessionViewerRole | null {
  const viewer = viewerUserId.trim();
  const sender = senderUserId?.trim() ?? "";
  if (!viewer || !sender) return null;
  return viewer === sender ? "caller" : "callee";
}

/**
 * 타임라인 한 줄 — viewer 관점 SSOT (`call-event-presentation`).
 */
function resolveViewerRoleForStub(args: {
  viewerUserId: string;
  senderUserId: string | null | undefined;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
}): CallSessionViewerRole | null {
  const fromParties = resolveViewerCallRole(args.viewerUserId, args.initiatorUserId, args.recipientUserId);
  if (fromParties) return fromParties;
  return resolveViewerRoleFromSender(args.viewerUserId, args.senderUserId);
}

export function getCallStubTimelineSecondLine(args: {
  callKind: CommunityMessengerCallKind;
  resolvedEvent: CallSessionResolvedEvent | null;
  callStatusFallback: CommunityMessengerCallStatus | string | null | undefined;
  viewerUserId: string;
  senderUserId: string | null | undefined;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
  durationSeconds?: number | null;
}): string {
  const viewerRole = resolveViewerRoleForStub(args);
  const inferred =
    args.resolvedEvent ?? inferResolvedEventFromStoredCallStatus(args.callStatusFallback, viewerRole);
  return formatCallEventForViewer({
    callKind: args.callKind,
    resolvedEvent: inferred,
    callStatusFallback: args.callStatusFallback,
    viewerRole,
    durationSeconds: args.durationSeconds,
  }).fullLabel;
}

/** 타임라인 결과 줄만 (종류 라벨과 분리) */
export function getCallStubTimelineStatusLine(args: {
  callKind: CommunityMessengerCallKind;
  resolvedEvent: CallSessionResolvedEvent | null;
  callStatusFallback: CommunityMessengerCallStatus | string | null | undefined;
  viewerUserId: string;
  senderUserId: string | null | undefined;
  initiatorUserId?: string | null;
  recipientUserId?: string | null;
  durationSeconds?: number | null;
}): string {
  const viewerRole = resolveViewerRoleForStub(args);
  const inferred =
    args.resolvedEvent ?? inferResolvedEventFromStoredCallStatus(args.callStatusFallback, viewerRole);
  return formatCallEventForViewer({
    callKind: args.callKind,
    resolvedEvent: inferred,
    callStatusFallback: args.callStatusFallback,
    viewerRole,
    durationSeconds: args.durationSeconds,
  }).resultLabel;
}

export function resolveCallStubEventFromMessageMetadata(meta: Record<string, unknown> | null | undefined): {
  resolvedEvent: CallSessionResolvedEvent | null;
  initiatorUserId: string | null;
  recipientUserId: string | null;
  endedReason: string | null;
} {
  if (!meta || typeof meta !== "object") {
    return { resolvedEvent: null, initiatorUserId: null, recipientUserId: null, endedReason: null };
  }
  const rawEvent = meta.callResolvedEvent;
  const resolvedEvent =
    typeof rawEvent === "string" && rawEvent.trim()
      ? (rawEvent.trim() as CallSessionResolvedEvent)
      : null;
  return {
    resolvedEvent,
    initiatorUserId: typeof meta.initiatorUserId === "string" ? meta.initiatorUserId.trim() || null : null,
    recipientUserId: typeof meta.recipientUserId === "string" ? meta.recipientUserId.trim() || null : null,
    endedReason: typeof meta.endedReason === "string" ? meta.endedReason.trim() || null : null,
  };
}

export function getCallMessageText(input: {
  callKind: CommunityMessengerCallKind;
  eventType: CallSessionResolvedEvent;
  viewerUserId: string;
  initiatorUserId: string | null | undefined;
  durationSeconds?: number | null;
}): string {
  return getCallStubTimelineSecondLine({
    callKind: input.callKind,
    resolvedEvent: input.eventType,
    callStatusFallback: mapResolvedEventToCallStatus(input.eventType),
    viewerUserId: input.viewerUserId,
    senderUserId: input.initiatorUserId,
    initiatorUserId: input.initiatorUserId,
    durationSeconds: input.durationSeconds,
  });
}

export function inferResolvedEventFromStoredCallStatus(
  status: CommunityMessengerCallStatus | string | null | undefined,
  viewerRole?: CallSessionViewerRole | null
): CallSessionResolvedEvent | null {
  const s = trimLower(status);
  if (s === "dialing") {
    return viewerRole === "callee" ? "incoming_received" : "outgoing_started";
  }
  if (s === "incoming") return "incoming_received";
  if (s === "cancelled") return "cancelled_by_caller";
  if (s === "rejected") return "rejected_by_callee";
  if (s === "missed") return "missed";
  if (s === "ended") return "ended";
  return null;
}

export function sessionKeysMatchMessage(
  sessionId: string | null | undefined,
  tmpSessionId: string | null | undefined,
  msgSessionId: string | null | undefined,
  msgTmpSessionId: string | null | undefined
): boolean {
  const a = sessionId?.trim() ?? "";
  const b = tmpSessionId?.trim() ?? "";
  const ms = msgSessionId?.trim() ?? "";
  const mt = msgTmpSessionId?.trim() ?? "";
  if (a && (ms === a || mt === a)) return true;
  if (b && (ms === b || mt === b)) return true;
  return false;
}

function callStubMetaString(message: Pick<CommunityMessengerMessage, "metadata">, key: string): string {
  const meta = message.metadata;
  if (!meta || typeof meta !== "object") return "";
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function callStubSessionKey(
  message: Pick<CommunityMessengerMessage, "messageType" | "callSessionId" | "callTmpSessionId" | "metadata">
): string {
  if (message.messageType !== "call_stub") return "";
  const sessionId = message.callSessionId?.trim() || callStubMetaString(message, "sessionId");
  const tmpSessionId = message.callTmpSessionId?.trim() || callStubMetaString(message, "tmpSessionId");
  return sessionId || tmpSessionId || "";
}

export function callStubSessionKeys(
  message: Pick<CommunityMessengerMessage, "messageType" | "callSessionId" | "callTmpSessionId" | "metadata">
): string[] {
  if (message.messageType !== "call_stub") return [];
  const keys = new Set<string>();
  const sessionId = message.callSessionId?.trim() || callStubMetaString(message, "sessionId");
  const tmpSessionId = message.callTmpSessionId?.trim() || callStubMetaString(message, "tmpSessionId");
  if (sessionId) keys.add(sessionId);
  if (tmpSessionId) keys.add(tmpSessionId);
  return [...keys];
}

export function callStubResolvedEventKey(
  message: Pick<CommunityMessengerMessage, "messageType" | "callStatus" | "metadata">
): string {
  if (message.messageType !== "call_stub") return "";
  return callStubMetaString(message, "callResolvedEvent") || message.callStatus?.trim() || "";
}

/**
 * callId(session) 당 타임라인 1행 — status 를 키에 넣지 않는다.
 * (dialing → terminal UPDATE 가 동일 항목으로 collapse 되어야 함)
 */
export function callStubSessionDedupeKey(
  message: Pick<
    CommunityMessengerMessage,
    "messageType" | "callSessionId" | "callTmpSessionId" | "callStatus" | "metadata"
  >
): string {
  const sessionKey = callStubSessionKey(message);
  if (!sessionKey) return "";
  return `call_stub:${sessionKey}`;
}

export function callStubSessionDedupeKeys(
  message: Pick<
    CommunityMessengerMessage,
    "messageType" | "callSessionId" | "callTmpSessionId" | "callStatus" | "metadata"
  >
): string[] {
  const sessionKeys = callStubSessionKeys(message);
  if (sessionKeys.length === 0) return [];
  return sessionKeys.map((sessionKey) => `call_stub:${sessionKey}`);
}

export function callStubHiddenKeys(
  message: Pick<
    CommunityMessengerMessage,
    "id" | "messageType" | "callSessionId" | "callTmpSessionId" | "callStatus" | "metadata"
  >
): string[] {
  const id = String(message.id ?? "").trim();
  if (message.messageType !== "call_stub") return id ? [id] : [];
  const keys = new Set<string>();
  if (id) keys.add(id);
  for (const sessionKey of callStubSessionKeys(message)) {
    keys.add(`call_stub_session:${sessionKey}`);
  }
  for (const dedupeKey of callStubSessionDedupeKeys(message)) {
    keys.add(dedupeKey);
  }
  return [...keys];
}
