"use client";

import { memo } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  FileIcon,
  formatFileMeta,
  VideoCallIcon,
  VoiceCallIcon,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { MessengerChatImageBubble } from "@/components/community-messenger/room/MessengerChatImageBubble";
import { VoiceMessageBubble } from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";

export type TimelineViberBubbleMessage = CommunityMessengerMessage & { pending?: boolean };

export const TimelineViberInnerImage = memo(function TimelineViberInnerImage({
  item,
  onOpenLightbox,
}: {
  item: TimelineViberBubbleMessage;
  onOpenLightbox: (urls: string[], originals: string[], index: number) => void;
}) {
  return <MessengerChatImageBubble item={item} onOpenLightbox={onOpenLightbox} />;
});

export const TimelineViberInnerSticker = memo(function TimelineViberInnerSticker({
  item,
}: {
  item: TimelineViberBubbleMessage;
}) {
  const stickerSrc = item.content.trim();
  return (
    <div className="flex flex-col items-stretch p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={stickerSrc}
        alt=""
        width={160}
        height={160}
        loading="lazy"
        decoding="async"
        className="h-36 w-36 max-h-[9.5rem] max-w-[9.5rem] object-contain sm:h-40 sm:w-40 sm:max-h-[10rem] sm:max-w-[10rem]"
      />
      {item.pending ? (
        <span className="mt-1 sam-text-xxs text-sam-muted">전송 중…</span>
      ) : null}
    </div>
  );
});

export const TimelineViberInnerVoice = memo(function TimelineViberInnerVoice({
  item,
  streamRoomId,
}: {
  item: TimelineViberBubbleMessage;
  streamRoomId: string;
}) {
  return (
    <VoiceMessageBubble
      src={communityMessengerVoiceAudioSrc(streamRoomId, item)}
      durationSeconds={item.voiceDurationSeconds ?? 0}
      isMine={item.isMine}
      pending={item.pending}
      waveformPeaks={item.voiceWaveformPeaks ?? null}
      sentTimeLabel={undefined}
      mineBubbleStyle={item.isMine ? "viberLight" : "signature"}
      fallbackSrc={
        item.pending ? null : /^https?:\/\//i.test(item.content.trim()) ? item.content.trim() : null
      }
      mediaType={item.voiceMimeType ?? null}
    />
  );
});

export const TimelineViberInnerFile = memo(function TimelineViberInnerFile({
  item,
  mediaAutoSaveEnabled,
}: {
  item: TimelineViberBubbleMessage;
  mediaAutoSaveEnabled: boolean;
}) {
  return (
    <div className="min-w-[200px]">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
            item.isMine ? "bg-sam-surface/55 text-sam-fg" : "bg-sam-surface-muted text-sam-fg"
          }`}
        >
          <FileIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-semibold ${item.isMine ? "text-sam-fg" : "text-[color:var(--cm-room-text)]"}`}>
            {item.fileName?.trim() || "첨부 파일"}
          </p>
          <p className={`mt-1 sam-text-helper ${item.isMine ? "text-sam-muted" : "text-[color:var(--cm-room-text-muted)]"}`}>
            {formatFileMeta(item.fileMimeType, item.fileSizeBytes)}
          </p>
        </div>
      </div>
      <div className="mt-3">
        {item.pending ? (
          <span className={`sam-text-helper ${item.isMine ? "text-sam-muted" : "text-sam-muted"}`}>업로드 중…</span>
        ) : item.content.trim() ? (
          <a
            href={item.content.trim()}
            target="_blank"
            rel="noopener noreferrer"
            download={mediaAutoSaveEnabled ? item.fileName?.trim() || "community-messenger-file" : undefined}
            className={`inline-flex rounded-[10px] border px-3 py-1.5 sam-text-helper font-semibold ${
              item.isMine
                ? "border-sam-primary-border bg-sam-surface/70 text-sam-fg"
                : "border-[color:var(--cm-room-divider)] bg-sam-surface text-[color:var(--cm-room-text)]"
            }`}
          >
            {mediaAutoSaveEnabled ? "파일 저장" : "파일 열기"}
          </a>
        ) : null}
      </div>
    </div>
  );
});

export const TimelineViberInnerCallStub = memo(function TimelineViberInnerCallStub({
  item,
  stubBusy,
  onOpenOutgoingConfirm,
  voiceCallLabel,
  videoCallLabel,
  callStatusLabel,
}: {
  item: TimelineViberBubbleMessage;
  stubBusy: boolean;
  onOpenOutgoingConfirm: (kind: "voice" | "video") => void;
  voiceCallLabel: string;
  videoCallLabel: string;
  callStatusLabel: string;
}) {
  const kind: "voice" | "video" = item.callKind === "video" ? "video" : "voice";
  const CallGlyph = item.callKind === "video" ? VideoCallIcon : VoiceCallIcon;
  return (
    <button
      type="button"
      disabled={stubBusy}
      onClick={(e) => {
        e.stopPropagation();
        onOpenOutgoingConfirm(kind);
      }}
      className="flex w-full max-w-full items-center gap-2 rounded-[12px] py-0.5 text-left transition active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          item.isMine ? "bg-sam-surface/55 text-sam-fg" : "bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)]"
        }`}
        aria-hidden
      >
        <CallGlyph className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <span
            className={`sam-text-body font-semibold leading-snug ${
              item.isMine ? "text-sam-fg" : "text-[color:var(--cm-room-text)]"
            }`}
          >
            {item.callKind === "video" ? videoCallLabel : voiceCallLabel}
          </span>
          <span
            className={`sam-text-xxs font-medium leading-snug ${
              item.isMine ? "text-sam-muted" : "text-[color:var(--cm-room-text-muted)]"
            }`}
          >
            {callStatusLabel}
          </span>
        </div>
      </div>
    </button>
  );
});

export const TimelineViberInnerTextDefault = memo(function TimelineViberInnerTextDefault({
  item,
  linkPreviewEnabled,
  sendingLabel,
}: {
  item: TimelineViberBubbleMessage;
  linkPreviewEnabled: boolean;
  sendingLabel: string;
}) {
  const mineLight = item.isMine;
  return (
    <div className="flex w-max max-w-full flex-col gap-2">
      <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
        <p
          className={`inline-block w-fit max-w-full sam-text-body leading-snug break-keep [overflow-wrap:break-word] ${
            mineLight ? "text-sam-fg" : "text-[color:var(--cm-room-text)]"
          }`}
        >
          {item.content}
        </p>
        {item.pending ? (
          <span
            className={`shrink-0 sam-text-xxs ${mineLight ? "text-sam-muted" : "text-[color:var(--cm-room-text-muted)]"}`}
          >
            {sendingLabel}
          </span>
        ) : null}
      </div>
      {linkPreviewEnabled && extractHttpUrls(item.content).length ? (
        <div className="flex flex-wrap gap-1.5">
          {extractHttpUrls(item.content)
            .slice(0, 2)
            .map((url) => (
              <a
                key={`${item.id}:${url}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex max-w-[220px] truncate rounded-[10px] border px-2.5 py-1 sam-text-xxs ${
                  mineLight
                    ? "border-sam-primary-border bg-sam-surface/70 text-sam-fg"
                    : "border-[color:var(--cm-room-divider)] bg-sam-surface text-[color:var(--cm-room-text-muted)]"
                }`}
              >
                {url.replace(/^https?:\/\//i, "")}
              </a>
            ))}
        </div>
      ) : null}
    </div>
  );
});
