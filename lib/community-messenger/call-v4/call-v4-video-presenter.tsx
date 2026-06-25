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
import { MiniLocalVideo } from "@/components/messenger/call/MiniLocalVideo";
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

export function useCallV4VideoPresenter(callId: string, androidOsPipSafeMode = false): CallV4VideoPresenterState {
  const phase = useCallV4Store((s) => s.phase);
  const identity = useCallV4Store((s) => s.identity) ?? readCallV4Identity();
  const media = useCallV4MediaStore();
  const largeVideoRef = useRef<HTMLDivElement | null>(null);
  const smallVideoRef = useRef<HTMLDivElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const attachedRemoteTrackRef = useRef<IRemoteVideoTrack | null>(null);
  const remoteVideoRefReadyLoggedRef = useRef(false);
  const localVideoRefReadyLoggedRef = useRef(false);
  const [remoteVideoContainer, setRemoteVideoContainer] = useState<HTMLDivElement | null>(null);
  const [localVideoContainer, setLocalVideoContainer] = useState<HTMLDivElement | null>(null);
  const [pipExpanded, setPipExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(390);

  const videoEnabled = isCallV4VideoEnabled();
  const canAttach = videoEnabled && canAttachCallV4VideoMedia(phase);
  const wantsVideo =
    canAttach &&
    Boolean(identity?.callId === callId && (identity.mediaType === "video" || media.remoteVideoReady || media.localVideoReady));

  const onLargeVideoRef = useCallback((node: HTMLDivElement | null) => {
    largeVideoRef.current = node;
    setRemoteVideoContainer(node);
    if (node && !remoteVideoRefReadyLoggedRef.current) {
      remoteVideoRefReadyLoggedRef.current = true;
      logCallV4("remote_video_ref_ready", { callId, target: "remote_main" });
    }
    if (!node) {
      remoteVideoRefReadyLoggedRef.current = false;
    }
  }, [callId]);

  const onLocalVideoRef = useCallback((node: HTMLDivElement | null) => {
    smallVideoRef.current = node;
    setLocalVideoContainer(node);
    if (node && !localVideoRefReadyLoggedRef.current) {
      localVideoRefReadyLoggedRef.current = true;
      logCallV4("self_video_ref_ready", { callId, target: "self_pip" });
    }
    if (!node) {
      localVideoRefReadyLoggedRef.current = false;
    }
  }, [callId]);

  useEffect(() => {
    if (!canAttach || !wantsVideo) return;
    void (async () => {
      if (identity?.mediaType === "video" || media.cameraEnabled) {
        await publishCallV4LocalVideo(callId, smallVideoRef.current);
      }
    })();
  }, [callId, canAttach, wantsVideo, identity?.mediaType, media.cameraEnabled]);

  useEffect(() => {
    const remote = getCallV4AgoraRemoteVideoTrack(callId) ?? readCallV4RemoteVideoTrack(callId);
    const hasRemoteTrack = Boolean(remote);
    const hasContainer = Boolean(remoteVideoContainer);
    const alreadyAttached = Boolean(remote && attachedRemoteTrackRef.current === remote);

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
      logCallV4("attach_remote_video_begin", { callId, target: "remote_main" });
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
      logCallV4("attach_remote_video_success", { callId, target: "remote_main" });
      logCallV4("remote_video_element_attached", { callId, target: "remote_main" });
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
    phase,
  ]);

  const showLocalPreview = shouldRenderCallV4SelfPreview({
    cameraEnabled: media.cameraEnabled,
    localVideoReady: media.localVideoReady,
  });

  useEffect(() => {
    if (showLocalPreview) return;
    clearLocalVideoContainer(localVideoContainer);
  }, [localVideoContainer, showLocalPreview]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setViewportWidth(window.innerWidth);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const selfDims = useMemo(
    () => computeCallV4SelfViewDimensions(viewportWidth, pipExpanded),
    [pipExpanded, viewportWidth],
  );

  const pipGesture = useCallVideoPipGesture({
    sessionId: callId,
    enabled: wantsVideo && !androidOsPipSafeMode,
    stageRef: videoStageRef,
    stageBottomExtraPx: 80,
    micMuted: !media.micEnabled,
    cameraOff: !media.cameraEnabled,
    pipLabel: identity?.peerLabel ?? "",
    doubleTapAction: "zoom",
    onSingleTap: () => setPipExpanded((prev) => !prev),
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
  const showLocalVideo = wantsVideo && showLocalPreview;
  const isVideoUiMode = wantsVideo && (showRemoteVideo || showLocalVideo);

  const mainVideoSlot = wantsVideo ? (
    <div ref={videoStageRef} className="absolute inset-0 min-h-0 bg-[#003D29]">
      <div
        ref={onLargeVideoRef}
        className="absolute inset-0 z-[1] h-full min-h-0 w-full [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
      />
    </div>
  ) : null;

  const miniVideoSlot = wantsVideo && showLocalPreview ? (
    <MiniLocalVideo
      ref={onLocalVideoRef}
      widthPx={videoPipLayout?.widthPx}
      heightPx={videoPipLayout?.heightPx}
      useAnchoredPosition={Boolean(videoPipLayout?.pipStyle)}
      positionMode={videoPipLayout?.positionMode}
      style={videoPipLayout?.pipStyle ?? undefined}
      micMuted={!media.micEnabled}
      cameraOff={!media.cameraEnabled}
      label={videoPipLayout?.pipLabel}
      onPointerDown={videoPipLayout?.onPipPointerDown}
      onPointerMove={videoPipLayout?.onPipPointerMove}
      onPointerUp={videoPipLayout?.onPipPointerUp}
      onPointerCancel={videoPipLayout?.onPipPointerCancel}
    />
  ) : null;

  return {
    mainVideoSlot,
    miniVideoSlot,
    showRemoteVideo,
    showLocalVideo,
    pipShellMounted: wantsVideo,
    videoPipLayout,
    androidOsPipSafeMode,
    isVideoUiMode,
    localVideoRef: smallVideoRef,
  };
}
