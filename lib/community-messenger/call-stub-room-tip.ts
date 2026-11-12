/**
 * 통화 기록(call_stub)의 채팅 리스트 tip — 발신자·수신자별 문구.
 *
 * `community_messenger_rooms.last_message` 는 방 단위 1행이라 viewer 별 문구를 직접 저장할 수 없다.
 * 스키마·bootstrap RPC 시그니처를 바꾸지 않고, call_stub tip 일 때만 구조화 토큰을 저장한다:
 *   `cmcall1|<kind>|<status>|<resolvedEvent>|<initiatorUserId>|<recipientUserId>|<durationSeconds>|<sharedLabel>`
 * - 리스트 포맷터는 viewer 와 initiator 를 비교해 formatCallEventForViewer 로 문구를 만든다
 *   (발신 취소 → 발신자 "취소됨" / 수신자 "부재중"; 거절·무응답·통화 시간 동일 계약).
 * - viewer 를 모르는 소비자(관리자·검색 원문 등)는 decode 후 sharedLabel 을 쓴다.
 * - 토큰이 아닌 기존 행(2026-10-15 이전 한국어 라벨): 한국어 화면은 그대로, 다른 언어는 정확 일치 표로 다시 그린다
 *   (`formatLegacyCallStubLabelForLang` — DB 무변경. docs/audit/call-record-en-korean-residual-design-2026-11-13.md D2).
 */
import {
  buildCallEventPresentation,
  formatCallEventForViewer,
  type CallEventCanonicalResult,
} from "@/lib/community-messenger/call-event-presentation";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
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

/**
 * 2026-10-15 토큰 도입 전에 방 미리보기에 저장된 한국어 통화 문장 — 운영 DB 102행·14형태(2026-11-13 조회)를
 * **문장 전체 일치**로만 알아본다(부분 문자열 판정 금지). 글자는 코드에 쓰지 않고 카탈로그 한국어 값에서 만든다
 * (`cm_call_legacy_*` = 지금 카탈로그에 없는 옛 결과 글자). 옛 행은 발신자를 모르므로 보는 사람과 무관한 결과로 그린다
 * (한국어 화면도 지금 발신자·수신자에게 같은 문장을 보인다).
 */
const LEGACY_SEPARATOR = " \u00b7 ";
const LEGACY_RESULT_KEYS: ReadonlyArray<readonly [MessageKey, CallEventCanonicalResult]> = [
  ["cm_call_legacy_result_cancelled", "outgoing_cancelled"],
  ["cm_call_result_ended", "connected_ended"],
  ["cm_call_legacy_result_declined", "remote_rejected"],
  ["cm_call_result_missed", "incoming_missed"],
  ["cm_call_result_calling", "outgoing_started"],
  ["cm_call_result_disconnected", "interrupted"],
];

type LegacyTable = {
  kinds: Map<string, CommunityMessengerCallKind>;
  missed: Map<string, CommunityMessengerCallKind>;
  results: Map<string, CallEventCanonicalResult>;
  durations: RegExp[];
};
let legacyTable: LegacyTable | null = null;

