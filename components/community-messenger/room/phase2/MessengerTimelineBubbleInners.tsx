"use client";

import { memo } from "react";
import { FileText } from "lucide-react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  formatFileMeta,
  VideoCallIcon,
  VoiceCallIcon,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { MessengerChatImageBubble } from "@/components/community-messenger/room/MessengerChatImageBubble";
import { VoiceMessageBubble } from "@/components/community-messenger/room/community-messenger-room-phase2-lazy";
import { GroupMentionText } from "@/components/community-messenger/group/GroupMentionText";

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
  const { t } = useI18n();
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
        <span className="mt-1 sam-text-xxs text-sam-muted">{t("common_sending")}</span>
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
  const { t } = useI18n();
  return (
    <div className="min-w-[200px] max-w-full">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
            item.isMine ? "bg-white/20 text-white" : "bg-[#dbeafe] text-[#1f2937]"
          }`}
        >
          <FileText className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[14px] font-semibold leading-snug ${item.isMine ? "text-white" : "text-[#050505]"}`}>
            {item.fileName?.trim() || t("common_attached_file")}
          </p>
          <p className={`mt-1 text-[12px] leading-snug ${item.isMine ? "text-white/80" : "text-[#6b7280]"}`}>
            {formatFileMeta(item.fileMimeType, item.fileSizeBytes)}
          </p>
        </div>
      </div>
      <div className="mt-3">
        {item.pending ? (
          <span className={`sam-text-helper ${item.isMine ? "text-sam-muted" : "text-sam-muted"}`}>{t("common_uploading")}</span>
        ) : item.content.trim() ? (
          <a
            href={item.content.trim()}
            target="_blank"
            rel="noopener noreferrer"
            download={mediaAutoSaveEnabled ? item.fileName?.trim() || "community-messenger-file" : undefined}
            className={`inline-flex rounded-[10px] border px-3 py-1.5 sam-text-helper font-semibold ${
              item.isMine
                ? "border-white/35 bg-white/15 text-white"
                : "border-[color:var(--cm-room-divider)] bg-sam-surface text-[color:var(--cm-room-text)]"
            }`}
          >
            {mediaAutoSaveEnabled ? t("cm_ui_save_file") : t("cm_ui_open_file")}
          </a>
        ) : null}
      </div>
    </div>
  );
});

export const TimelineViberInnerCallStub = memo(function TimelineViberInnerCallStub({
  item,
  stubBusy,
  voiceCallLabel,
  videoCallLabel,
  callStatusLabel,
}: {
  item: TimelineViberBubbleMessage;
  stubBusy: boolean;
  voiceCallLabel: string;
  videoCallLabel: string;
  callStatusLabel: string;
}) {
  const CallGlyph = item.callKind === "video" ? VideoCallIcon : VoiceCallIcon;
  const fallbackLabel = `${item.callKind === "video" ? videoCallLabel : voiceCallLabel} · ${callStatusLabel}`;
  const displayLabel = item.content.trim() || fallbackLabel;
  return (
    <div
      className={`inline-flex min-h-[40px] max-w-[min(76vw,420px)] items-center gap-2 rounded-[18px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-1.5 text-left text-[color:var(--cm-room-text)] shadow-none ${
        stubBusy ? "opacity-45" : ""
      }`}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)]"
        aria-hidden
      >
        <CallGlyph className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 truncate sam-text-helper font-semibold leading-snug">{displayLabel}</span>
    </div>
  );
});

export const TimelineViberInnerTextDefault = memo(function TimelineViberInnerTextDefault({
  item,
  linkPreviewEnabled,
  sendingLabel,
  highlightMentions = false,
}: {
  item: TimelineViberBubbleMessage;
  linkPreviewEnabled: boolean;
  sendingLabel: string;
  highlightMentions?: boolean;
}) {
  const mineLight = item.isMine;
  const body =
    highlightMentions && item.messageType === "text" ? (
      <GroupMentionText content={item.content} isMine={mineLight} />
    ) : (
      item.content
    );
  return (
    <div className="flex w-max max-w-full flex-col gap-2">
      <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
        <p
          className={`inline-block w-fit max-w-full whitespace-pre-wrap break-words text-[14px] leading-[1.35] break-keep [overflow-wrap:break-word] ${
            mineLight ? "text-inherit" : "text-[color:var(--cm-room-bubble-incoming-fg,#050505)]"
          }`}
        >
          {body}
        </p>
        {item.pending ? (
          <span
            className={`shrink-0 text-[11px] ${mineLight ? "text-white/75" : "text-[color:var(--cm-room-text-muted)]"}`}
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
                className={`inline-flex max-w-[220px] truncate rounded-[10px] border px-2.5 py-1 text-[12px] leading-snug ${
                  mineLight
                    ? "border-white/35 bg-white/15 text-white"
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
