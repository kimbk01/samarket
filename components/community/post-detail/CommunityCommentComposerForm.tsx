"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { MoimStickyFooter } from "@/components/moim/MoimStickyFooter";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import {
  CM_BTN_PILL_PRIMARY_CLASS,
  CM_COMMENT_COMPOSER_FIELD_CLASS,
} from "@/lib/community/community-ui-classes";

export type MeAvatarProps = { name: string; avatarUrl: string | null };

const COMPOSER_MAX_CLASS = "max-h-[7.5rem]";
const COMPOSER_MIN_PX = 40;

function syncGrowHeight(el: HTMLTextAreaElement, minPx: number) {
  el.style.height = "auto";
  const maxRaw = Number.parseFloat(getComputedStyle(el).maxHeight);
  const maxPx = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 120;
  el.style.height = `${Math.min(Math.max(el.scrollHeight, minPx), maxPx)}px`;
}

export function CommunityCommentGrowTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  readOnly,
  onClick,
  id,
  composingRef,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  readOnly?: boolean;
  onClick?: () => void;
  id?: string;
  composingRef?: { current: boolean };
  textareaRef?: { current: HTMLTextAreaElement | null };
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    syncGrowHeight(el, COMPOSER_MIN_PX);
  }, [value]);

  return (
    <textarea
      id={id}
      ref={(el) => {
        ref.current = el;
        if (textareaRef) textareaRef.current = el;
      }}
      rows={1}
      className={`${CM_COMMENT_COMPOSER_FIELD_CLASS} ${COMPOSER_MAX_CLASS} min-w-0 flex-1 resize-none overflow-y-auto`}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      onClick={onClick}
      onCompositionStart={() => {
        if (composingRef) composingRef.current = true;
      }}
      onCompositionEnd={() => {
        if (composingRef) composingRef.current = false;
      }}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="off"
      enterKeyHint="enter"
    />
  );
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  isLoggedIn: boolean;
  placeholder: string;
  me: MeAvatarProps | null;
  /** 답글 중이면 대상 — 바 위 띠 「○○님에게 답글 · 취소」 */
  replyTo: { name: string } | null;
  onCancelReply: () => void;
  /** 운영 설정 글자 수 상한 — 80% 넘으면 남은 글자 표시, 넘으면 게시 막음 (감사 L13) */
  maxLength: number | null;
  error?: string;
};

/**
 * 라운지 댓글 입력 바 — 화면 하단 고정(키보드 위), 댓글·답글 하나로 (설계 §6.5 · 시안 S1·S4·S7).
 * 위치·키보드 보정은 앱 공용 하단 줄(`MoimStickyFooter`)과 같은 부품을 쓴다.
 */
export function CommunityCommentComposerBar({
  value,
  onChange,
  onSubmit,
  busy,
  isLoggedIn,
  placeholder,
  me,
  replyTo,
  onCancelReply,
  maxLength,
  error = "",
}: Props) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const composingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const length = value.trim().length;
  const overLimit = maxLength != null && length > maxLength;
  const showCounter = maxLength != null && length >= Math.floor(maxLength * 0.8);

  useEffect(() => {
    if (replyTo && isLoggedIn) textareaRef.current?.focus();
  }, [isLoggedIn, replyTo]);

  const trySubmit = async () => {
    if (composingRef.current) return;
    if (busy || !isLoggedIn || !value.trim() || overLimit) return;
    /** 로그인한 가입 진행 중 회원도 같은 행동 게이트 — 「가입 이어하기」 안내 (재감사 M2) */
    const n = window.location.pathname + window.location.search;
    if (!(await requireAction("community_comment", () => undefined, { next: n }))) return;
    onSubmit();
  };

  const n = (me?.name || "?").trim() || "?";

  return (
    <MoimStickyFooter compact className="z-20">
      <div id="comment-composer" className="mx-auto max-w-3xl">
        {replyTo ? (
          <div className="flex items-center justify-between gap-2 pb-1.5 text-[12px] text-[var(--cm-text-muted)]">
            <span className="min-w-0 truncate">
              {t("community_comment_reply_to_named", { name: replyTo.name || t("community_anonymous") })}
            </span>
            <button
              type="button"
              className="inline-flex min-h-8 shrink-0 items-center px-1 font-semibold text-[var(--cm-text-secondary)]"
              onClick={onCancelReply}
            >
              {t("common_cancel")}
            </button>
          </div>
        ) : null}
        {error ? (
          <p className="m-0 pb-1.5 text-[12px] font-medium text-[var(--cm-danger)]" role="alert">
            {error}
          </p>
        ) : null}
        <form
          className="flex w-full min-w-0 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void trySubmit();
          }}
        >
          <SamarketThumbnail
            src={me?.avatarUrl}
            size={32}
            roundedClassName="rounded-full"
            className="mb-1 shrink-0 bg-[var(--cm-primary-soft)]"
            fallbackSrc=""
            fallbackNode={
              <span className="text-[13px] font-semibold text-[var(--cm-primary)]" aria-hidden>
                {n.slice(0, 1).toUpperCase()}
              </span>
            }
          />
          <CommunityCommentGrowTextarea
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            readOnly={!isLoggedIn}
            disabled={busy && isLoggedIn}
            composingRef={composingRef}
            textareaRef={textareaRef}
            onClick={() => {
              if (!isLoggedIn) {
                const next = window.location.pathname + window.location.search;
                void requireAction("community_comment", () => undefined, { next });
              }
            }}
          />
          <button
            type="submit"
            disabled={busy || !isLoggedIn || !value.trim() || overLimit}
            className={`mb-0.5 shrink-0 px-4 ${CM_BTN_PILL_PRIMARY_CLASS}`}
            aria-label={t("community_comment_post_aria")}
          >
            {t("community_comment_post")}
          </button>
        </form>
        {showCounter ? (
          <p
            className={`m-0 pt-1 text-right text-[11px] tabular-nums ${
              overLimit ? "text-[var(--cm-danger)]" : "text-[var(--cm-text-muted)]"
            }`}
          >
            {t("community_comment_char_count", { count: length, max: maxLength ?? 0 })}
          </p>
        ) : null}
      </div>
    </MoimStickyFooter>
  );
}
