"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  mergeRoomMessages,
  nextOptimisticCommunityMessengerCreatedAtIso,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { getCommunityMessengerPermissionGuide } from "@/lib/community-messenger/call-permission";
import { messengerMonitorMessageRtt } from "@/lib/community-messenger/monitoring/client";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type {
  CommunityMessengerMessage,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import {
  COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS,
  downsampleVoiceWaveformPeaks,
} from "@/lib/community-messenger/voice-waveform";
import { measureCommunityMessengerVoiceBlobDurationSecondsWithTimeout } from "@/lib/community-messenger/measure-voice-blob-duration";
import { pickCommunityMessengerVoiceRecorderMime } from "@/lib/community-messenger/voice-recording";
import { pickMessengerApiErrorField } from "@/lib/community-messenger/room/messenger-room-action-error-messages";

export type UseMessengerRoomVoiceRecordingParams = {
  roomId: string;
  /** POST `/voice` 등 API 경로 — 생략 시 `roomId` (원장 `snapshot.room.id` 와 라우트 id 가 다를 때) */
  apiRoomId?: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  roomMembersDisplay: CommunityMessengerProfileLite[];
  roomUnavailable: boolean;
  message: string;
  busy: string | null;
  pendingMessageIdRef: MutableRefObject<number>;
  getRoomActionErrorMessage: (error?: string) => string;
  setBusy: Dispatch<SetStateAction<string | null>>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  scrollMessengerToBottom: () => void;
  /** 음성 전송 확정 시 텍스트·스티커와 동일하게 홈 목록·허브 뱃지 동기화 */
  onOutboundMessageConfirmed?: (message: CommunityMessengerMessage) => void;
};

/**
 * 커뮤니티 메신저 방 음성 메시지 녹음·제스처·업로드 — `CommunityMessengerRoomClient` 에서 분리한 동일 동작.
 */
export function useMessengerRoomVoiceRecording({
  roomId,
  apiRoomId,
  snapshot,
  roomMembersDisplay,
  roomUnavailable,
  message,
  busy,
  pendingMessageIdRef,
  getRoomActionErrorMessage,
  setBusy,
  setRoomMessages,
  scrollMessengerToBottom,
  onOutboundMessageConfirmed,
}: UseMessengerRoomVoiceRecordingParams) {
  const apiRoom = (apiRoomId?.trim() || roomId.trim()).trim();
  const voiceFinalizingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordStartMsRef = useRef(0);
  const recordStartPerfRef = useRef(0);
  const voicePointerOriginXRef = useRef(0);
  const voicePointerOriginYRef = useRef(0);
  const voiceHasLockedGestureRef = useRef(false);
  const voiceCancelledRef = useRef(false);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceWaveformSamplesRef = useRef<number[]>([]);
  const voiceSampleRafRef = useRef<number | null>(null);
  const voiceMimeRef = useRef<{ mimeType: string; fileExtension: string } | null>(null);
  const voiceUiRafRef = useRef<number | null>(null);
  const voiceMaxTimerRef = useRef<number | null>(null);
  const voiceSessionIdRef = useRef(0);
  const voicePointerDownRef = useRef(false);

  const [voiceRecording, setVoiceRecording] = useState(false);
  /** 마이크 권한·스트림 준비 중(녹음 시작 전) — UI 리플 표시용 */
  const [voiceMicArming, setVoiceMicArming] = useState(false);
  const [voiceHandsFree, setVoiceHandsFree] = useState(false);
  const [voiceRecordElapsedMs, setVoiceRecordElapsedMs] = useState(0);
  const [voiceLivePreviewBars, setVoiceLivePreviewBars] = useState<number[]>([]);
  const [voiceCancelHint, setVoiceCancelHint] = useState(false);
  const [voiceLockHint, setVoiceLockHint] = useState(false);

  const finalizeVoiceRecording = useCallback(
    async (shouldUpload: boolean) => {
      if (voiceFinalizingRef.current) return;
      voiceFinalizingRef.current = true;
      setVoiceMicArming(false);
      setVoiceHandsFree(false);
      setVoiceLockHint(false);
      voiceHasLockedGestureRef.current = false;
      if (voiceSampleRafRef.current != null) {
        cancelAnimationFrame(voiceSampleRafRef.current);
        voiceSampleRafRef.current = null;
      }
      const waveformSnapshot = [...voiceWaveformSamplesRef.current];
      voiceWaveformSamplesRef.current = [];
      voiceAnalyserRef.current = null;
      void voiceAudioContextRef.current?.close().catch(() => {});
      voiceAudioContextRef.current = null;

      if (voiceUiRafRef.current != null) {
        cancelAnimationFrame(voiceUiRafRef.current);
        voiceUiRafRef.current = null;
      }
      if (voiceMaxTimerRef.current) {
        clearTimeout(voiceMaxTimerRef.current);
        voiceMaxTimerRef.current = null;
      }
      const rec = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      const stream = recordStreamRef.current;
      const startedAt = recordStartMsRef.current;
      setVoiceRecording(false);
      setVoiceCancelHint(false);
      setVoiceRecordElapsedMs(0);
      setVoiceLivePreviewBars([]);

      if (rec && rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          rec.addEventListener("stop", () => resolve(), { once: true });
          try {
            rec.stop();
          } catch {
            resolve();
          }
        });
      }
      stream?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;

      const chunks = [...mediaChunksRef.current];
      mediaChunksRef.current = [];
      const wallDurationSeconds =
        recordStartPerfRef.current > 0 ? (performance.now() - recordStartPerfRef.current) / 1000 : startedAt
          ? (Date.now() - startedAt) / 1000
          : 0;

      if (!shouldUpload) {
        voiceFinalizingRef.current = false;
        return;
      }

      const waveformPeaks =
        waveformSnapshot.length > 0
          ? downsampleVoiceWaveformPeaks(waveformSnapshot, COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS)
          : [];

      const blobMime =
        (chunks[0] && chunks[0].type && chunks[0].type.length > 0 ? chunks[0].type : null) ||
        voiceMimeRef.current?.mimeType ||
        "audio/webm";
      const ext =
        blobMime.includes("mp4") || blobMime.includes("m4a")
          ? "m4a"
          : blobMime.includes("ogg")
            ? "ogg"
            : "webm";
      const blob = new Blob(chunks, { type: blobMime });
      if (blob.size < 400) {
        voiceFinalizingRef.current = false;
        showMessengerSnackbar("녹음이 너무 짧습니다.", { variant: "error" });
        return;
      }
      if (!snapshot) {
        voiceFinalizingRef.current = false;
        return;
      }

      const measuredSeconds = await measureCommunityMessengerVoiceBlobDurationSecondsWithTimeout(blob);
      const durationSeconds =
        measuredSeconds != null &&
        Number.isFinite(measuredSeconds) &&
        measuredSeconds > 0.04 &&
        Math.abs(measuredSeconds - wallDurationSeconds) < 25
          ? measuredSeconds
          : wallDurationSeconds;

      if (durationSeconds < 0.32) {
        voiceFinalizingRef.current = false;
        showMessengerSnackbar("녹음이 너무 짧습니다.", { variant: "error" });
        return;
      }

      const roundedDur = Math.max(1, Math.min(600, Math.round(durationSeconds)));
      const blobUrl = URL.createObjectURL(blob);
      const tempId = `pending:${apiRoom}:voice:${pendingMessageIdRef.current++}`;
      setRoomMessages((prev) => {
        const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
          id: tempId,
          roomId: apiRoom,
          senderId: snapshot.viewerUserId,
          senderLabel: roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
          messageType: "voice",
          content: blobUrl,
          createdAt: nextOptimisticCommunityMessengerCreatedAtIso(prev),
          isMine: true,
          pending: true,
          callKind: null,
          callStatus: null,
          voiceDurationSeconds: roundedDur,
          voiceMimeType: blobMime,
          ...(waveformPeaks.length > 0 ? { voiceWaveformPeaks: waveformPeaks } : {}),
        };
        return mergeRoomMessages(prev, [optimisticMessage]);
      });
      scrollMessengerToBottom();
      setBusy("send-voice");
      try {
        const form = new FormData();
        const fileForUpload = new File([blob], `voice.${ext}`, { type: blobMime });
        form.append("file", fileForUpload);
        form.append("durationSeconds", String(roundedDur));
        if (waveformPeaks.length > 0) {
          form.append("waveformPeaks", JSON.stringify(waveformPeaks));
        }
        const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetch(`${communityMessengerRoomResourcePath(apiRoom)}/voice`, {
          method: "POST",
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok) {
          const elapsed =
            typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
          messengerMonitorMessageRtt(apiRoom, elapsed, "voice");
        }
        if (!res.ok || !json.ok) {
          URL.revokeObjectURL(blobUrl);
          setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        const confirmedVoice = json.message;
        if (confirmedVoice) {
          URL.revokeObjectURL(blobUrl);
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [confirmedVoice]
            )
          );
          scrollMessengerToBottom();
          onOutboundMessageConfirmed?.(confirmedVoice);
          return;
        }
        URL.revokeObjectURL(blobUrl);
        setRoomMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, pending: false } : item)));
      } finally {
        setBusy(null);
        voiceFinalizingRef.current = false;
      }
    },
    [
      apiRoomId,
      getRoomActionErrorMessage,
      onOutboundMessageConfirmed,
      roomId,
      roomMembersDisplay,
      scrollMessengerToBottom,
      snapshot,
    ]
  );

  const abortVoiceArmOnly = useCallback(() => {
    voicePointerDownRef.current = false;
    setVoiceMicArming(false);
    if (voiceUiRafRef.current != null) {
      cancelAnimationFrame(voiceUiRafRef.current);
      voiceUiRafRef.current = null;
    }
    voiceSessionIdRef.current += 1;
    setVoiceHandsFree(false);
    setVoiceLockHint(false);
    voiceHasLockedGestureRef.current = false;
    if (voiceSampleRafRef.current != null) {
      cancelAnimationFrame(voiceSampleRafRef.current);
      voiceSampleRafRef.current = null;
    }
    voiceWaveformSamplesRef.current = [];
    voiceAnalyserRef.current = null;
    void voiceAudioContextRef.current?.close().catch(() => {});
    voiceAudioContextRef.current = null;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordStreamRef.current = null;
    setVoiceRecording(false);
    setVoiceCancelHint(false);
    setVoiceRecordElapsedMs(0);
    setVoiceLivePreviewBars([]);
  }, []);

  const onVoiceMicPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (
        roomUnavailable ||
        !snapshot ||
        message.trim() ||
        busy === "send" ||
        busy === "send-voice" ||
        busy === "delete-message"
      )
        return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const session = ++voiceSessionIdRef.current;
      setVoiceMicArming(true);
      voicePointerDownRef.current = true;
      voiceCancelledRef.current = false;
      voiceHasLockedGestureRef.current = false;
      voicePointerOriginXRef.current = e.clientX;
      voicePointerOriginYRef.current = e.clientY;
      setVoiceCancelHint(false);
      setVoiceLockHint(false);
      setVoiceHandsFree(false);

      const picked = pickCommunityMessengerVoiceRecorderMime();
      voiceMimeRef.current = picked;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (session !== voiceSessionIdRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          setVoiceMicArming(false);
          return;
        }
        if (!voicePointerDownRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          setVoiceMicArming(false);
          return;
        }

        const rec = picked.mimeType
          ? new MediaRecorder(stream, { mimeType: picked.mimeType })
          : new MediaRecorder(stream);
        mediaChunksRef.current = [];
        rec.ondataavailable = (ev) => {
          if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
        };

        mediaRecorderRef.current = rec;
        recordStreamRef.current = stream;
        try {
          rec.start(200);
        } catch {
          mediaRecorderRef.current = null;
          recordStreamRef.current = null;
          stream.getTracks().forEach((t) => t.stop());
          if (session === voiceSessionIdRef.current) {
            showMessengerSnackbar("녹음을 시작하지 못했습니다. 다른 앱에서 마이크를 쓰는지 확인해 주세요.", {
              variant: "error",
            });
          }
          setVoiceMicArming(false);
          return;
        }

        if (session !== voiceSessionIdRef.current || !voicePointerDownRef.current) {
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          stream.getTracks().forEach((t) => t.stop());
          mediaRecorderRef.current = null;
          recordStreamRef.current = null;
          setVoiceMicArming(false);
          return;
        }

        recordStartMsRef.current = Date.now();
        recordStartPerfRef.current = performance.now();
        setVoiceMicArming(false);
        setVoiceRecording(true);
        setVoiceRecordElapsedMs(0);
        setVoiceLivePreviewBars([]);
        voiceWaveformSamplesRef.current = [];
        if (voiceSampleRafRef.current != null) {
          cancelAnimationFrame(voiceSampleRafRef.current);
          voiceSampleRafRef.current = null;
        }
        void voiceAudioContextRef.current?.close().catch(() => {});
        voiceAudioContextRef.current = null;
        voiceAnalyserRef.current = null;
        try {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AC();
          voiceAudioContextRef.current = ctx;
          const srcNode = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.42;
          srcNode.connect(analyser);
          voiceAnalyserRef.current = analyser;
          const tick = () => {
            if (session !== voiceSessionIdRef.current || !voiceAnalyserRef.current) return;
            const a = voiceAnalyserRef.current;
            const buf = new Uint8Array(a.frequencyBinCount);
            a.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = (buf[i]! - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            voiceWaveformSamplesRef.current.push(Math.min(1, rms * 5.5));
            voiceSampleRafRef.current = requestAnimationFrame(tick);
          };
          void ctx.resume().then(() => {
            if (session === voiceSessionIdRef.current && voiceAnalyserRef.current) {
              voiceSampleRafRef.current = requestAnimationFrame(tick);
            }
          });
        } catch {
          /* 파형 미터는 선택 사항 */
        }
        if (voiceUiRafRef.current != null) cancelAnimationFrame(voiceUiRafRef.current);
        const uiSession = voiceSessionIdRef.current;
        const loopVoiceRecordingUi = () => {
          if (voiceSessionIdRef.current !== uiSession || !mediaRecorderRef.current) return;
          setVoiceRecordElapsedMs(performance.now() - recordStartPerfRef.current);
          const snap = voiceWaveformSamplesRef.current;
          if (snap.length > 0) {
            setVoiceLivePreviewBars(downsampleVoiceWaveformPeaks([...snap], 36));
          } else {
            setVoiceLivePreviewBars([]);
          }
          voiceUiRafRef.current = requestAnimationFrame(loopVoiceRecordingUi);
        };
        voiceUiRafRef.current = requestAnimationFrame(loopVoiceRecordingUi);
        if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
        voiceMaxTimerRef.current = window.setTimeout(() => {
          void finalizeVoiceRecording(true);
        }, 120_000);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      } catch {
        setVoiceMicArming(false);
        if (session === voiceSessionIdRef.current) {
          showMessengerSnackbar(
            getCommunityMessengerPermissionGuide("voice")?.description ??
              "마이크 권한을 허용한 뒤 다시 시도해 주세요.",
            { variant: "error" }
          );
        }
      }
    },
    [busy, finalizeVoiceRecording, message, roomUnavailable, snapshot]
  );

  const onVoiceMicPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!mediaRecorderRef.current || voiceHandsFree) return;
      const ox = voicePointerOriginXRef.current;
      const oy = voicePointerOriginYRef.current;
      const dx = e.clientX - ox;
      const dy = e.clientY - oy;
      if (dx < -52) {
        voiceHasLockedGestureRef.current = false;
        voiceCancelledRef.current = true;
        setVoiceCancelHint(true);
        setVoiceLockHint(false);
        return;
      }
      if (dy < -58) {
        voiceHasLockedGestureRef.current = true;
        voiceCancelledRef.current = false;
        setVoiceLockHint(true);
        setVoiceCancelHint(false);
        return;
      }
      voiceCancelledRef.current = false;
      setVoiceCancelHint(false);
      if (!voiceHasLockedGestureRef.current) setVoiceLockHint(false);
    },
    [voiceHandsFree]
  );

  const onVoiceMicPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      voicePointerDownRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        if (voiceHasLockedGestureRef.current && !voiceCancelledRef.current) {
          setVoiceHandsFree(true);
          voiceHasLockedGestureRef.current = false;
          setVoiceCancelHint(false);
          setVoiceLockHint(false);
          return;
        }
        void finalizeVoiceRecording(!voiceCancelledRef.current);
        return;
      }
      abortVoiceArmOnly();
    },
    [abortVoiceArmOnly, finalizeVoiceRecording]
  );

  const onVoiceMicPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      voicePointerDownRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        void finalizeVoiceRecording(false);
        return;
      }
      abortVoiceArmOnly();
    },
    [abortVoiceArmOnly, finalizeVoiceRecording]
  );

  useEffect(() => {
    return () => {
      if (voiceUiRafRef.current != null) {
        cancelAnimationFrame(voiceUiRafRef.current);
        voiceUiRafRef.current = null;
      }
      if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
      if (voiceSampleRafRef.current != null) cancelAnimationFrame(voiceSampleRafRef.current);
      void voiceAudioContextRef.current?.close().catch(() => {});
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    voiceMicArming,
    voiceRecording,
    voiceHandsFree,
    voiceRecordElapsedMs,
    voiceLivePreviewBars,
    voiceCancelHint,
    voiceLockHint,
    finalizeVoiceRecording,
    abortVoiceArmOnly,
    onVoiceMicPointerDown,
    onVoiceMicPointerMove,
    onVoiceMicPointerUp,
    onVoiceMicPointerCancel,
  };
}
