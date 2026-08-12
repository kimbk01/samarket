/**
 * GATE 2 — canonical notification sound authority.
 *
 * Sound occurrence = (recipientId, identityKind, canonicalEventId, authEpoch).
 * DO NOT: unread delta, badge count, array length, Date.now(), poll tick, route mount.
 * DO NOT: await network on the play hot path (engine).
 *
 * Call incoming ringtone is NOT owned here (Native IncomingCallRingOwner / CallKit).
 */

import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { useCallStore, type MessengerCallStatus } from "@/lib/community-messenger/stores/useCallStore";
import { getDomainBadgeSurfaceAuthEpoch } from "@/lib/messenger/contracts/domain-badge-surface-store";
import {
  ADMIN_SOUND_BURST_WINDOW_MS,
  isAdminSoundEligible,
} from "@/lib/notifications/admin-notification-sound-policy";
import { traceAdminSound } from "@/lib/notifications/admin-notification-sound-trace";
import { eventKeyForNotificationDomain } from "@/lib/notifications/notification-sound-event-map";
import {
  playEventNotificationSound,
  resetNotificationSoundEngineForAuthEpoch,
} from "@/lib/notifications/notification-sound-engine";
import {
  getNotificationSoundGateSnapshot,
  type NotificationSoundGateSnapshot,
} from "@/lib/notifications/notification-sound-gate-snapshot";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";
import { SAMARKET_NOTIFICATION_SOUND_LEADER_SCOPE } from "@/lib/notifications/notification-sound-leader-scope";
import { subscribeTabLeader } from "@/lib/runtime/leader-tab-coordinator";

export type NotificationSoundIdentityKind =
  | "member_event"
  | "messenger_message"
  | "admin_row"
  | "call_session";

export type NotificationSoundTransport = "realtime" | "poll" | "push" | "hydrate";

export type NotificationSoundDecisionReason =
  | "PLAY"
  | "SKIP_ALREADY_CONSUMED"
  | "SKIP_BOOTSTRAP"
  | "SKIP_BACKGROUND_OS_OWNER"
  | "SKIP_MUTED"
  | "SKIP_ACTIVE_CALL"
  | "SKIP_NOT_LEADER"
  | "SKIP_WRONG_RECIPIENT"
  | "SKIP_NO_IDENTITY"
  | "SKIP_SAME_ROOM_FOREGROUND"
  | "SKIP_CALL_NATIVE_OWNER"
  | "SKIP_ADMIN_INFORMATIONAL"
  | "SKIP_COALESCED"
  | "SKIP_POLL_NOT_AUTHORITY"
  | "SKIP_TIMESTAMP_IDENTITY";

export type NotificationSoundDecisionInput = {
  identityKind: NotificationSoundIdentityKind;
  canonicalEventId: string;
  recipientId: string;
  eventType: string;
  domain?: string | null;
  source: NotificationSoundTransport;
  createdAt?: string | null;
  muted?: boolean;
  allowPollFallback?: boolean;
  adminSourceTable?: string | null;
  sameRoomForeground?: boolean;
  gate?: NotificationSoundGateSnapshot | null;
};

export type NotificationSoundDecision = {
  action: "PLAY" | "SKIP";
  reason: NotificationSoundDecisionReason;
  soundKey: string;
};

const CHAT_EVENT_TYPES = new Set([
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "store_order_message",
  "trade_message",
]);

const CALL_INCOMING_EVENT_KEYS = new Set(["call_incoming_voice", "call_incoming_video"]);
const CALL_INCOMING_TYPES = new Set(["incoming_call_signal"]);

const ACTIVE_CALL_STATUSES = new Set<MessengerCallStatus>([
  "incoming",
  "outgoing",
  "connecting",
  "ringing",
  "active",
  "minimized",
]);

/** created_at may slightly precede JS horizon (clock / pipeline). Not a novelty signal. */
const HORIZON_GRACE_MS = 15_000;
const MESSENGER_BURST_WINDOW_MS = 800;
const MAX_CONSUMED = 800;

const consumedKeys = new Set<string>();
let sessionStartedAt = 0;
let soundAuthEpoch = 0;
let isSoundLeader = true;
let leaderStarted = false;
let leaderUnsub: (() => void) | null = null;
let lastMessengerPlayAt = 0;
let lastAdminPlayAt = 0;
let testRecipientOverride: string | null = null;
let testLeaderOverride: boolean | null = null;
let testCallActiveOverride: boolean | null = null;
let testVisibilityOverride: "visible" | "hidden" | null = null;
let testFocusOverride: boolean | null = null;

