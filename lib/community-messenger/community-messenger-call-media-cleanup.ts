import type { IAgoraRTCClient, IRemoteAudioTrack, IRemoteVideoTrack } from "agora-rtc-sdk-ng";
import {
  cleanupCommunityMessengerAgoraCallResources,
  type CommunityMessengerAgoraLocalTracks,
} from "@/lib/community-messenger/call-provider/client";
import { stopCommunityMessengerCallFeedback, stopCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import { suspendSharedNotificationAudioContextBestEffort } from "@/lib/notifications/play-notification-sound";
import { cmCallAudioCleanup } from "@/lib/community-messenger/cm-call-debug";
import { forceKillDetachedCommunityMessengerCallHtmlAudio } from "@/lib/community-messenger/call-feedback-sound";
import { forceCloseEphemeralCallToneWebAudioContexts } from "@/lib/community-messenger/call-tone-web-audio";

declare global {
  interface Window {
    /** Web Audio 공용 인스턴스 — 종료 시 suspend, 닫지 않음(`cm-app-audio-context`) */
    __CM_ACTIVE_AUDIO_CONTEXT__?: AudioContext;
  }
}

function killHtmlMediaElementHard(el: HTMLMediaElement): void {
  try {
    el.pause();

    if (el.srcObject) {
      const so = el.srcObject;
      if (so instanceof MediaStream) {
        so.getTracks().forEach((t) => t.stop());
      }
      el.srcObject = null;
    }

    const sink = el as HTMLMediaElement & { setSinkId?: (sinkId: string) => Promise<void> };
    if (typeof sink.setSinkId === "function") {
      void sink.setSinkId("").catch(() => {});
    }

    el.removeAttribute("src");
    el.load();
  } catch {
    /* */
  }
}

function collectMediaElementsInRoot(root: Document | ShadowRoot): HTMLMediaElement[] {
  const out: HTMLMediaElement[] = [];
  root.querySelectorAll("audio, video").forEach((n) => out.push(n as HTMLMediaElement));
  root.querySelectorAll("*").forEach((node) => {
    if (node instanceof Element && node.shadowRoot) {
      out.push(...collectMediaElementsInRoot(node.shadowRoot));
    }
  });
  return out;
}

/**
 * DOM·shadow root 안의 audio/video + MediaStream 트랙 정리.
 * `new Audio()` 분리 요소는 `forceKillDetachedCommunityMessengerCallHtmlAudio` 로 별도 처리.
 */
function forceKillAllAudioElements(): void {
  if (typeof document === "undefined") return;
  const mediaEls = collectMediaElementsInRoot(document);
  mediaEls.forEach(killHtmlMediaElementHard);
}

function resetNavigatorMediaSessionBestEffort(): void {
  if (typeof navigator === "undefined" || !navigator.mediaSession) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
  } catch {
    /* */
  }
}

/**
 * 통화 종료·실패·페이지 이탈 등 모든 경로에서 동일하게 호출 — 링/링백·Agora·미디어 요소·스피커 라우팅 정리.
 * 동일 세션에 대해 여러 번 호출돼도 안전(추가 호출은 대부분 null 자원에 대한 no-op).
 */
export async function runCommunityMessengerCallMediaCleanup(args: {
  reason: string;
  sessionId?: string | null;
  client: IAgoraRTCClient | null;
  tracks: CommunityMessengerAgoraLocalTracks | null;
  remoteAudioTrack?: IRemoteAudioTrack | null;
  remoteVideoTrack?: IRemoteVideoTrack | null;
  /** Agora·알림 AudioContext 정리 직후 — 예: 스피커 토글 UI 초기화 */
  afterAgora?: () => void;
  /**
   * 통화 **종료 확정** 후에만 전역 DOM audio/video·분리 Audio·ephemeral Web Audio 까지 정리.
   * 조인 실패·페이지 이탈 등에서는 Agora/톤만 정리 — 다른 UI 오디오를 건드리지 않음.
   */
  domAudioNuclear?: boolean;
}): Promise<void> {
  const {
    reason,
    sessionId,
    client,
    tracks,
    remoteAudioTrack,
    remoteVideoTrack,
    afterAgora,
    domAudioNuclear = false,
  } = args;

  stopCommunityMessengerCallTone();
  stopCommunityMessengerCallFeedback();

  const stats = await cleanupCommunityMessengerAgoraCallResources({
    client,
    tracks,
    remoteAudioTrack,
    remoteVideoTrack,
  });

  suspendSharedNotificationAudioContextBestEffort();
  afterAgora?.();

  cmCallAudioCleanup("cleanup_complete", {
    sessionId: sessionId ?? undefined,
    reason,
    localAudioClosed: stats.localAudioClosed,
    localVideoClosed: stats.localVideoClosed,
    remoteTrackCount: stats.remoteTrackCount,
    mediaElementCount: stats.mediaElementCount,
    audioContextState: stats.audioContextState,
    speakerRestored: stats.speakerRestored,
    domAudioNuclear,
  });

  if (domAudioNuclear) {
    forceKillAllAudioElements();
    forceKillDetachedCommunityMessengerCallHtmlAudio();
    forceCloseEphemeralCallToneWebAudioContexts();
    resetNavigatorMediaSessionBestEffort();

    if (typeof window !== "undefined" && window.__CM_ACTIVE_AUDIO_CONTEXT__) {
      try {
        const ctx = window.__CM_ACTIVE_AUDIO_CONTEXT__;
        if (ctx.state !== "closed") void ctx.suspend();
        /** 앱 수명 동안 공용 컨텍스트는 닫지 않음(벨·재생 끊김·스피커 잔류 완화) */
      } catch {
        /* */
      }
    }
  }
}
