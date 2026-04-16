"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAppSettings } from "@/lib/app-settings";
import { MAX_CHAT_IMAGE_ATTACH } from "@/lib/chats/chat-image-bundle";
import { usePreferMobileChatImagePicker } from "@/lib/ui/use-prefer-mobile-chat-image-picker";
import { ChatMobileImagePickerSheet } from "@/components/chats/ChatMobileImagePickerSheet";
import { ChatMobileAttachSheet } from "@/components/chats/ChatMobileAttachSheet";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { useMobileKeyboardInset } from "@/lib/ui/use-mobile-keyboard-inset";

interface ChatInputBarProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  /** 있으면 좌측 1번 버튼을 "나가기"로 표시 */
  onLeave?: () => void;
  /** 채팅방 id 등 — 있으면 입력 초안을 sessionStorage에 보존(상세 갔다가 뒤로와도 유지) */
  draftStorageKey?: string;
  placeholder?: string;
  /** false면 이모지 버튼·패널 숨김 */
  showEmojiButton?: boolean;
  /** 인스타 DM 스타일: 흰 필·얇은 보더·블루 전송 */
  variant?: "default" | "instagram";
  /** 카메라·앨범에서 고른 이미지(여러 장 가능, 최대 MAX_CHAT_IMAGE_ATTACH) */
  onImageFilesSelected?: (files: File[]) => void;
  /** 이미지 업로드·전송 중 입력 비활성화 */
  imageSending?: boolean;
}

const DEFAULT_MAX_MESSAGE_LENGTH = 1000;

