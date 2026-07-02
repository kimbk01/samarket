"use client";

import type { IRemoteVideoTrack } from "agora-rtc-sdk-ng";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  bindAgoraRemoteVideoTrack,
  clearLocalVideoContainer,
} from "@/lib/community-messenger/call-local-video-pipeline";
import {
  publishCallV4LocalVideo,
  readCallV4RemoteVideoTrack,
} from "@/lib/community-messenger/call-v4/call-v4-agora-media";
import { getCallV4AgoraRemoteVideoTrack } from "@/lib/community-messenger/call-v4/call-v4-agora";
import { canAttachCallV4VideoMedia } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { useCallV4MediaStore } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import { isCallV4VideoEnabled } from "@/lib/community-messenger/call-v4/call-v4-phase6-flags";
import { readCallV4Identity, useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import { computeCallV4SelfViewDimensions } from "@/lib/community-messenger/call-v4/call-v4-video-layout";
import { useCallVideoPipGesture } from "@/lib/community-messenger/use-call-video-pip-gesture";

export type CallV4RemoteAttachSkipReason =
  | "phase_not_connected"
  | "wants_video_false"
  | "remote_track_missing"
  | "video_ref_null"
  | "already_attached"
  | "presenter_unmounted"
  | "bind_failed";

export function classifyCallV4RemoteAttachSkip(input: {
  canAttach: boolean;
  wantsVideo: boolean;
  hasRemoteTrack: boolean;
  hasContainer: boolean;
  alreadyAttached: boolean;
}): CallV4RemoteAttachSkipReason | null {
  if (!input.canAttach) return "phase_not_connected";
  if (!input.wantsVideo) return "wants_video_false";
  if (!input.hasRemoteTrack) return "remote_track_missing";
  if (!input.hasContainer) return "video_ref_null";
  if (input.alreadyAttached) return "already_attached";
  return null;
}

export type CallV4VideoPresenterState = {
  mainVideoSlot: ReactNode;
  miniVideoSlot: ReactNode;
  showRemoteVideo: boolean;
  showLocalVideo: boolean;
  pipShellMounted: boolean;
  videoPipLayout: ReturnType<typeof useCallVideoPipGesture>;
  androidOsPipSafeMode: boolean;
  isVideoUiMode: boolean;
  localVideoRef: React.RefObject<HTMLDivElement | null>;
};

export function shouldRenderCallV4SelfPreview(input: {
  cameraEnabled: boolean;
  localVideoReady: boolean;
}): boolean {
  return Boolean(input.cameraEnabled && input.localVideoReady);
}

export function shouldAutoPublishCallV4LocalPreview(input: {
  canAttach: boolean;
  wantsVideo: boolean;
  cameraEnabled: boolean;
}): boolean {
  return Boolean(input.canAttach && input.wantsVideo && input.cameraEnabled);
}

export function shouldMountCallV4SelfPip(input: {
  wantsVideo: boolean;
  cameraEnabled: boolean;
  localVideoReady: boolean;
  androidOsPipSafeMode: boolean;
}): boolean {
  return Boolean(
    input.wantsVideo &&
      !input.androidOsPipSafeMode &&
      shouldRenderCallV4SelfPreview({
        cameraEnabled: input.cameraEnabled,
        localVideoReady: input.localVideoReady,
      }),
  );
}

export function useCallV4VideoPresenter(callId: string, androidOsPipSafeMode = false): CallV4VideoPresenterState {
  const phase = useCallV4Store((s) => s.phase);
  const identity = useCallV4Store((s) => s.identity) ?? readCallV4Identity();
  const media = useCallV4MediaStore();
  const remoteMainVideoRef = useRef<HTMLDivElement | null>(null);
  const remotePipVideoRef = useRef<HTMLDivElement | null>(null);
  const localMainVideoRef = useRef<HTMLDivElement | null>(null);
  const localPipVideoRef = useRef<HTMLDivElement | null>(null);
  const activeLocalVideoRef = useRef<HTMLDivElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const attachedRemoteTrackRef = useRef<IRemoteVideoTrack | null>(null);
  const attachedRemoteContainerRef = useRef<HTMLDivElement | null>(null);
  const remoteVideoRefReadyLoggedRef = useRef(false);
  const localVideoRefReadyLoggedRef = useRef(false);
  const [remoteVideoContainer, setRemoteVideoContainer] = useState<HTMLDivElement | null>(null);
  const [localVideoContainer, setLocalVideoContainer] = useState<HTMLDivElement | null>(null);
  const [selfVideoInMain, setSelfVideoInMain] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(390);

  const videoEnabled = isCallV4VideoEnabled();
  const canAttach = videoEnabled && canAttachCallV4VideoMedia(phase);
  const wantsVideo =
    canAttach &&
    Boolean(identity?.callId === callId && (identity.mediaType === "video" || media.remoteVideoReady || media.localVideoReady));

  const onRemoteMainVideoRef = useCallback((node: HTMLDivElement | null) => {
    remoteMainVideoRef.current = node;
    if (!selfVideoInMain) {
      setRemoteVideoContainer(node);
    }
    if (node && !remoteVideoRefReadyLoggedRef.current) {
      remoteVideoRefReadyLoggedRef.current = true;
      logCallV4("remote_video_ref_ready", { callId, target: "remote_main" });
    }
    if (!node) {
      remoteVideoRefReadyLoggedRef.current = false;
    }
  }, [callId, selfVideoInMain]);

  const onRemotePipVideoRef = useCallback((node: HTMLDivElement | null) => {
    remotePipVideoRef.current = node;
    if (selfVideoInMain) {
      setRemoteVideoContainer(node);
    }
    if (node && !remoteVideoRefReadyLoggedRef.current) {
      remoteVideoRefReadyLoggedRef.current = true;
      logCallV4("remote_video_ref_ready", { callId, target: "remote_pip" });
    }
    if (!node) {
      remoteVideoRefReadyLoggedRef.current = false;
    }
  }, [callId, selfVideoInMain]);

  const onLocalPipVideoRef = useCallback((node: HTMLDivElement | null) => {
    localPipVideoRef.current = node;
    if (!selfVideoInMain) {
      setLocalVideoContainer(node);
    }
    if (node && !localVideoRefReadyLoggedRef.current) {
      localVideoRefReadyLoggedRef.current = true;
      logCallV4("self_video_ref_ready", { callId, target: "self_pip" });
    }
    if (!node) {
      localVideoRefReadyLoggedRef.current = false;
    }
  }, [callId, selfVideoInMain]);

  const onLocalMainVideoRef = useCallback((node: HTMLDivElement | null) => {
    localMainVideoRef.current = node;
    if (selfVideoInMain) {
      setLocalVideoContainer(node);
    }
    if (node && !localVideoRefReadyLoggedRef.current) {
      localVideoRefReadyLoggedRef.current = true;
      logCallV4("self_video_ref_ready", { callId, target: "self_main" });
    }
    if (!node) {
      localVideoRefReadyLoggedRef.current = false;
    }
  }, [callId, selfVideoInMain]);

  useEffect(() => {
    setRemoteVideoContainer(selfVideoInMain ? remotePipVideoRef.current : remoteMainVideoRef.current);
    setLocalVideoContainer(selfVideoInMain ? localMainVideoRef.current : localPipVideoRef.current);
  }, [selfVideoInMain]);

  useEffect(() => {
    const allowAutoPublish = shouldAutoPublishCallV4LocalPreview({
      canAttach,
      wantsVideo,
      cameraEnabled: media.cameraEnabled,
    });
    logCallV4("local_video_autopublish_gate", {
      callId,
      allow: allowAutoPublish,
      canAttach,
      wantsVideo,
      cameraEnabled: media.cameraEnabled,
      localVideoReady: media.localVideoReady,
      identityMediaType: identity?.mediaType ?? null,
      reason: "presenter_effect",
    });
    if (!allowAutoPublish) return;
    void (async () => {
      logCallV4("local_video_autopublish_invoke", {
        callId,
        cameraEnabled: media.cameraEnabled,
        localVideoReady: media.localVideoReady,
        wantsVideo,
        identityMediaType: identity?.mediaType ?? null,
        reason: "presenter_effect",
      });
      await publishCallV4LocalVideo(callId, localVideoContainer);
    })();
  }, [
    callId,
    canAttach,
    identity?.mediaType,
    localVideoContainer,
    media.cameraEnabled,
    media.localVideoReady,
    wantsVideo,
  ]);

  useEffect(() => {
    const remote = getCallV4AgoraRemoteVideoTrack(callId) ?? readCallV4RemoteVideoTrack(callId);
    const hasRemoteTrack = Boolean(remote);
    const hasContainer = Boolean(remoteVideoContainer);
    const alreadyAttached = Boolean(
      remote &&
        attachedRemoteTrackRef.current === remote &&
        attachedRemoteContainerRef.current === remoteVideoContainer,
    );

    if (hasRemoteTrack && remote) {
      logCallV4("remote_track_exists", {
        callId,
        uid: "uid" in remote ? remote.uid : null,
        remoteVideoReady: media.remoteVideoReady,
      });
    }

    const skipReason = classifyCallV4RemoteAttachSkip({
      canAttach,
      wantsVideo,
      hasRemoteTrack,
      hasContainer,
      alreadyAttached,
    });

    if (skipReason) {
      logCallV4("attach_remote_video_skipped", {
        callId,
        reason: skipReason,
        remoteVideoReady: media.remoteVideoReady,
        phase,
        hasContainer,
        hasRemoteTrack,
      });
      return;
    }

    if (!remote || !remoteVideoContainer) return;

    let cancelled = false;
    void (async () => {
      const target = selfVideoInMain ? "remote_pip" : "remote_main";
      logCallV4("attach_remote_video_begin", { callId, target });
      const attached = await bindAgoraRemoteVideoTrack(remote, remoteVideoContainer, {
        fit: "cover",
        mirror: false,
      });
      if (cancelled) {
        logCallV4("attach_remote_video_skipped", { callId, reason: "presenter_unmounted" });
        return;
      }
      if (!attached) {
        logCallV4("attach_remote_video_skipped", { callId, reason: "bind_failed" });
        return;
      }
      attachedRemoteTrackRef.current = remote;
      attachedRemoteContainerRef.current = remoteVideoContainer;
      logCallV4("attach_remote_video_success", { callId, target });
      logCallV4("remote_video_element_attached", { callId, target });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    callId,
    canAttach,
    wantsVideo,
    media.remoteVideoReady,
    remoteVideoContainer,
    selfVideoInMain,
    phase,
  ]);

  const selfPipMounted = shouldMountCallV4SelfPip({
    wantsVideo,
    cameraEnabled: media.cameraEnabled,
    localVideoReady: media.localVideoReady,
    androidOsPipSafeMode,
  });

  useEffect(() => {
    if (!selfPipMounted || !media.remoteVideoReady) {
      setSelfVideoInMain(false);
    }
  }, [media.remoteVideoReady, selfPipMounted]);

  useEffect(() => {
    if (selfPipMounted) return;
    logCallV4("self_video_container_clear_requested", {
      callId,
      hasContainer: Boolean(localVideoContainer),
      reason: "self_preview_hidden",
      cameraEnabled: media.cameraEnabled,
      localVideoReady: media.localVideoReady,
    });
    clearLocalVideoContainer(localVideoContainer);
  }, [callId, localVideoContainer, media.cameraEnabled, media.localVideoReady, selfPipMounted]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setViewportWidth(window.innerWidth);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const selfDims = useMemo(() => computeCallV4SelfViewDimensions(viewportWidth), [viewportWidth]);

  const pipGesture = useCallVideoPipGesture({
    sessionId: callId,
    enabled: selfPipMounted,
    stageRef: videoStageRef,
    stageBottomExtraPx: 80,
    micMuted: !media.micEnabled,
    cameraOff: !media.cameraEnabled,
    pipLabel: selfVideoInMain ? identity?.peerLabel ?? "" : "",
    doubleTapAction: "swap",
    persistSnapPosition: false,
    onSingleTap: () => {
      if (!media.remoteVideoReady) return;
      setSelfVideoInMain((prev) => !prev);
    },
  });

  const videoPipLayout = useMemo(() => {
    if (!pipGesture) return null;
    return {
      ...pipGesture,
      widthPx: selfDims.width,
      heightPx: selfDims.height,
    };
  }, [pipGesture, selfDims.height, selfDims.width]);

  const showRemoteVideo = wantsVideo && media.remoteVideoReady;
  const showLocalVideo = selfPipMounted;
  const isVideoUiMode = wantsVideo && (showRemoteVideo || showLocalVideo);

  activeLocalVideoRef.current = localVideoContainer;

  const mainVideoSlot = wantsVideo ? (
    <div ref={videoStageRef} className="absolute inset-0 min-h-0 bg-[#003D29]">
      {selfVideoInMain ? (
        <div
          ref={onLocalMainVideoRef}
          className="absolute inset-0 z-[1] h-full min-h-0 w-full [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
      ) : (
        <div
          ref={onRemoteMainVideoRef}
          className="absolute inset-0 z-[1] h-full min-h-0 w-full [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
        />
      )}
    </div>
  ) : null;

  const miniVideoSlot = selfPipMounted ? (
    selfVideoInMain ? (
      <div
        ref={onRemotePipVideoRef}
        className="absolute inset-0 h-full w-full [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
      />
    ) : (
      <div
        ref={onLocalPipVideoRef}
        className="absolute inset-0 h-full w-full [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
      />
    )
  ) : null;

  return {
    mainVideoSlot,
    miniVideoSlot,
    showRemoteVideo,
    showLocalVideo,
    pipShellMounted: selfPipMounted,
    videoPipLayout,
    androidOsPipSafeMode,
    isVideoUiMode,
    localVideoRef: activeLocalVideoRef,
  };
}
