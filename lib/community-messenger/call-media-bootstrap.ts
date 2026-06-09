import {
  acquirePrimedCommunityMessengerStream,
  assertCallMediaNotPersistentlyDenied,
} from "@/lib/call/permission-manager";
import { acquireVideoCallStreamWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import {
  discardPrimedCommunityMessengerDevicePermission,
  hasCommunityMessengerMediaTrustedMark,
  hasUsablePrimedCommunityMessengerDeviceStream,
  markCommunityMessengerMediaTrustedOnce,
  storePrimedCommunityMessengerDeviceStream,
} from "@/lib/community-messenger/call-permission";
import { isCommunityMessengerMediaBrowserGrantedSync } from "@/lib/community-messenger/media-permissions-query";
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
  if (typeof window === "undefined") return false;
  return (
    hasCommunityMessengerMediaTrustedMark("video") ||
    hasUsablePrimedCommunityMessengerDeviceStream("video") ||
    isCommunityMessengerMediaBrowserGrantedSync("video")
  );
}

/** 음성 통화 — trusted·live primed(voice)·브라우저 granted(캐시) */
export function isVoiceCallMediaReady(): boolean {
  if (typeof window === "undefined") return false;
  return (
    hasCommunityMessengerMediaTrustedMark("voice") ||
    hasUsablePrimedCommunityMessengerDeviceStream("voice") ||
    isCommunityMessengerMediaBrowserGrantedSync("voice")
  );
}

export function isCallMediaReadyForKind(kind: CommunityMessengerCallKind): boolean {
  return kind === "video" ? isVideoCallMediaReady() : isVoiceCallMediaReady();
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
    return { ok: true };
  }
  discardPrimedCommunityMessengerDevicePermission();
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
    markCommunityMessengerMediaTrustedOnce("voice");
    markCommunityMessengerMediaTrustedOnce("video");
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
  discardPrimedCommunityMessengerDevicePermission();
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
  if (kind === "video") {
    return primeVideoCallMediaFromUserGesture({ explicitRetry: true });
  }
  return primeVoiceCallMediaFromUserGesture();
}
