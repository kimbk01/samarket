/**
 * Phase 9 — Domain Sound key 연결 (기존 Sound SSOT event key 고정).
 * production Sound 재생 경로 변경 금지. Native Call ringtone 변경 금지.
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import type { StoreOrderSurfaceRole } from "@/lib/messenger/contracts/domain-notification-envelope-phase9";

/** Production notification-sound-event-key SSOT 와 정렬 */
export const PHASE9_DOMAIN_SOUND_KEYS = {
  general_direct: "messenger_direct_message_received",
  group: "messenger_group_message_received",
  trade: "trade_chat_message_received",
  store_order_customer: "delivery_chat_message_received_user",
  store_order_owner: "delivery_chat_message_received_owner",
} as const;

export type Phase9DomainSoundKey =
  (typeof PHASE9_DOMAIN_SOUND_KEYS)[keyof typeof PHASE9_DOMAIN_SOUND_KEYS];

/** Native Call / VoIP — Domain Notification Sound 선택 경로에 절대 포함 금지 */
export const PHASE9_NATIVE_CALL_SOUND_KEYS_FORBIDDEN = [
  "incoming_call_ringtone",
  "incoming_call_signal",
  "call_ringing",
  "voip",
] as const;

export type ResolvePhase9SoundKeyInput = Readonly<{
  chatDomain: ChatDomain;
  /** store_order 만 필수 */
  receiverRole?: StoreOrderSurfaceRole | null;
  /** 금지 입력 — 있으면 fail-closed */
  title?: string | null;
  messagePreview?: string | null;
  body?: string | null;
}>;

/**
 * chatDomain (+ store_order receiverRole) 만으로 soundKey 선택.
 * 문구·title fallback / general→trade fallback 금지.
 */
export function resolvePhase9DomainSoundKey(input: ResolvePhase9SoundKeyInput): Phase9DomainSoundKey {
  if (input.title != null || input.messagePreview != null || input.body != null) {
    throw new Error("dibay_phase9_sound_selection_from_copy_forbidden");
  }
  switch (input.chatDomain) {
    case "general_direct":
      return PHASE9_DOMAIN_SOUND_KEYS.general_direct;
    case "group":
      return PHASE9_DOMAIN_SOUND_KEYS.group;
    case "trade":
      return PHASE9_DOMAIN_SOUND_KEYS.trade;
    case "store_order": {
      if (input.receiverRole === "owner") return PHASE9_DOMAIN_SOUND_KEYS.store_order_owner;
      if (input.receiverRole === "customer") return PHASE9_DOMAIN_SOUND_KEYS.store_order_customer;
      throw new Error("dibay_phase9_store_order_sound_role_required");
    }
    default:
      throw new Error(`dibay_phase9_sound_unknown_domain:${input.chatDomain as string}`);
  }
}

export function assertSoundKeyMatchesEnvelope(
  chatDomain: ChatDomain,
  soundKey: string,
  receiverRole?: StoreOrderSurfaceRole | null
): void {
  const expected = resolvePhase9DomainSoundKey({ chatDomain, receiverRole });
  if (soundKey !== expected) {
    throw new Error(`dibay_phase9_sound_key_mismatch:${expected}`);
  }
  const soundKeyText: string = soundKey;
  for (const banned of PHASE9_NATIVE_CALL_SOUND_KEYS_FORBIDDEN) {
    if (soundKeyText.includes(banned) || soundKeyText === banned) {
      throw new Error("dibay_phase9_native_call_sound_forbidden");
    }
  }
}

export function assertPhase9DoesNotTouchNativeCallSound(selected: string): void {
  for (const banned of PHASE9_NATIVE_CALL_SOUND_KEYS_FORBIDDEN) {
    if (selected === banned || selected.includes("incoming_call") || selected.includes("voip")) {
      throw new Error("dibay_phase9_native_call_sound_impact_forbidden");
    }
  }
}