function escapeRegExp(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 카탈로그 시간 글자(`{mins}`·`{secs}` 자리) → 분·초를 뽑는 정규식 */
function durationPattern(template: string): RegExp {
  const withMins = template.includes("{mins}");
  const body = escapeRegExp(template).replace("\\{mins\\}", "(\\d+)").replace("\\{secs\\}", "(\\d+)");
  return new RegExp(withMins ? `^${body}$` : `^()${body}$`);
}

function getLegacyTable(): LegacyTable {
  if (legacyTable) return legacyTable;
  const ko = (key: MessageKey) => translate("ko", key);
  legacyTable = {
    kinds: new Map([
      [ko("cm_home_call_voice"), "voice"],
      [ko("cm_home_call_video"), "video"],
    ]),
    missed: new Map([
      [ko("cm_call_missed_voice"), "voice"],
      [ko("cm_call_missed_video"), "video"],
    ]),
    results: new Map<string, CallEventCanonicalResult>([
      ...LEGACY_RESULT_KEYS.map(([key, canonical]) => [ko(key), canonical] as const),
      /** 옛 서버가 영어 상태값을 그대로 붙인 1형태 */
      ["cancelled", "outgoing_cancelled"],
    ]),
    durations: [
      durationPattern(ko("cm_home_call_duration_mins")),
      durationPattern(ko("cm_home_call_duration_secs")),
      /** 11-08 이전 서버가 영어 시간 글자를 붙인 형태(「3m 51s」·「12s」) */
      /^(\d+)m (\d+)s$/,
      /^()(\d+)s$/,
    ],
  };
  return legacyTable;
}

export type LegacyCallStubLabel = {
  callKind: CommunityMessengerCallKind;
  canonical: CallEventCanonicalResult;
  durationSeconds: number;
};

export function parseLegacyCallStubLabel(text: string | null | undefined): LegacyCallStubLabel | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const table = getLegacyTable();
  const missedKind = table.missed.get(raw);
  if (missedKind) return { callKind: missedKind, canonical: "incoming_missed", durationSeconds: 0 };
  const at = raw.indexOf(LEGACY_SEPARATOR);
  if (at <= 0) return null;
  const callKind = table.kinds.get(raw.slice(0, at));
  if (!callKind) return null;
  const result = raw.slice(at + LEGACY_SEPARATOR.length);
  const canonical = table.results.get(result);
  if (canonical) return { callKind, canonical, durationSeconds: 0 };
  for (const re of table.durations) {
    const m = re.exec(result);
    if (!m) continue;
    const seconds = Number(m[1] || 0) * 60 + Number(m[2]);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return { callKind, canonical: "connected_ended", durationSeconds: seconds };
  }
  return null;
}

/** 옛 한국어 통화 문장 → 보는 사람 언어. 한국어 화면·표에 없는 문장은 null(원문 그대로 쓰라는 뜻). */
export function formatLegacyCallStubLabelForLang(
  text: string | null | undefined,
  lang: AppLanguageCode
): string | null {
  if (lang === "ko") return null;
  const parsed = parseLegacyCallStubLabel(text);
  if (!parsed) return null;
  return buildCallEventPresentation({
    callKind: parsed.callKind,
    canonical: parsed.canonical,
    durationSeconds: parsed.durationSeconds,
    lang,
  }).listPreview;
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
  viewerUserId: string | null | undefined,
  lang: AppLanguageCode
): string {
  const tip = decodeCallStubRoomTip(text);
  if (!tip) return formatLegacyCallStubLabelForLang(text, lang) ?? String(text ?? "");
  const viewer = String(viewerUserId ?? "").trim();
  const viewerRole = !viewer ? null
    : viewer === tip.initiatorUserId ? "caller"
    : tip.recipientUserId && viewer === tip.recipientUserId ? "callee"
    : null;
  if (!viewerRole) {
    /**
     * 보는 사람을 모를 때: 한국어는 저장된 공유 라벨 그대로(지금과 같음). 다른 언어는 토큰의 종류·결과·시간으로
     * 그 언어 문구를 만든다(종료 결과는 보는 사람과 무관 — 제품 결정 2026-10-16).
     */
    if (lang === "ko") return tip.sharedLabel;
    return formatCallEventForViewer({
      callKind: tip.callKind,
      resolvedEvent: tip.resolvedEvent,
      callStatusFallback: tip.status,
      viewerRole: null,
      durationSeconds: tip.durationSeconds,
      lang,
    }).listPreview;
  }
  return formatCallEventForViewer({
    callKind: tip.callKind,
    resolvedEvent: tip.resolvedEvent,
    callStatusFallback: tip.status,
    viewerRole,
    durationSeconds: tip.durationSeconds,
    lang,
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
 * viewer 를 알면 발신/수신별 문구, 모르면 공유 라벨. 토큰이 아니면 원문 그대로 —
 * 단 옛 한국어 통화 문장(정확 일치 표)은 한국어가 아닌 화면에서 그 언어로 그린다(D2).
 */
export function resolveRoomLastMessageForViewer(
  lastMessage: string | null | undefined,
  viewerUserId: string | null | undefined,
  lang: AppLanguageCode
): string {
  const text = String(lastMessage ?? "");
  if (!isCallStubRoomTipToken(text)) return formatLegacyCallStubLabelForLang(text, lang) ?? text;
  return formatCallStubRoomTipForViewer(text, viewerUserId, lang);
}
