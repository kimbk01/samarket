import {
  acquirePrimedCommunityMessengerStream,
  assertCallMediaNotPersistentlyDenied,
} from "@/lib/call/permission-manager";
import { acquireVideoCallStreamWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import {
  discardPrimedCommunityMessengerDevicePermission,
  hasUsablePrimedCommunityMessengerDeviceStream,
  isCommunityMessengerCallMediaReadySync,
  markCommunityMessengerMediaTrustedOnce,
  peekPrimedCommunityMessengerDeviceStream,
  shouldDiscardPrimedBeforeCommunityMessengerPrime,
  storePrimedCommunityMessengerDeviceStream,
  suspendPrimedCommunityMessengerDeviceStreamIdleRelease,
} from "@/lib/community-messenger/call-permission";
import { primeVideoElementAutoplayFromUserGesture } from "@/lib/community-messenger/call-local-video-pipeline";
import {
  isCommunityMessengerMediaSecureContext,
  persistDeviceIdsFromMediaStream,
  refreshPreferredCommunityMessengerDevicesFromEnumerate,
} from "@/lib/community-messenger/media-preflight";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import {
  DIBAY_MIC_ABORT_MESSAGE_DEFERRED,
  DIBAY_MIC_ABORT_MESSAGE_LATER,
} from "@/lib/permissions/dibay-mic-gate-messages";
import { ensureAndroidNativeCallMediaPermissions } from "@/lib/permissions/android-native-device-permissions";

export type CallMediaPrimeResult =
  | { ok: true }
  | {
      ok: false;
      code: "insecure_context" | "denied" | "deferred" | "later" | "no_api" | "failed";
    };

function mapPrimeError(error: unknown): CallMediaPrimeResult {
  if (error instanceof DOMException) {
    if (error.name === "SecurityError" || error.message.includes("insecure")) {
      return { ok: false, code: "insecure_context" };
    }
    if (error.name === "NotAllowedError") {
      return { ok: false, code: "denied" };
    }
    if (error.name === "NotSupportedError") {
      return { ok: false, code: "no_api" };
    }
    if (error.name === "AbortError") {
      if (error.message === DIBAY_MIC_ABORT_MESSAGE_DEFERRED) return { ok: false, code: "deferred" };
      if (error.message === DIBAY_MIC_ABORT_MESSAGE_LATER) return { ok: false, code: "later" };
      return { ok: false, code: "later" };
    }
  }
  return { ok: false, code: "failed" };
}

/** 영상 통화 즉시 카메라 — trusted·live primed(video)·브라우저 granted(캐시) */
export function isVideoCallMediaReady(): boolean {
  return isCommunityMessengerCallMediaReadySync("video");
}

/** 음성 통화 — trusted·live primed(voice)·브라우저 granted(캐시) */
export function isVoiceCallMediaReady(): boolean {
  return isCommunityMessengerCallMediaReadySync("voice");
}

export function isCallMediaReadyForKind(kind: CommunityMessengerCallKind): boolean {
  return kind === "video" ? isVideoCallMediaReady() : isVoiceCallMediaReady();
}

/**
 * 로그인 후 통화 미디어 온보딩 — 클릭 동기 구간에서 GUM 시작(제스처 유지).
 * DiBaY 프리프롬프트 모달이 이미 떴으므로 ensure*Gate await 없이 직접 요청.
 */
export function primeVideoCallMediaFromOnboardingClick(): Promise<CallMediaPrimeResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.resolve({ ok: false, code: "no_api" });
  }
  if (!isCommunityMessengerMediaSecureContext()) {
    return Promise.resolve({ ok: false, code: "insecure_context" });
  }
  if (hasUsablePrimedCommunityMessengerDeviceStream("video")) {
    const primed = peekPrimedCommunityMessengerDeviceStream("video");
    if (primed) {
      suspendPrimedCommunityMessengerDeviceStreamIdleRelease();
      primeVideoElementAutoplayFromUserGesture(primed);
    }
    return Promise.resolve({ ok: true });
  }
  if (shouldDiscardPrimedBeforeCommunityMessengerPrime("video")) {
    discardPrimedCommunityMessengerDevicePermission();
  }

  const gumPromise = navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  return gumPromise
    .then(async (stream) => {
      try {
        await assertCallMediaNotPersistentlyDenied("video");
      } catch (error) {
        for (const track of stream.getTracks()) track.stop();
        return mapPrimeError(error);
      }
      if (typeof window === "undefined") {
        for (const track of stream.getTracks()) track.stop();
        return { ok: true as const };
      }
      const hasLiveVideo = stream.getVideoTracks().some((t) => t.readyState === "live");
      if (!hasLiveVideo) {
        for (const track of stream.getTracks()) track.stop();
        return { ok: false as const, code: "failed" as const };
      }
      persistDeviceIdsFromMediaStream(stream);
      void refreshPreferredCommunityMessengerDevicesFromEnumerate();
      storePrimedCommunityMessengerDeviceStream("video", stream);
      suspendPrimedCommunityMessengerDeviceStreamIdleRelease();
      markCommunityMessengerMediaTrustedOnce("voice");
      markCommunityMessengerMediaTrustedOnce("video");
      primeVideoElementAutoplayFromUserGesture(stream);
      return { ok: true as const };
    })
    .catch((error) => mapPrimeError(error));
}