/** 이모지 패널용 — 다양한 이모지 (스마일·감정·손동작·기타) */
const EMOJI_GRID: string[][] = [
  ["😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛"],
  ["😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪"],
  ["🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐", "😕", "😟"],
  ["🙁", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫"],
  ["👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝", "🙏"],
  ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️"],
];

const ALL_CHAT_EMOJIS = EMOJI_GRID.flat();
/** 첫 패널에만 표시 — 태블릿에서도 한눈에 들어오게; 나머지는 더보기 */
const EMOJI_PANEL_PREVIEW_COUNT = 35;

function draftKey(k: string) {
  return `kasama-chat-draft:${k}`;
}

export function ChatInputBar({
  onSend,
  disabled,
  onLeave,
  draftStorageKey,
  placeholder = "메시지를 입력하세요",
  showEmojiButton = true,
  variant = "default",
  onImageFilesSelected,
  imageSending = false,
}: ChatInputBarProps) {
  const { t } = useI18n();
  const ig = variant === "instagram";
  const preferMobileImageSheet = usePreferMobileChatImagePicker();
  const [pickerStagingFiles, setPickerStagingFiles] = useState<File[] | null>(null);
  const [mobileAttachSheetOpen, setMobileAttachSheetOpen] = useState(false);
  const [text, setText] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiShowAll, setEmojiShowAll] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const attachWrapRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const maxLength = useMemo(
    () => Math.max(1, getAppSettings().maxMessageLength ?? DEFAULT_MAX_MESSAGE_LENGTH),
    []
  );
  const keyboardInsetPx = useMobileKeyboardInset();
  const composerBottomPadPx = Math.max(8, keyboardInsetPx);
  const hasText = !!text.trim();
  const inputLocked = !!disabled || imageSending;

  const persistDraft = (value: string) => {
    if (!draftStorageKey || typeof window === "undefined") return;
    try {
      if (value.trim()) sessionStorage.setItem(draftKey(draftStorageKey), value);
      else sessionStorage.removeItem(draftKey(draftStorageKey));
    } catch {
      /* ignore */
    }
  };

  const handleSubmit = () => {
    const trimmed = text.trim().slice(0, maxLength);
    if (!trimmed || inputLocked) return;
    onSend(trimmed);
    setText("");
    setEmojiOpen(false);
    persistDraft("");
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (!el) {
      const next = (text + emoji).slice(0, maxLength);
      setText(next);
      persistDraft(next);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(end)).slice(0, maxLength);
    setText(next);
    persistDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = start + emoji.length;
      el.setSelectionRange(newPos, newPos);
    });
  };

  useEffect(() => {
    if (!draftStorageKey || typeof window === "undefined") return;
    try {
      const saved = sessionStorage.getItem(draftKey(draftStorageKey));
      if (saved) setText(saved.slice(0, maxLength));
    } catch {
      /* ignore */
    }
  }, [draftStorageKey, maxLength]);

  useEffect(() => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    if (el.scrollHeight <= 80) el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 80)}px`;
  }, [text]);

  useEffect(() => {
    if (!emojiOpen) return;
    const close = (e: MouseEvent) => {
      if (emojiPanelRef.current?.contains(e.target as Node)) return;
      setEmojiOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [emojiOpen]);

  useEffect(() => {
    if (!emojiOpen) setEmojiShowAll(false);
  }, [emojiOpen]);

  useEffect(() => {
    if (!attachOpen || preferMobileImageSheet) return;
    const close = (e: MouseEvent) => {
      if (attachWrapRef.current?.contains(e.target as Node)) return;
      setAttachOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [attachOpen, preferMobileImageSheet]);

  const onImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    setAttachOpen(false);
    setMobileAttachSheetOpen(false);
    if (!raw.length || !onImageFilesSelected) return;
    const sliced = raw.slice(0, MAX_CHAT_IMAGE_ATTACH);
    if (preferMobileImageSheet) {
      setPickerStagingFiles(sliced);
      return;
    }
    onImageFilesSelected(sliced);
  };

  const attachBtnClass = `flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${ig ? "text-foreground hover:bg-black/[0.05]" : "text-sam-muted hover:bg-sam-surface-muted"}`;

  return (
    <>
    <div
      className={`relative flex min-h-[50px] max-h-[64px] w-full min-w-0 items-center safe-area-pb ${ig ? "gap-1.5" : "gap-2"} ${APP_MAIN_GUTTER_X_CLASS}`}
      style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${composerBottomPadPx}px)` }}
    >
      {/* 이모지 패널: 입력창 위, 다양한 이모지 그리드 */}
      {showEmojiButton && emojiOpen && (
        <div
          ref={emojiPanelRef}
          className={`absolute bottom-full left-0 right-0 z-20 mb-1 flex max-h-[min(42dvh,300px)] flex-col overflow-hidden rounded-ui-rect border bg-sam-surface shadow-lg sm:max-h-[min(48dvh,380px)] md:max-w-lg md:mx-auto ${ig ? "border-ig-border" : "border-sam-border"}`}
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-sam-border-soft px-2.5 py-2">
            <span className="text-[13px] font-semibold text-sam-fg">{t("common_emoji")}</span>
            <span className="text-[11px] text-sam-muted">{t("common_emoji_panel_hint")}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 pt-2.5">
            <div className="grid grid-cols-7 gap-1 touch-manipulation sm:grid-cols-8 md:grid-cols-7 md:gap-1.5">
              {(emojiShowAll ? ALL_CHAT_EMOJIS : ALL_CHAT_EMOJIS.slice(0, EMOJI_PANEL_PREVIEW_COUNT)).map(
                (emoji, i) => (
                  <button
                    key={`${emoji}-${i}`}
                    type="button"
                    className="flex h-10 w-10 items-center justify-center rounded-ui-rect text-[24px] hover:bg-ig-highlight active:scale-[0.96] sm:h-11 sm:w-11 sm:text-[25px] md:text-[26px]"
                    onClick={() => insertEmoji(emoji)}
                    aria-label={`${t("common_emoji")} ${emoji}`}
                  >
                    {emoji}
                  </button>
                )
              )}
            </div>
            {!emojiShowAll && ALL_CHAT_EMOJIS.length > EMOJI_PANEL_PREVIEW_COUNT ? (
              <button
                type="button"
                className="mt-2 w-full rounded-ui-rect border border-sam-border bg-[var(--sub-bg)] py-2.5 text-[13px] font-medium text-sam-fg hover:bg-black/[0.04] active:bg-black/[0.06]"
                onClick={() => setEmojiShowAll(true)}
              >
                {t("common_emoji_show_more")} · {ALL_CHAT_EMOJIS.length - EMOJI_PANEL_PREVIEW_COUNT}+
              </button>
            ) : null}
          </div>
        </div>
      )}

      {onLeave ? (
        <button
          type="button"
          onClick={onLeave}
          className={attachBtnClass}
          aria-label={t("common_leave_chat_room")}
          disabled={disabled}
        >
          <LeaveIcon className="h-5 w-5" />
        </button>
      ) : onImageFilesSelected ? (
        <div className="relative shrink-0" ref={attachWrapRef}>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            disabled={inputLocked}
            onChange={onImageInputChange}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            disabled={inputLocked}
            onChange={onImageInputChange}
          />
          <button
            type="button"
            className={attachBtnClass}
            aria-label={t("common_photo_attach")}
            aria-expanded={preferMobileImageSheet ? mobileAttachSheetOpen : attachOpen}
            aria-haspopup={preferMobileImageSheet ? "dialog" : "menu"}
            disabled={inputLocked}
            onClick={() =>
              preferMobileImageSheet
                ? setMobileAttachSheetOpen((o) => !o)
                : setAttachOpen((o) => !o)
            }
          >
            <PlusIcon className="h-7 w-7" />
          </button>
          {!preferMobileImageSheet && attachOpen ? (
            <div
              role="menu"
              className={`absolute bottom-full left-0 z-30 mb-1 min-w-[10.5rem] overflow-hidden rounded-ui-rect py-1 shadow-lg ring-1 ring-black/10 ${ig ? "border border-ig-border bg-sam-surface" : "border border-sam-border bg-sam-surface"}`}
            >
              <button
                type="button"
                role="menuitem"
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] font-medium ${ig ? "text-foreground hover:bg-black/[0.04]" : "text-sam-fg hover:bg-sam-app"}`}
                onClick={() => {
                  setAttachOpen(false);
                  cameraInputRef.current?.click();
                }}
              >
                <CameraIcon className="h-5 w-5 shrink-0 opacity-80" />
                {t("common_take_photo")}
              </button>
              <button
                type="button"
                role="menuitem"
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[14px] font-medium ${ig ? "text-foreground hover:bg-black/[0.04]" : "text-sam-fg hover:bg-sam-app"}`}
                onClick={() => {
                  setAttachOpen(false);
                  galleryInputRef.current?.click();
                }}
              >
                <GalleryIcon className="h-5 w-5 shrink-0 opacity-80" />
                {t("common_choose_from_album")}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <button type="button" className={attachBtnClass} aria-label={t("common_attach")} disabled={disabled}>
          <PlusIcon className="h-7 w-7" />
        </button>
      )}
      <div
        className={`flex min-h-[44px] min-w-0 flex-1 items-center ${ig ? "rounded-full border border-ig-border bg-sam-surface px-1.5" : "rounded-ui-rect bg-[#F5F5F5] px-1"}`}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => {
            const v = e.target.value.slice(0, maxLength);
            setText(v);
            persistDraft(v);
          }}
          maxLength={maxLength}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== "NumpadEnter") return;
            if (e.shiftKey) return;
            /** 한글·중국어 IME 조합 확정 Enter 는 전송하지 않음 */
            if (e.nativeEvent.isComposing) return;
            e.preventDefault();
            handleSubmit();
          }}
          placeholder={placeholder}
          rows={1}
          className={`max-h-[120px] w-full flex-1 resize-none border-0 bg-transparent focus:outline-none focus:ring-0 ${ig ? `min-h-[40px] rounded-full px-2.5 py-2.5 text-[calc(15px-1pt)] font-normal leading-[1.35] tracking-[-0.01em] text-foreground placeholder:text-muted` : "min-h-[40px] rounded-ui-rect px-3 py-2.5 text-[15px] font-normal leading-[1.35] text-[#111111] placeholder:text-[#999999]"}`}
          disabled={inputLocked}
        />
        {showEmojiButton ? (
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50 md:h-[52px] md:w-[52px] ${emojiOpen ? (ig ? "bg-black/[0.08] text-foreground" : "bg-ig-highlight text-foreground") : ig ? "text-foreground hover:bg-black/[0.05]" : "text-foreground hover:bg-ig-highlight"}`}
            aria-label={t("common_emoji")}
            aria-expanded={emojiOpen}
            disabled={inputLocked}
          >
            <EmojiIcon className="h-5 w-5 md:h-7 md:w-7" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={inputLocked || !hasText}
        className={`flex h-11 w-11 min-w-[44px] shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white hover:opacity-90 disabled:opacity-50 ${ig ? "bg-signature" : "bg-signature"}`}
        aria-label={t("common_send")}
      >
        <SendIcon className="h-5 w-5" />
      </button>
    </div>
    <ChatMobileImagePickerSheet
      open={Boolean(pickerStagingFiles?.length)}
      files={pickerStagingFiles ?? []}
      onClose={() => setPickerStagingFiles(null)}
      onConfirm={(files) => onImageFilesSelected?.(files)}
    />
    <ChatMobileAttachSheet
      open={preferMobileImageSheet && mobileAttachSheetOpen}
      onClose={() => setMobileAttachSheetOpen(false)}
      instagram={ig}
      disabled={inputLocked}
      onPickCamera={() => cameraInputRef.current?.click()}
      onPickGallery={() => galleryInputRef.current?.click()}
    />
    </>
  );
}

function LeaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: "scaleX(-1)" }}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/** 인스타 DM 스타일 — 왼쪽 첨부 트리거는 + 아이콘 (시각적 크게 보이도록 굵은 획) */
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function GalleryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function EmojiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9c.83 0 1.5-.67 1.5-1.5S7.83 8 7 8s-1.5.67-1.5 1.5S6.17 11 7 11zm10 0c.83 0 1.5-.67 1.5-1.5S17.83 8 17 8s-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm-5 6c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

