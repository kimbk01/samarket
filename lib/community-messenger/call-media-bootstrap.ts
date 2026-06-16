import { isCommunityMessengerCallMediaReadySync } from "@/lib/community-messenger/call-permission";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  ensureCallMediaForUserGesture,
} from "@/lib/community-messenger/call-media-permission-preflight";
import { buildCommunityMessengerMediaStreamConstraints } from "@/lib/community-messenger/media-preflight";
import { getCommunityMessengerUserMedia } from "@/lib/community-messenger/call-media-stream";
import {
  peekPrimedCommunityMessengerDeviceStream,
  storePrimedCommunityMessengerDeviceStream,
} from "@/lib/community-messenger/call-permission";

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

/** 발신 CTA — 권한 요청(필요 시) + 영상은 사용자 제스처에서 GUM 프라임 */
export async function primeOutgoingCallMediaBeforeNavigate(
  kind: CommunityMessengerCallKind
): Promise<CallMediaPrimeResult> {
  const preflight = await ensureCallMediaForUserGesture(kind);
  if (!preflight.ok) {
    return { ok: false, code: "denied" };
  }

  if (kind === "video" && !peekPrimedCommunityMessengerDeviceStream("video")) {
    try {
      const constraints = buildCommunityMessengerMediaStreamConstraints("video");
      const stream = await getCommunityMessengerUserMedia(constraints, {
        featureKey: "messenger_video_call",
      });
      storePrimedCommunityMessengerDeviceStream("video", stream);
    } catch {
      return { ok: false, code: "failed" };
    }
  }

  return { ok: true };
}
