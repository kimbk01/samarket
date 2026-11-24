"use client";

import { useState, useSyncExternalStore } from "react";
import { Play, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { resolveMessengerVideoFields } from "@/lib/community-messenger/messenger-video-message-map";
import { messengerMediaRouteUrlFor } from "@/lib/community-messenger/media/messenger-media-ref";
import {
  messengerPhotoBubbleMaxWidthPx,
  messengerPhotoBubbleSize,
} from "@/lib/community-messenger/media/messenger-photo-bubble-size";
import { formatMessengerVideoDuration } from "@/lib/community-messenger/upload/messenger-video-upload-policy";
import {
  cancelMessengerVideoSend,
  useMessengerVideoSendProgress,
} from "@/lib/community-messenger/upload/messenger-video-send-progress-store";
import { MessengerVideoViewer } from "@/components/community-messenger/room/MessengerVideoViewer";

/**
 * 채팅 영상 말풍선(설계 §3-2) — 썸네일 + ▶ + 길이. 자동재생·자동 다운로드 없음(썸네일만 받는다).
 * 보내는 중: 진행률 원 + ✕(취소). 칸 크기 = 사진 말풍선 규칙(`messengerPhotoBubbleSize`)과 같다.
 */

function subscribeViewportWidth(cb: () => void): () => void {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

export function MessengerChatVideoBubble({
  item,
}: {
  item: CommunityMessengerMessage & { pending?: boolean; sendFailed?: boolean };
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const viewportWidth = useSyncExternalStore(subscribeViewportWidth, () => window.innerWidth, () => 384);
  const { progress, cancellable } = useMessengerVideoSendProgress(item.id);
  const fields = resolveMessengerVideoFields(item);
  if (!fields) return null;

  const size = messengerPhotoBubbleSize({
    photoWidth: fields.videoWidth,
    photoHeight: fields.videoHeight,
    maxWidth: messengerPhotoBubbleMaxWidthPx(viewportWidth),
  });
  const thumbSrc = fields.videoThumbUrl
    ? messengerMediaRouteUrlFor({ roomId: item.roomId, messageId: item.id, src: fields.videoThumbUrl })
    : "";
  const videoSrc = item.content
    ? messengerMediaRouteUrlFor({ roomId: item.roomId, messageId: item.id, src: item.content })
    : "";
  const sending = Boolean(item.pending) && !item.sendFailed && progress != null;
  const canPlay = !item.pending && Boolean(videoSrc);
  const duration = formatMessengerVideoDuration(fields.videoDurationMs);

  return (
    <div className="mx-auto max-w-full" style={{ width: size.width }} data-cm-video-bubble="">
      <div
        className="relative w-full overflow-hidden rounded-[16px] bg-black/80"
        style={{ height: size.height, contain: "layout" }}
      >
        {thumbSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 !h-full !w-full object-cover object-center"
          />
        ) : null}
        {sending ? (
          <button
            type="button"
            disabled={!cancellable}
            onClick={() => cancelMessengerVideoSend(item.id)}
            className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white"
            aria-label={t("cm_ui_video_cancel_send")}
            data-cm-video-send-progress={Math.round((progress ?? 0) * 100)}
          >
            <svg className="absolute inset-0 h-12 w-12 -rotate-90" viewBox="0 0 48 48" aria-hidden>
              <circle cx="24" cy="24" r={RING_R} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
              <circle
                cx="24"
                cy="24"
                r={RING_R}
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - Math.max(0.02, progress ?? 0))}
              />
            </svg>
            <X className="relative h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            disabled={!canPlay}
            onClick={() => setOpen(true)}
            className="absolute inset-0 flex items-center justify-center bg-transparent"
            aria-label={t("cm_ui_video_play")}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
              <Play className="ml-0.5 h-6 w-6 fill-white" strokeWidth={1.5} aria-hidden />
            </span>
          </button>
        )}
        <span
          data-cm-video-duration=""
          className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/45 px-1.5 py-[3px] text-[length:var(--cm-chat-font-meta)] leading-none tabular-nums text-white"
        >
          {duration}
        </span>
      </div>
      {canPlay ? (
        <MessengerVideoViewer open={open} src={videoSrc} poster={thumbSrc || null} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}
