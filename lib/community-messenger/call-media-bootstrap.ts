import { isCommunityMessengerCallMediaReadySync } from "@/lib/community-messenger/call-permission";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { ensureCallCanUseMedia } from "@/lib/community-messenger/call-media-permission-preflight";
import { acquirePrimedCommunityMessengerStream } from "@/lib/call/permission-manager";
import { storePrimedCommunityMessengerDeviceStream } from "@/lib/community-messenger/call-permission";

export type CallMediaPrimeResult =
  | { ok: true }
  | {
      ok: false;
      code: "insecure_context" | "denied" | "deferred" | "later" | "no_api" | "failed";
    };

/** 영상 통화 — 중앙 call_media store 기준 check-only */
export function isVideoCallMediaReady(): boolean {
  return isCommunityMessengerCallMediaReadySync("video");
}

/** 음성 통화 — 중앙 call_media store 기준 check-only */
export function isVoiceCallMediaReady(): boolean {
  return isCommunityMessengerCallMediaReadySync("voice");
}

export function isCallMediaReadyForKind(kind: CommunityMessengerCallKind): boolean {
  return kind === "video" ? isVideoCallMediaReady() : isVoiceCallMediaReady();
}

/**
 * @deprecated 통화 시점 check-only — 온보딩에서만 GUM 요청. 기존 호출 보호용.
 */
export function primeVideoCallMediaFromOnboardingClick(): Promise<CallMediaPrimeResult> {
  return primeOutgoingCallMediaBeforeNavigate("video");
}

/** @deprecated 통화 시점 check-only */
export async function primeVideoCallMediaFromUserGesture(_opts?: {
  explicitRetry?: boolean;
}): Promise<CallMediaPrimeResult> {
  return primeOutgoingCallMediaBeforeNavigate("video");
}

/** @deprecated 통화 시점 check-only */
export async function primeVoiceCallMediaFromUserGesture(_opts?: {
  explicitRetry?: boolean;
}): Promise<CallMediaPrimeResult> {
  return primeOutgoingCallMediaBeforeNavigate("voice");
}

/** 모든 발신 CTA — 권한 확인 후 영상은 GUM 프라임(사용자 제스처 스택에서 호출) */
export async function primeOutgoingCallMediaBeforeNavigate(
  kind: CommunityMessengerCallKind
): Promise<CallMediaPrimeResult> {
  const preflight = await ensureCallCanUseMedia(kind);
  if (!preflight.ok) {
    return { ok: false, code: "denied" };
  }
  if (kind === "video") {
    try {
      const stream = await acquirePrimedCommunityMessengerStream("video");
      storePrimedCommunityMessengerDeviceStream("video", stream);
    } catch {
      return { ok: false, code: "failed" };
    }
  }
  return { ok: true };
}
