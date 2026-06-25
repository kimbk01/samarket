"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MiniLocalVideo } from "@/components/messenger/call/MiniLocalVideo";
import { bindAgoraRemoteVideoTrack } from "@/lib/community-messenger/call-local-video-pipeline";
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

export function useCallV4VideoPresenter(callId: string, androidOsPipSafeMode = false): CallV4VideoPresenterState {
  const phase = useCallV4Store((s) => s.phase);
  const identity = useCallV4Store((s) => s.identity) ?? readCallV4Identity();
  const media = useCallV4MediaStore();
  const largeVideoRef = useRef<HTMLDivElement | null>(null);
  const smallVideoRef = useRef<HTMLDivElement | null>(null);
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const [pipExpanded, setPipExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(390);

  const videoEnabled = isCallV4VideoEnabled();
  const canAttach = videoEnabled && canAttachCallV4VideoMedia(phase);
  const wantsVideo =
    canAttach &&
    Boolean(identity?.callId === callId && (identity.mediaType === "video" || media.remoteVideoReady || media.localVideoReady));

  useEffect(() => {
    if (!canAttach || !wantsVideo) return;
    let cancelled = false;
    void (async () => {
      if (identity?.mediaType === "video" || media.cameraEnabled) {
        await publishCallV4LocalVideo(callId, smallVideoRef.current);
      }
      const remote = getCallV4AgoraRemoteVideoTrack(callId) ?? readCallV4RemoteVideoTrack(callId);
      if (!cancelled && remote && largeVideoRef.current) {
        const attached = await bindAgoraRemoteVideoTrack(remote, largeVideoRef.current, {
          fit: "cover",
          mirror: false,
        });
        if (!cancelled && attached) {
          logCallV4("remote_video_element_attached", { callId, target: "remote_main" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callId, canAttach, wantsVideo, identity?.mediaType, media.cameraEnabled]);

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
  const showLocalVideo = wantsVideo && media.localVideoReady && media.cameraEnabled;
  const isVideoUiMode = wantsVideo && (showRemoteVideo || showLocalVideo);

  const mainVideoSlot = wantsVideo ? (
    <div ref={videoStageRef} className="absolute inset-0 min-h-0 bg-[#003D29]">
      <div
        ref={largeVideoRef}
        className="absolute inset-0 z-[1] h-full min-h-0 w-full [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
      />
    </div>
  ) : null;

  const miniVideoSlot = wantsVideo ? (
    <MiniLocalVideo
      ref={smallVideoRef}
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