function trimId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pruneConsumed(): void {
  while (consumedKeys.size >= MAX_CONSUMED) {
    const first = consumedKeys.values().next().value;
    if (first === undefined) break;
    consumedKeys.delete(first);
  }
}

function currentRecipientId(): string {
  if (testRecipientOverride) return testRecipientOverride;
  return getBoundAuthUserId() ?? "";
}

function currentAuthEpoch(): number {
  return Math.max(soundAuthEpoch, getDomainBadgeSurfaceAuthEpoch());
}

function buildSoundKey(
  recipientId: string,
  identityKind: NotificationSoundIdentityKind,
  canonicalEventId: string,
  authEpoch: number
): string {
  return `${recipientId}:${identityKind}:${canonicalEventId}:${authEpoch}`;
}

function looksLikeTimestampIdentity(id: string): boolean {
  return /^\d{10,13}$/.test(id);
}

function parseCreatedAtMs(createdAt: string | null | undefined): number | null {
  if (!createdAt || !createdAt.trim()) return null;
  const ms = Date.parse(createdAt);
  return Number.isFinite(ms) ? ms : null;
}

function isJsAudibleOwner(): boolean {
  if (testVisibilityOverride === "hidden") return false;
  if (testVisibilityOverride === "visible") {
    if (testFocusOverride === false) return false;
    return true;
  }
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  if (testFocusOverride === false) return false;
  if (testFocusOverride === true) return true;
  if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
  return true;
}

function isActiveCallBlocking(): boolean {
  if (testCallActiveOverride != null) return testCallActiveOverride;
  try {
    return ACTIVE_CALL_STATUSES.has(useCallStore.getState().callStatus);
  } catch {
    return false;
  }
}

function markConsumed(soundKey: string): void {
  pruneConsumed();
  consumedKeys.add(soundKey);
}

function shouldConsumeOnSkip(reason: NotificationSoundDecisionReason): boolean {
  return reason !== "SKIP_NO_IDENTITY" && reason !== "SKIP_WRONG_RECIPIENT" && reason !== "SKIP_TIMESTAMP_IDENTITY";
}

export function ensureNotificationSoundRuntimeStarted(): void {
  if (sessionStartedAt === 0) {
    sessionStartedAt = Date.now();
  }
  if (leaderStarted || typeof window === "undefined") return;
  leaderStarted = true;
  leaderUnsub = subscribeTabLeader(SAMARKET_NOTIFICATION_SOUND_LEADER_SCOPE, (leader) => {
    isSoundLeader = leader;
  });
}

export function resetNotificationSoundRuntimeForAuthEpoch(): void {
  consumedKeys.clear();
  lastMessengerPlayAt = 0;
  lastAdminPlayAt = 0;
  soundAuthEpoch += 1;
  sessionStartedAt = Date.now();
  resetNotificationSoundEngineForAuthEpoch();
}

export function seedCanonicalSoundConsumed(input: {
  identityKind: NotificationSoundIdentityKind;
  canonicalEventId: string;
  recipientId?: string;
}): void {
  const recipientId = trimId(input.recipientId) || currentRecipientId() || "seed";
  const id = trimId(input.canonicalEventId);
  if (!id) return;
  markConsumed(buildSoundKey(recipientId, input.identityKind, id, currentAuthEpoch()));
}

export function extractCanonicalSoundIdentity(row: Record<string, unknown>): {
  identityKind: NotificationSoundIdentityKind;
  canonicalEventId: string;
} | null {
  const type = trimId(row.type) || trimId(row.event_type) || trimId(row.category);
  if (CALL_INCOMING_TYPES.has(type)) {
    const sessionId = trimId(row.call_session_id);
    return { identityKind: "call_session", canonicalEventId: sessionId || trimId(row.id) };
  }

  const messageId =
    trimId(row.message_id) ||
    trimId((row.meta as { message_id?: unknown; messageId?: unknown } | undefined)?.message_id) ||
    trimId((row.meta as { message_id?: unknown; messageId?: unknown } | undefined)?.messageId) ||
    parseMessageIdFromDedupe(trimId(row.dedupe_key));

  if (messageId && (CHAT_EVENT_TYPES.has(type) || trimId(row.notification_type) === "chat")) {
    return { identityKind: "messenger_message", canonicalEventId: messageId };
  }

  const eventId = trimId(row.id);
  if (!eventId) return null;
  return { identityKind: "member_event", canonicalEventId: eventId };
}

