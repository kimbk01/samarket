"use client";

import type { MessageKey } from "@/lib/i18n/messages";
import {
  formatVoiceRecordTenThousandths,
  VoiceRecordingLiveWaveform,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import {
  MESSENGER_DELIVERY_COMPOSER_MIC_SLOT_CLASS,
  MESSENGER_DELIVERY_COMPOSER_ROW_CLASS,
  MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS,
  MESSENGER_DELIVERY_COMPOSER_SIDE_SLOT_CLASS,
} from "@/lib/ui/messenger-chat-viewport-tuning";
import { ArrowUp, Mic, Plus, Trash2 } from "lucide-react";
import type {
  FocusEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";

type TranslateFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

type DeliveryVoiceRecordingPaneProps = {
  elapsedMs: number;
  peaks: number[];
  cancelHint: boolean;
  handsFree: boolean;
  onDelete: () => void;
  t: TranslateFn;
};

/** composer pill 안 녹음 UI — 마이크 슬롯 위치 고정을 위해 부모가 레이아웃만 담당 */
function DeliveryVoiceRecordingPane({
  elapsedMs,
  peaks,
  cancelHint,
  handsFree,
  onDelete,
  t,
}: DeliveryVoiceRecordingPaneProps) {
  const timer = (
    <span className="flex shrink-0 items-center gap-1 tabular-nums text-[13px] font-semibold leading-none text-[color:var(--delivery-dark)]">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
      {formatVoiceRecordTenThousandths(elapsedMs)}
    </span>
  );
  if (handsFree) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-0.5">
        {timer}
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <VoiceRecordingLiveWaveform peaks={peaks} />
          <span className="shrink-0 text-[11px] font-medium leading-tight text-[color:var(--delivery-text-muted)]">
            {t("cm_ui_locked_recording")}
          </span>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[color:var(--delivery-icon-muted)]"
          aria-label={t("cm_ui_delete_recording")}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-0.5">
      {timer}
      <VoiceRecordingLiveWaveform peaks={peaks} className="min-w-0 flex-1" />
      <span
        className={`shrink-0 text-[11px] leading-tight ${
          cancelHint ? "font-medium text-red-600" : "text-[color:var(--delivery-text-muted)]"
        }`}
      >
        {t("cm_ui_slide_to_cancel")}
      </span>
    </div>
  );
}

export type MessengerComposerVoiceProps = {
  recording: boolean;
  micArming: boolean;
  handsFree: boolean;
  elapsedMs: number;
  peaks: number[];
  cancelHint: boolean;
  onMicPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onMicPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onFinalizeRecording: (send: boolean) => void;
  micDisabled: boolean;
  micTitle?: string;
};

export type MessengerComposerSectorProps = {
  draft: string;
  placeholder: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onAttach: () => void;
  onSend: () => void;
  onTextareaKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTextareaFocus: (e: FocusEvent<HTMLTextAreaElement>) => void;
  onTextareaBlur: () => void;
  textareaDisabled: boolean;
  sendDisabled: boolean;
  sendAriaLabel: string;
  attachAriaLabel: string;
  attachDisabled?: boolean;
  voice?: MessengerComposerVoiceProps | null;
  showVoiceMic?: boolean;
  className?: string;
  onTextareaRef?: (node: HTMLTextAreaElement | null) => void;
  t: TranslateFn;
};

/**
 * 메신저 하단 입력 섹터 — compact composer 레이아웃 단일 소스 (44px row · 회색 pill · 녹색 전송).
 */
export function MessengerComposerSector({
  draft,
  placeholder,
  textareaRef,
  onDraftChange,
  onAttach,
  onSend,
  onTextareaKeyDown,
  onTextareaFocus,
  onTextareaBlur,
  textareaDisabled,
  sendDisabled,
  sendAriaLabel,
  attachAriaLabel,
  attachDisabled = false,
  voice = null,
  showVoiceMic = true,
  className = "",
  onTextareaRef,
  t,
}: MessengerComposerSectorProps) {
  const voiceRecording = voice?.recording ?? false;
  const voiceHandsFree = voice?.handsFree ?? false;

  return (
    <div
      data-delivery-composer-row
      className={`delivery-ui w-full max-w-full ${MESSENGER_DELIVERY_COMPOSER_SECTOR_HEIGHT_CLASS} ${className}`.trim()}
    >
      <div className={MESSENGER_DELIVERY_COMPOSER_ROW_CLASS}>
        <button
          type="button"
          data-delivery-composer-attach
          data-cm-line-plus-btn
          onClick={onAttach}
          disabled={attachDisabled || voiceRecording}
          className={`flex items-center justify-center text-[#191919] transition active:opacity-70 disabled:pointer-events-none ${MESSENGER_DELIVERY_COMPOSER_SIDE_SLOT_CLASS} ${
            voiceRecording ? "invisible" : ""
          }`}
          aria-label={attachAriaLabel}
          aria-hidden={voiceRecording}
          tabIndex={voiceRecording ? -1 : 0}
        >
          <Plus className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </button>
        <div
          data-delivery-composer-pill
          className="flex h-9 max-h-9 min-h-9 min-w-0 flex-[1_1_0%] items-center gap-0.5 self-center rounded-[18px] border border-[#d8d8d8] bg-[#ececec] bg-[color:var(--delivery-composer-surface,#ececec)] px-2.5"
        >
          <div className="flex min-h-0 min-w-0 flex-1 items-center overflow-hidden">
            {voiceRecording && voice ? (
              <DeliveryVoiceRecordingPane
                elapsedMs={voice.elapsedMs}
                peaks={voice.peaks}
                cancelHint={voice.cancelHint}
                handsFree={voice.handsFree}
                onDelete={() => voice.onFinalizeRecording(false)}
                t={t}
              />
            ) : (
              <textarea
                ref={(node) => {
                  if (textareaRef) textareaRef.current = node;
                  onTextareaRef?.(node);
                }}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={onTextareaKeyDown}
                onFocus={onTextareaFocus}
                onBlur={onTextareaBlur}
                rows={1}
                disabled={textareaDisabled}
                placeholder={placeholder}
                className="max-h-[36px] min-h-[20px] w-full min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent p-0 text-[16px] leading-[1.25] text-[color:var(--delivery-dark)] shadow-none outline-none ring-0 placeholder:text-[#888888] focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:shadow-none focus-visible:outline-none focus-visible:ring-0 disabled:opacity-50"
              />
            )}
          </div>
          {showVoiceMic && voice ? (
            <div data-delivery-composer-mic-slot className={MESSENGER_DELIVERY_COMPOSER_MIC_SLOT_CLASS}>
              {voice.micArming ? (
                <>
                  <span className="sam-cm-voice-mic-ripple-wave pointer-events-none" aria-hidden />
                  <span
                    className="sam-cm-voice-mic-ripple-wave sam-cm-voice-mic-ripple-wave--delay pointer-events-none"
                    aria-hidden
                  />
                </>
              ) : null}
              <button
                type="button"
                data-cm-line-mic-btn
                data-delivery-composer-mic
                onPointerDown={voice.onMicPointerDown}
                onPointerMove={voice.onMicPointerMove}
                onPointerUp={voice.onMicPointerUp}
                onPointerCancel={voice.onMicPointerCancel}
                disabled={voice.micDisabled}
                className={`absolute inset-0 z-[1] flex touch-none select-none items-center justify-center rounded-full transition-[background-color,color,box-shadow] duration-150 disabled:opacity-35 ${
                  voice.micArming || voice.recording
                    ? "bg-[color:var(--delivery-primary-soft)] text-[color:var(--delivery-primary)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--delivery-primary)_35%,transparent)]"
                    : "bg-transparent text-[color:var(--delivery-icon-muted)]"
                }`}
                aria-label={t("cm_ui_voice_message_recording_guide")}
                title={voice.micTitle}
              >
                <Mic className="h-5 w-5 shrink-0" strokeWidth={2} />
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          data-cm-line-send-btn
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (voiceRecording && voiceHandsFree && voice) {
              voice.onFinalizeRecording(true);
              return;
            }
            onSend();
          }}
          disabled={
            voiceRecording ? !voiceHandsFree : sendDisabled
          }
          className={`flex items-center justify-center rounded-full transition active:opacity-90 ${MESSENGER_DELIVERY_COMPOSER_SIDE_SLOT_CLASS} ${
            voiceRecording && !voiceHandsFree ? "invisible pointer-events-none" : ""
          } ${
            voiceRecording && voiceHandsFree
              ? "bg-[color:var(--delivery-primary)] text-white"
              : "bg-[color:var(--delivery-primary)] text-white disabled:bg-[#d0d0d0] disabled:text-[#888888] disabled:opacity-100"
          }`}
          aria-label={sendAriaLabel}
          aria-hidden={voiceRecording && !voiceHandsFree}
          tabIndex={voiceRecording && !voiceHandsFree ? -1 : 0}
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