export async function primeVideoCallMediaFromUserGesture(opts?: {
  explicitRetry?: boolean;
}): Promise<CallMediaPrimeResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, code: "no_api" };
  }
  if (!isCommunityMessengerMediaSecureContext()) {
    return { ok: false, code: "insecure_context" };
  }
  if (hasUsablePrimedCommunityMessengerDeviceStream("video")) {
    const primed = peekPrimedCommunityMessengerDeviceStream("video");
    if (primed) {
      suspendPrimedCommunityMessengerDeviceStreamIdleRelease();
      primeVideoElementAutoplayFromUserGesture(primed);
    }
    return { ok: true };
  }
  if (shouldDiscardPrimedBeforeCommunityMessengerPrime("video")) {
    discardPrimedCommunityMessengerDevicePermission();
  }
  try {
    await assertCallMediaNotPersistentlyDenied("video");
    const stream = opts?.explicitRetry
      ? await acquireVideoCallStreamWithDiBaYGate({ explicitRetry: true })
      : await acquirePrimedCommunityMessengerStream("video");
    if (typeof window === "undefined") {
      for (const track of stream.getTracks()) track.stop();
      return { ok: true };
    }
    const hasLiveVideo = stream.getVideoTracks().some((t) => t.readyState === "live");
    if (!hasLiveVideo) {
      for (const track of stream.getTracks()) track.stop();
      return { ok: false, code: "failed" };
    }
    persistDeviceIdsFromMediaStream(stream);
    void refreshPreferredCommunityMessengerDevicesFromEnumerate();
    storePrimedCommunityMessengerDeviceStream("video", stream);
    suspendPrimedCommunityMessengerDeviceStreamIdleRelease();
    markCommunityMessengerMediaTrustedOnce("voice");
    markCommunityMessengerMediaTrustedOnce("video");
    primeVideoElementAutoplayFromUserGesture(stream);
    return { ok: true };
  } catch (error) {
    return mapPrimeError(error);
  }
}

export async function primeVoiceCallMediaFromUserGesture(_opts?: {
  explicitRetry?: boolean;
}): Promise<CallMediaPrimeResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return { ok: false, code: "no_api" };
  }
  if (!isCommunityMessengerMediaSecureContext()) {
    return { ok: false, code: "insecure_context" };
  }
  if (hasUsablePrimedCommunityMessengerDeviceStream("voice")) {
    return { ok: true };
  }
  if (shouldDiscardPrimedBeforeCommunityMessengerPrime("voice")) {
    discardPrimedCommunityMessengerDevicePermission();
  }
  try {
    await assertCallMediaNotPersistentlyDenied("voice");
    const stream = await acquirePrimedCommunityMessengerStream("voice");
    if (typeof window === "undefined") {
      for (const track of stream.getTracks()) track.stop();
      return { ok: true };
    }
    persistDeviceIdsFromMediaStream(stream);
    void refreshPreferredCommunityMessengerDevicesFromEnumerate();
    storePrimedCommunityMessengerDeviceStream("voice", stream);
    markCommunityMessengerMediaTrustedOnce("voice");
    return { ok: true };
  } catch (error) {
    return mapPrimeError(error);
  }
}

/** 모든 발신 CTA — 영상은 실패 시 navigate 금지. CTA 제스처에서 explicitRetry 로 DiBaY deferred 방지 */
export async function primeOutgoingCallMediaBeforeNavigate(
  kind: CommunityMessengerCallKind
): Promise<CallMediaPrimeResult> {
  const androidMedia = await ensureAndroidNativeCallMediaPermissions(kind);
  if (androidMedia === "denied") {
    return { ok: false, code: "denied" };
  }
  if (kind === "video") {
    return primeVideoCallMediaFromUserGesture({ explicitRetry: true });
  }
  return primeVoiceCallMediaFromUserGesture({ explicitRetry: true });
}