function parseMessageIdFromDedupe(dedupe: string): string {
  const m = dedupe.match(/^msg:[^:]+:(.+)$/);
  return m?.[1]?.trim() ?? "";
}

export function decideNotificationSound(input: NotificationSoundDecisionInput): NotificationSoundDecision {
  ensureNotificationSoundRuntimeStarted();
  const canonicalEventId = trimId(input.canonicalEventId);
  const declaredRecipient = trimId(input.recipientId);
  const currentUser = currentRecipientId();
  const recipientId = declaredRecipient || currentUser;
  const authEpoch = currentAuthEpoch();
  const soundKey = buildSoundKey(recipientId, input.identityKind, canonicalEventId || "_", authEpoch);

  if (!canonicalEventId || !recipientId) {
    return { action: "SKIP", reason: "SKIP_NO_IDENTITY", soundKey };
  }
  if (looksLikeTimestampIdentity(canonicalEventId)) {
    return { action: "SKIP", reason: "SKIP_TIMESTAMP_IDENTITY", soundKey };
  }

  if (declaredRecipient && currentUser && declaredRecipient !== currentUser) {
    return { action: "SKIP", reason: "SKIP_WRONG_RECIPIENT", soundKey };
  }

  if (input.identityKind === "call_session" || CALL_INCOMING_EVENT_KEYS.has(input.eventType) || CALL_INCOMING_TYPES.has(input.eventType)) {
    const skip = { action: "SKIP" as const, reason: "SKIP_CALL_NATIVE_OWNER" as const, soundKey };
    markConsumed(soundKey);
    return skip;
  }

  if (consumedKeys.has(soundKey)) {
    return { action: "SKIP", reason: "SKIP_ALREADY_CONSUMED", soundKey };
  }

  if (input.source === "hydrate") {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_BOOTSTRAP", soundKey };
  }

  if (input.source === "poll" && input.allowPollFallback !== true) {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_POLL_NOT_AUTHORITY", soundKey };
  }

  const createdAtMs = parseCreatedAtMs(input.createdAt);
  if (sessionStartedAt > 0 && createdAtMs != null && createdAtMs < sessionStartedAt - HORIZON_GRACE_MS) {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_BOOTSTRAP", soundKey };
  }

  const gate = input.gate ?? getNotificationSoundGateSnapshot();
  if (gate?.isWindowFocused === false || !isJsAudibleOwner()) {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_BACKGROUND_OS_OWNER", soundKey };
  }

  const leader = testLeaderOverride ?? isSoundLeader;
  if (!leader) {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_NOT_LEADER", soundKey };
  }

  if (input.muted === true) {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_MUTED", soundKey };
  }

  if (gate?.userNotificationSettings.sound_enabled === false) {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_MUTED", soundKey };
  }

  if (input.sameRoomForeground === true) {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_SAME_ROOM_FOREGROUND", soundKey };
  }

  if (isActiveCallBlocking()) {
    markConsumed(soundKey);
    return { action: "SKIP", reason: "SKIP_ACTIVE_CALL", soundKey };
  }

  if (input.identityKind === "admin_row") {
    const table = trimId(input.adminSourceTable);
    if (!table || !isAdminSoundEligible(table)) {
      markConsumed(soundKey);
      return { action: "SKIP", reason: "SKIP_ADMIN_INFORMATIONAL", soundKey };
    }
    const now = Date.now();
    if (now - lastAdminPlayAt < ADMIN_SOUND_BURST_WINDOW_MS) {
      markConsumed(soundKey);
      return { action: "SKIP", reason: "SKIP_COALESCED", soundKey };
    }
  }

  if (input.identityKind === "messenger_message") {
    const now = Date.now();
    if (now - lastMessengerPlayAt < MESSENGER_BURST_WINDOW_MS) {
      markConsumed(soundKey);
      return { action: "SKIP", reason: "SKIP_COALESCED", soundKey };
    }
  }

  markConsumed(soundKey);
  return { action: "PLAY", reason: "PLAY", soundKey };
}

