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
import { createCommunityMessengerClientMessageId } from "@/lib/community-messenger/client-message-id";
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
import type { MessageKey } from "@/lib/i18n/messages";
import { pickMessengerApiErrorField } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import {
  classifyMessengerSendFailure,
  messengerUploadFallbackErrorCode,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";
import {
  clearMessengerOutboundFailedSend,
  disposeMessengerOutboundFailedSends,
  markMessengerOutboundRowFailed,
  markMessengerOutboundRowRetrying,
  planMessengerMediaSendFailure,
  registerMessengerOutboundFailedSend,
} from "@/lib/community-messenger/room/messenger-outbound-failed-send";
import { getCommunityMessengerUserMedia } from "@/lib/community-messenger/call-media-stream";
import { isDiBaYMicGateDeferredAbort } from "@/lib/permissions/dibay-mic-gate-messages";

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
  /** C-10: 전송 성공 응답에 message 본문이 없을 때 — 임시 행 제거 후 방 재조회(이미지 경로와 동일) */
  onOutboundMessageBodyMissing?: () => void;
  /** 로그인·전화 인증 필요 시 스낵바 대신 방 공통 리다이렉트 */
  tryRedirectAuthBlocked?: (res: Response, json: { error?: unknown; code?: unknown }) => boolean;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
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
  setRoomMessages,
  scrollMessengerToBottom,
  onOutboundMessageConfirmed,
  onOutboundMessageBodyMissing,
  tryRedirectAuthBlocked,
  t,
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
  /** C-10: 재전송 대기 음성 행 — 언마운트 시 녹음 blob URL 해제 */
  const failedVoiceRowIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = failedVoiceRowIdsRef.current;
    return () => {
      disposeMessengerOutboundFailedSends(ids);
      ids.clear();
    };
  }, []);

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
        // 청크 type 이 비면 실제로 선택된 recorder 형식(mp4 등)을 사용 — webm 오표기 방지
        (rec?.mimeType && rec.mimeType.length > 0 ? rec.mimeType : null) ||
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
        showMessengerSnackbar(t("cm_ui_voice_recording_too_short"), { variant: "error" });
        return;
      }
      if (!snapshot) {
        voiceFinalizingRef.current = false;
        return;
      }

      if (wallDurationSeconds < 0.32) {
        voiceFinalizingRef.current = false;
        showMessengerSnackbar(t("cm_ui_voice_recording_too_short"), { variant: "error" });
        return;
      }

      const roundedDur = Math.max(1, Math.min(600, Math.round(wallDurationSeconds)));
      const blobUrl = URL.createObjectURL(blob);
      // C-2: 텍스트와 동일 — 낙관 행 생성 전에 cid 1개를 만들고 행·multipart 본문에 같은 값을 싣는다.
      const clientMessageId = createCommunityMessengerClientMessageId();
      const tempId = `pending:${apiRoom}:voice:${pendingMessageIdRef.current++}`;
      setRoomMessages((prev) => {
        const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
          id: tempId,
          roomId: apiRoom,
          senderId: snapshot.viewerUserId,
          senderLabel: roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? t("common_me"),
          messageType: "voice",
          content: blobUrl,
          createdAt: nextOptimisticCommunityMessengerCreatedAtIso(prev),
          clientMessageId,
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
      voiceFinalizingRef.current = false;

      let blobUrlReleased = false;
      const releaseBlobUrl = () => {
        if (blobUrlReleased) return;
        blobUrlReleased = true;
        URL.revokeObjectURL(blobUrl);
      };
      const removeRowAndRelease = () => {
        clearMessengerOutboundFailedSend(tempId);
        failedVoiceRowIdsRef.current.delete(tempId);
        setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
        releaseBlobUrl();
      };

      let uploadDurationSeconds = roundedDur;
      let durationMeasured = false;

      /**
       * C-10: 업로드 1회 시도. 실패가 indeterminate(네트워크·5xx·타임아웃)면 녹음 Blob·cid 를 보존한 채
       * 말풍선을 '전송 실패'로 남겨 같은 cid 로 재전송(서버 UNIQUE 멱등). definitive(4xx)면 제거.
       */
      const attemptUpload = async (): Promise<void> => {
        let res: Response | null = null;
        let json: { ok?: boolean; error?: string; code?: string; message?: CommunityMessengerMessage } = {};
        let jsonParsed = true;
        try {
          if (!durationMeasured) {
            durationMeasured = true;
            const measuredSeconds = await measureCommunityMessengerVoiceBlobDurationSecondsWithTimeout(blob);
            const durationSeconds =
              measuredSeconds != null &&
              Number.isFinite(measuredSeconds) &&
              measuredSeconds > 0.04 &&
              Math.abs(measuredSeconds - wallDurationSeconds) < 25
                ? measuredSeconds
                : wallDurationSeconds;
            uploadDurationSeconds = Math.max(1, Math.min(600, Math.round(durationSeconds)));
            if (uploadDurationSeconds !== roundedDur) {
              setRoomMessages((prev) =>
                prev.map((item) => (item.id === tempId ? { ...item, voiceDurationSeconds: uploadDurationSeconds } : item))
              );
            }
          }
          const form = new FormData();
          const fileForUpload = new File([blob], `voice.${ext}`, { type: blobMime });
          form.append("file", fileForUpload);
          // CHAT-05: 업로드 멱등 — 재전송도 같은 clientMessageId(서버 1행 보장).
          form.append("clientMessageId", clientMessageId);
          form.append("durationSeconds", String(uploadDurationSeconds));
          if (waveformPeaks.length > 0) {
            form.append("waveformPeaks", JSON.stringify(waveformPeaks));
          }
          const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
          res = await fetch(`${communityMessengerRoomResourcePath(apiRoom)}/voice`, {
            method: "POST",
            body: form,
          });
          json = (await res.json().catch(() => {
            jsonParsed = false;
            return {};
          })) as typeof json;
          if (res.ok && json.ok) {
            const elapsed =
              typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
            messengerMonitorMessageRtt(apiRoom, elapsed, "voice");
          }
        } catch {
          res = null;
        }
        if (res && res.ok && json.ok) {
          clearMessengerOutboundFailedSend(tempId);
          failedVoiceRowIdsRef.current.delete(tempId);
          const confirmedVoice = json.message;
          if (confirmedVoice?.id) {
            const withCid = confirmedVoice.clientMessageId?.trim()
              ? confirmedVoice
              : { ...confirmedVoice, clientMessageId };
            setRoomMessages((prev) =>
              mergeRoomMessages(
                prev.filter((item) => item.id !== tempId),
                [withCid]
              )
            );
            releaseBlobUrl();
            scrollMessengerToBottom();
            onOutboundMessageConfirmed?.(withCid);
            return;
          }
          // C-10: 응답에 message 가 없으면 blob 을 해제한 임시 행을 확정 처리하지 않는다(유령 말풍선 방지) —
          // 이미지 경로와 동일하게 임시 행 제거 후 재조회로 정합.
          removeRowAndRelease();
          onOutboundMessageBodyMissing?.();
          return;
        }
        if (res && tryRedirectAuthBlocked?.(res, json)) {
          removeRowAndRelease();
          return;
        }
        const failure = res
          ? classifyMessengerSendFailure({ status: res.status, jsonParsed })
          : classifyMessengerSendFailure({ networkError: true });
        showMessengerSnackbar(
          getRoomActionErrorMessage(
            (res && pickMessengerApiErrorField(json)) ||
              (res && jsonParsed ? undefined : messengerUploadFallbackErrorCode(res?.status ?? 0))
          ),
          { variant: "error" }
        );
        if (!planMessengerMediaSendFailure(failure).keepBytesForRetry) {
          removeRowAndRelease();
          return;
        }
        registerMessengerOutboundFailedSend(tempId, {
          retry: () => {
            clearMessengerOutboundFailedSend(tempId);
            setRoomMessages((prev) => markMessengerOutboundRowRetrying(prev, tempId));
            void attemptUpload();
          },
          discard: removeRowAndRelease,
          dispose: releaseBlobUrl,
        });
        failedVoiceRowIdsRef.current.add(tempId);
        setRoomMessages((prev) => markMessengerOutboundRowFailed(prev, tempId));
      };

      try {
        await attemptUpload();
      } finally {
        voiceFinalizingRef.current = false;
      }
    },
    [
      apiRoomId,
      getRoomActionErrorMessage,
      onOutboundMessageConfirmed,
      onOutboundMessageBodyMissing,
      tryRedirectAuthBlocked,
      roomId,
      roomMembersDisplay,
      scrollMessengerToBottom,
      snapshot,
      t,
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
        busy === "delete-message"
      )
        return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      // setPointerCapture: 손가락이 버튼 밖으로 벗어나도 onPointerMove·onPointerUp 이벤트를
      // 이 버튼에서 계속 수신한다. 없으면 slide-to-cancel·lock 제스처가 중도 소실된다.
      // DO NOT: 이 호출을 제거하면 손가락 이탈 후 녹음 종료·취소가 동작하지 않는다.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 일부 환경에서 실패 가능 — 무시하고 진행 */
      }
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
        const stream = await getCommunityMessengerUserMedia({ audio: true });
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
            showMessengerSnackbar(t("cm_ui_voice_recording_start_failed"), {
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
      } catch (err) {
        setVoiceMicArming(false);
        if (session !== voiceSessionIdRef.current) return;
        if (isDiBaYMicGateDeferredAbort(err)) {
          showMessengerSnackbar(getCommunityMessengerPermissionGuide("voice").description, { variant: "error" });
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        showMessengerSnackbar(getCommunityMessengerPermissionGuide("voice").description, { variant: "error" });
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
