"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  attachPreJoinHtmlVideo,
  detachPreJoinHtmlVideo,
  primeVideoElementAutoplayFromUserGesture,
} from "@/lib/community-messenger/call-local-video-pipeline";
import {
  hasLiveCommunityMessengerVideoPreviewStream,
} from "@/lib/community-messenger/call-prejoin-video-preview";
import { peekPrimedCommunityMessengerDeviceStream } from "@/lib/community-messenger/call-permission";

type OutgoingRingCameraPreviewProps = {
  stream?: MediaStream | null;
};

/**
 * 발신 ringing 단계 전용 — getUserMedia 프라임 스트림만 표시 (Agora 금지).
 */
export function OutgoingRingCameraPreview({ stream }: OutgoingRingCameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    setReady(false);
    const active =
      stream && hasLiveCommunityMessengerVideoPreviewStream(stream)
        ? stream
        : peekPrimedCommunityMessengerDeviceStream("video");
    if (!hasLiveCommunityMessengerVideoPreviewStream(active)) {
      detachPreJoinHtmlVideo(el);
      return;
    }
    primeVideoElementAutoplayFromUserGesture(active);
    let cancelled = false;
    void attachPreJoinHtmlVideo(el, active).then((ok) => {
      if (!cancelled) setReady(ok);
    });
    return () => {
      cancelled = true;
      detachPreJoinHtmlVideo(el);
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={`absolute inset-0 z-[2] h-full w-full object-cover transition-opacity duration-100 ${
        ready ? "opacity-100" : "opacity-0"
      }`}
      muted
      playsInline
      autoPlay
      controls={false}
      disablePictureInPicture
      disableRemotePlayback
    />
  );
}
