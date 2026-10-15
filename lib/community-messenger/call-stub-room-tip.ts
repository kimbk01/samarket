/**
 * 통화 기록(call_stub)의 채팅 리스트 tip — 발신자·수신자별 문구.
 *
 * `community_messenger_rooms.last_message` 는 방 단위 1행이라 viewer 별 문구를 직접 저장할 수 없다.
 * 스키마·bootstrap RPC 시그니처를 바꾸지 않고, call_stub tip 일 때만 구조화 토큰을 저장한다:
 *   `cmcall1|<kind>|<status>|<resolvedEvent>|<initiatorUserId>|<recipientUserId>|<durationSeconds>|<sharedLabel>`
 * - 리스트 포맷터는 viewer 와 initiator 를 비교해 formatCallEventForViewer 로 문구를 만든다
 *   (발신 취소 → 발신자 "취소됨" / 수신자 "부재중"; 거절·무응답·통화 시간 동일 계약).
 * - viewer 를 모르는 소비자(관리자·검색 원문 등)는 decode 후 sharedLabel 을 쓴다.
 * - 토큰이 아닌 기존 행(레거시 라벨)은 그대로 표시 — 기존 데이터 호환.
 */
import { formatCallEventForViewer } from "@/lib/community-messenger/call-event-presentation";
import type { CallSessionResolvedEvent } from "@/lib/community-messenger/call-event-message";
import type { CommunityMessengerCallKind, CommunityMessengerCallStatus } from "@/lib/community-messenger/types";

const PREFIX = "cmcall1|";

export type CallStubRoomTip = {
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus | string;
  resolvedEvent: CallSessionResolvedEvent | null;
  initiatorUserId: string;
  recipientUserId: string;
  durationSeconds: number;
  sharedLabel: string;
};

function clean(v: unknown): string {
  return String(v ?? "")
    .replace(/\|/g, "")
    .trim();
}

export function encodeCallStubRoomTip(tip: CallStubRoomTip): string {
  const initiator = clean(tip.initiatorUserId);
  /** 발신자를 모르면 viewer 판정이 불가 — 공유 라벨만 저장(기존 동작). */
  if (!initiator) return clean(tip.sharedLabel);
  return [
    "cmcall1",
    tip.callKind === "video" ? "video" : "voice",
    clean(tip.status),
    clean(tip.resolvedEvent ?? ""),
    initiator,
    clean(tip.recipientUserId),
    String(Math.max(0, Math.floor(Number(tip.durationSeconds) || 0))),
    clean(tip.sharedLabel),
  ].join("|");
}

export function isCallStubRoomTipToken(text: string | null | undefined): boolean {
  return typeof text === "string" && text.startsWith(PREFIX);
}

export function decodeCallStubRoomTip(text: string | null | undefined): CallStubRoomTip | null {
  if (!isCallStubRoomTipToken(text)) return null;
  const parts = String(text).split("|");
  if (parts.length < 8) return null;
  const [, kind, status, ev, initiator, recipient, dur, ...labelParts] = parts;
  if (!initiator) return null;
  return {
    callKind: kind === "video" ? "video" : "voice",
    status: status ?? "",
    resolvedEvent: (ev || null) as CallSessionResolvedEvent | null,
    initiatorUserId: initiator,
    recipientUserId: recipient ?? "",
    durationSeconds: Math.max(0, Math.floor(Number(dur) || 0)),
    sharedLabel: labelParts.join("|"),
  };
}

/** viewer 비의존 문구 — 토큰이면 공유 라벨, 아니면 원문. */
export function callStubRoomTipSharedText(text: string | null | undefined): string {
  const tip = decodeCallStubRoomTip(text);
  return tip ? tip.sharedLabel : String(text ?? "");
}

/**
 * 리스트 표시 문구 — viewer 가 발신자/수신자인지에 따라 타임라인과 같은 계약으로 계산.
 * viewer 를 모르거나 토큰이 아니면 공유 라벨/원문.
 */
export function formatCallStubRoomTipForViewer(
  text: string | null | undefined,
  viewerUserId: string | null | undefined
): string {
  const tip = decodeCallStubRoomTip(text);
  if (!tip) return String(text ?? "");
  const viewer = String(viewerUserId ?? "").trim();
  if (!viewer) return tip.sharedLabel;
  const viewerRole =
    viewer === tip.initiatorUserId ? "caller" : tip.recipientUserId && viewer === tip.recipientUserId ? "callee" : null;
  if (!viewerRole) return tip.sharedLabel;
  return formatCallEventForViewer({
    callKind: tip.callKind,
    resolvedEvent: tip.resolvedEvent,
    callStatusFallback: tip.status,
    viewerRole,
    durationSeconds: tip.durationSeconds,
  }).listPreview;
}

function metaText(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * call_stub 메시지 행(content=공유 라벨, metadata=세션 당사자·결과) → 리스트 tip 토큰.
 * 서버 재계산·Realtime 목록 패치가 같은 함수를 써서 HTTP/Realtime 경로 문구가 일치한다.
 */
export function callStubRoomTipFromMessage(input: { content?: string | null; metadata?: unknown }): string {
  const sharedLabel = String(input.content ?? "").trim();
  const meta =
    input.metadata && typeof input.metadata === "object" ? (input.metadata as Record<string, unknown>) : null;
  if (!meta || !sharedLabel || isCallStubRoomTipToken(sharedLabel)) return sharedLabel;
  const dur = Number(meta.durationSeconds ?? 0);
  return encodeCallStubRoomTip({
    callKind: metaText(meta, "callKind") === "video" ? "video" : "voice",
    status: metaText(meta, "callStatus"),
    resolvedEvent: (metaText(meta, "callResolvedEvent") || null) as CallSessionResolvedEvent | null,
    initiatorUserId: metaText(meta, "initiatorUserId"),
    recipientUserId: metaText(meta, "recipientUserId"),
    durationSeconds: Number.isFinite(dur) ? dur : 0,
    sharedLabel,
  });
}

/**
 * `rooms.last_message` → 클라이언트 요약 문구. 서버 요약 변환 지점 공용(원문 토큰이 화면에 나가지 않게).
 * viewer 를 알면 발신/수신별 문구, 모르면 공유 라벨. 토큰이 아니면 원문 그대로.
 */
export function resolveRoomLastMessageForViewer(
  lastMessage: string | null | undefined,
  viewerUserId: string | null | undefined
): string {
  const text = String(lastMessage ?? "");
  if (!isCallStubRoomTipToken(text)) return text;
  return formatCallStubRoomTipForViewer(text, viewerUserId);
}
