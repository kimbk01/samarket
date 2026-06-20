"use client";

import type { IRemoteAudioTrack } from "agora-rtc-sdk-ng";
import { applyAgoraRemoteSpeakerPreference, configureRemoteCallAudioPlayback } from "@/lib/community-messenger/call-provider/agora-playback-routing";
import {
  getNativeCallAudioRoute,
  releaseNativeCallAudioRoute,
  setNativeCallSpeakerphoneEnabled,
  subscribeNativeCallAudioRouteChanged,
  type DibayCallAudioRouteKind,
  type DibayCallAudioRouteResult,
} from "@/lib/community-messenger/native-call-audio-route.client";

export type CallAudioRouteCallType = "audio" | "video";
export type CallAudioRouteRole = "caller" | "callee";

export type CallAudioRouteApplyArgs = {
  callId: string;
  callType: CallAudioRouteCallType;
  role: CallAudioRouteRole;
  desiredSpeaker: boolean;
  reason: string;
  remoteAudioTrack?: IRemoteAudioTrack | null;
};

export type CallAudioRouteApplyResult = DibayCallAudioRouteResult;

const VERIFY_DELAYS_MS = [300, 1000] as const;

/** 원격 오디오 재생 경로 — verify 대기(최대 1.3s) 생략. play 전·후 즉시 라우트만. */
const SKIP_ROUTE_VERIFY_REASON_PREFIXES = [
  "remote_audio_published",
  "remote_audio_post_play_route",
] as const;

function shouldSkipRouteVerify(reason: string): boolean {
  return SKIP_ROUTE_VERIFY_REASON_PREFIXES.some(
    (prefix) => reason === prefix || reason.startsWith(`${prefix}:`)
  );
}

function logCallAudioRoute(event: string, payload: Record<string, unknown>): void {
  console.info(`[call-audio-route] ${event}`, payload);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export function desiredSpeakerForCallType(callType: CallAudioRouteCallType): boolean {
  return callType === "video";
}

export function isExternalAudioRoute(route: DibayCallAudioRouteKind): boolean {
  return route === "bluetooth" || route === "wired";
}

async function applyAgoraPlaybackRoute(args: CallAudioRouteApplyArgs): Promise<void> {
  logCallAudioRoute("agora_default_route_set", {
    callId: args.callId,
    callType: args.callType,
    role: args.role,
    desiredSpeaker: args.desiredSpeaker,
    reason: args.reason,
    api: "web_agora_no_default_route_api",
  });

  if (args.remoteAudioTrack) {
    configureRemoteCallAudioPlayback(
      args.remoteAudioTrack,
      args.callType === "video" ? "video" : "voice"
    );
    await applyAgoraRemoteSpeakerPreference(args.remoteAudioTrack, args.desiredSpeaker);
  }

  logCallAudioRoute("agora_speaker_set", {
    callId: args.callId,
    callType: args.callType,
    role: args.role,
    desiredSpeaker: args.desiredSpeaker,
    reason: args.reason,
    hasRemoteAudioTrack: Boolean(args.remoteAudioTrack),
    api: args.remoteAudioTrack ? "setPlaybackDevice" : "web_agora_no_remote_track_yet",
  });
}

function shouldRetryRoute(
  result: DibayCallAudioRouteResult,
  desiredSpeaker: boolean,
): boolean {
  if (result.externalDeviceConnected) return false;
  if (desiredSpeaker) return result.actualRoute === "earpiece" || result.actualRoute === "unknown";
  return result.actualRoute === "speaker";
}

/**
 * f10345d4 회귀 후보 보존:
 * 해당 커밋은 영상 통화에서 primed GUM 오디오 재사용을 중단하고 fresh Agora mic/camera를 열게 했다.
 * 과거에는 그 부작용으로 일부 WebView/기기에서 speaker 라우트가 유지됐을 수 있으므로,
 * 이제 callType 정책(video=speaker, audio=earpiece)을 명시적으로 seed/reconcile 한다.
 */
export async function applyCallAudioRoute(
  args: CallAudioRouteApplyArgs
): Promise<CallAudioRouteApplyResult> {
  logCallAudioRoute("apply_start", {
    callId: args.callId,
    callType: args.callType,
    role: args.role,
    desiredSpeaker: args.desiredSpeaker,
    reason: args.reason,
    regressionCandidate: "f10345d4",
  });

  await applyAgoraPlaybackRoute(args).catch((error) => {
    console.warn("[call-audio-route] agora_route_apply_failed", {
      callId: args.callId,
      reason: args.reason,
      error,
    });
  });

  let nativeResult = await setNativeCallSpeakerphoneEnabled(
    args.desiredSpeaker,
    args.reason,
    args.callType
  );
  logCallAudioRoute("native_route_result", {
    callId: args.callId,
    callType: args.callType,
    role: args.role,
    desiredSpeaker: args.desiredSpeaker,
    ...nativeResult,
  });

  if (shouldSkipRouteVerify(args.reason)) {
    const current = await getNativeCallAudioRoute();
    if (shouldRetryRoute(current, args.desiredSpeaker)) {
      logCallAudioRoute("route_mismatch_fast_retry", {
        callId: args.callId,
        callType: args.callType,
        role: args.role,
        desiredSpeaker: args.desiredSpeaker,
        actualRoute: current.actualRoute,
        reason: args.reason,
      });
      nativeResult = await setNativeCallSpeakerphoneEnabled(
        args.desiredSpeaker,
        `${args.reason}:fast_retry`,
        args.callType
      );
    } else if (current.actualRoute !== "unknown") {
      nativeResult = current;
    }
  } else {
    for (const delayMs of VERIFY_DELAYS_MS) {
      await wait(delayMs);
      const current = await getNativeCallAudioRoute();
      logCallAudioRoute("verify_after_join", {
        callId: args.callId,
        callType: args.callType,
        role: args.role,
        desiredSpeaker: args.desiredSpeaker,
        delayMs,
        ...current,
      });
      if (!shouldRetryRoute(current, args.desiredSpeaker)) {
        nativeResult = current.actualRoute === "unknown" ? nativeResult : current;
        continue;
      }
      logCallAudioRoute("route_mismatch_retry", {
        callId: args.callId,
        callType: args.callType,
        role: args.role,
        desiredSpeaker: args.desiredSpeaker,
        delayMs,
        actualRoute: current.actualRoute,
        reason: args.reason,
      });
      nativeResult = await setNativeCallSpeakerphoneEnabled(
        args.desiredSpeaker,
        `${args.reason}:verify_${delayMs}`,
        args.callType
      );
    }
  }

  logCallAudioRoute("apply_done", {
    callId: args.callId,
    callType: args.callType,
    role: args.role,
    desiredSpeaker: args.desiredSpeaker,
    ...nativeResult,
  });

  return nativeResult;
}

export { releaseNativeCallAudioRoute, subscribeNativeCallAudioRouteChanged };
