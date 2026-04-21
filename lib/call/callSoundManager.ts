import {
  getMessengerCallSoundConfigCache,
  resolveMessengerCallEndSoundUrl,
  resolveMessengerCallMissedSoundUrl,
  resolveMessengerCallToneUrl,
} from "@/lib/community-messenger/messenger-call-sound-config-client";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  playCommunityMessengerCallSignalSound,
  startCommunityMessengerCallTone,
  stopCommunityMessengerCallFeedback,
  type CallToneController,
} from "@/lib/community-messenger/call-feedback-sound";
import { isCommunityMessengerIncomingCallSoundEnabled } from "@/lib/community-messenger/preferences";

export type CallToneMode = "incoming" | "outgoing";

let activeRing: CallToneController | null = null;

/** 관리자 설정 URL → 합성/기본 폴백 포함, 수신 벨 재생 */
export async function playIncomingRingtone(callKind: CommunityMessengerCallKind): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isCommunityMessengerIncomingCallSoundEnabled()) return;
  stopAllCallSounds();
  activeRing = await startCommunityMessengerCallTone("incoming", { callKind });
}

/** 발신 링백 */
export async function playOutgoingRingback(callKind: CommunityMessengerCallKind): Promise<void> {
  if (typeof window === "undefined") return;
  stopAllCallSounds();
  activeRing = await startCommunityMessengerCallTone("outgoing", { callKind });
}

export function stopAllCallSounds(): void {
  activeRing?.stop();
  activeRing = null;
  stopCommunityMessengerCallFeedback();
}

/** 부재 / 통화 종료 원샷 — `resolveMessengerCallMissedSoundUrl` 등 관리자 키 반영 */
export async function playMissedCallSound(): Promise<void> {
  await playCommunityMessengerCallSignalSound("missed");
}

export async function playCallEndSound(): Promise<void> {
  await playCommunityMessengerCallSignalSound("call_end");
}

/** URL만 필요할 때 (UI 미리듣기 등) */
export function resolveIncomingTonePreviewUrl(callKind: CommunityMessengerCallKind): string | null {
  const cfg = getMessengerCallSoundConfigCache();
  return resolveMessengerCallToneUrl(cfg, "incoming", callKind);
}

export function resolveOutgoingTonePreviewUrl(callKind: CommunityMessengerCallKind): string | null {
  const cfg = getMessengerCallSoundConfigCache();
  return resolveMessengerCallToneUrl(cfg, "outgoing", callKind);
}

export function resolveMissedPreviewUrl(): string | null {
  return resolveMessengerCallMissedSoundUrl(getMessengerCallSoundConfigCache());
}

export function resolveCallEndPreviewUrl(): string | null {
  return resolveMessengerCallEndSoundUrl(getMessengerCallSoundConfigCache());
}