function recordPlayClock(kind: NotificationSoundIdentityKind): void {
  const now = Date.now();
  if (kind === "admin_row") lastAdminPlayAt = now;
  if (kind === "messenger_message") lastMessengerPlayAt = now;
}

export function ingestCanonicalNotificationSound(input: NotificationSoundDecisionInput): NotificationSoundDecision {
  const decision = decideNotificationSound(input);
  if (decision.action !== "PLAY") return decision;
  recordPlayClock(input.identityKind);
  void playEventNotificationSound(input.eventType);
  return decision;
}

export function ingestNotificationEventRowSound(row: Record<string, unknown>): NotificationSoundDecision {
  const identity = extractCanonicalSoundIdentity(row);
  if (!identity) {
    return { action: "SKIP", reason: "SKIP_NO_IDENTITY", soundKey: "" };
  }
  const recipientId = trimId(row.user_id) || currentRecipientId();
  return ingestCanonicalNotificationSound({
    identityKind: identity.identityKind,
    canonicalEventId: identity.canonicalEventId,
    recipientId,
    eventType: trimId(row.type) || trimId(row.event_type) || "system_default",
    domain: typeof row.domain === "string" ? row.domain : null,
    source: "realtime",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    muted: row.muted_snapshot === true,
    gate: getNotificationSoundGateSnapshot(),
  });
}

export function ingestMessengerMessageSound(input: {
  messageId: string;
  recipientId?: string;
  domain?: NotificationDomain | null;
  createdAt?: string | null;
  sameRoomForeground?: boolean;
  muted?: boolean;
}): NotificationSoundDecision {
  const messageId = trimId(input.messageId);
  const recipientId = trimId(input.recipientId) || currentRecipientId();
  const eventType = input.domain ? eventKeyForNotificationDomain(input.domain) : "messenger_direct_message_received";
  return ingestCanonicalNotificationSound({
    identityKind: "messenger_message",
    canonicalEventId: messageId,
    recipientId,
    eventType,
    domain: input.domain ?? null,
    source: "realtime",
    createdAt: input.createdAt ?? null,
    muted: input.muted,
    sameRoomForeground: input.sameRoomForeground,
    gate: getNotificationSoundGateSnapshot(),
  });
}

export function ingestAdminRowSound(input: {
  sourceTable: string;
  rowId: string;
  createdAt?: string | null;
  recipientId?: string;
}): NotificationSoundDecision {
  const rowId = trimId(input.rowId);
  const sourceTable = trimId(input.sourceTable);
  traceAdminSound("INGEST_ENTER", {
    identityKind: "admin_row",
    sourceTable,
    canonicalEventId: rowId,
    createdAt: input.createdAt ?? null,
  });
  const decision = ingestCanonicalNotificationSound({
    identityKind: "admin_row",
    canonicalEventId: rowId,
    recipientId: trimId(input.recipientId) || currentRecipientId() || "admin",
    eventType: "admin_notice_received",
    source: "realtime",
    createdAt: input.createdAt ?? null,
    adminSourceTable: sourceTable,
  });
  traceAdminSound("DECISION", {
    action: decision.action,
    reason: decision.reason,
    soundKey: decision.soundKey,
    sourceTable,
    canonicalEventId: rowId,
  });
  return decision;
}

/** @internal vitest */
export function __resetNotificationSoundDecisionForTests(opts?: {
  sessionStartedAt?: number;
  recipientId?: string | null;
  isLeader?: boolean | null;
  callActive?: boolean | null;
  visibility?: "visible" | "hidden" | null;
  windowFocused?: boolean | null;
}): void {
  consumedKeys.clear();
  lastMessengerPlayAt = 0;
  lastAdminPlayAt = 0;
  soundAuthEpoch = 0;
  sessionStartedAt = opts?.sessionStartedAt ?? Date.now();
  testRecipientOverride = opts?.recipientId === undefined ? null : opts.recipientId;
  testLeaderOverride = opts?.isLeader === undefined ? null : opts.isLeader;
  testCallActiveOverride = opts?.callActive === undefined ? null : opts.callActive;
  testVisibilityOverride = opts?.visibility === undefined ? null : opts.visibility;
  testFocusOverride = opts?.windowFocused === undefined ? null : opts.windowFocused;
}

export function __getNotificationSoundConsumedSizeForTests(): number {
  return consumedKeys.size;
}
