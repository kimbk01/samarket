"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";
import {
  CM_BTN_PILL_PRIMARY_CLASS,
  CM_COMMENT_COMPOSER_FIELD_CLASS,
} from "@/lib/community/community-ui-classes";

export type MeAvatarProps = { name: string; avatarUrl: string | null };

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
  disabled: boolean;
  isLoggedIn: boolean;
  placeholder: string;
  me: MeAvatarProps | null;
  className?: string;
};

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
  onFocus,
  onBlur,
  onClick,
  id,
  composingRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  readOnly?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  onClick?: () => void;
  id?: string;
  composingRef?: { current: boolean };
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
      ref={ref}
      rows={1}
      className={`${CM_COMMENT_COMPOSER_FIELD_CLASS} ${COMPOSER_MAX_CLASS} resize-none overflow-y-auto`}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      disabled={disabled}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
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

function SmallAvatar({ me }: { me: MeAvatarProps | null }) {
  const n = (me?.name || "?").trim() || "?";
  const ch = n.slice(0, 1).toUpperCase();
  return (
    <SamarketThumbnail
      src={me?.avatarUrl}
      size={40}
      roundedClassName="rounded-full"
      className="shrink-0 bg-[var(--cm-primary-soft)] ring-1 ring-[var(--cm-border)]"
      fallbackSrc=""
      fallbackNode={
        <span className="text-[14px] font-semibold text-[var(--cm-primary)]" aria-hidden>
          {ch}
        </span>
      }
    />
  );
}

/** 대댓글 연결용 L형(↳) */
export function ReplyLGlyph() {
  const { t } = useI18n();
  return (
    <span
      className="inline-flex h-8 w-7 shrink-0 select-none items-center justify-center text-[1rem] font-bold leading-none text-[var(--cm-primary)]"
      aria-hidden
      title={t("community_reply_title")}
    >
      ↳
    </span>
  );
}

export function CommunityCommentComposerForm({
  value,
  onChange,
  onSubmit,
  busy,
  disabled,
  isLoggedIn,
  placeholder,
  me,
  className = "",
}: Props) {
  const { t } = useI18n();
  const requireAction = useRequireAuthAction();
  const composingRef = useRef(false);

  const trySubmit = () => {
    if (composingRef.current) return;
    if (disabled || busy || !isLoggedIn || !value.trim()) return;
    onSubmit();
  };

  return (
    <form
      className={`flex w-full min-w-0 items-start gap-2.5 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        trySubmit();
      }}
    >
      <SmallAvatar me={me} />
      <CommunityCommentGrowTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={!isLoggedIn}
        disabled={(disabled || busy) && isLoggedIn}
        composingRef={composingRef}
        onClick={() => {
          if (!isLoggedIn) {
            const n = window.location.pathname + window.location.search;
            void requireAction("community_comment", () => undefined, { next: n });
          }
        }}
      />
      <button
        type="submit"
        disabled={disabled || busy || !isLoggedIn || !value.trim()}
        className={`shrink-0 self-end px-4 ${CM_BTN_PILL_PRIMARY_CLASS}`}
        aria-label={t("community_comment_post_aria")}
      >
        {t("community_comment_post")}
      </button>
    </form>
  );
}
