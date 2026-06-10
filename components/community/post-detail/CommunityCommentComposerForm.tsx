"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  PHILIFE_FB_INPUT_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { useRequireAuthAction } from "@/hooks/use-require-auth-action";

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

function SmallAvatar({ me }: { me: MeAvatarProps | null }) {
  const n = (me?.name || "?").trim() || "?";
  const ch = n.slice(0, 1).toUpperCase();
  return (
    <SamarketThumbnail
      src={me?.avatarUrl}
      size={36}
      roundedClassName="rounded-full"
      className="bg-[#E4E6EB] ring-1 ring-[#DADDE1]/60"
      fallbackSrc=""
      fallbackNode={<span className="text-[14px] font-semibold text-[#65676B]" aria-hidden>{ch}</span>}
    />
  );
}

/** 대댓글 연결용 L형(↳) */
export function ReplyLGlyph() {
  const { t } = useI18n();
  return (
    <span
      className="inline-flex h-8 w-7 shrink-0 select-none items-center justify-center text-[1rem] font-bold leading-none text-[#7360F2]"
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

  return (
    <form
      className={`flex w-full items-center gap-2.5 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled || busy || !isLoggedIn || !value.trim()) return;
        onSubmit();
      }}
    >
      <SmallAvatar me={me} />
      <input
        type="text"
        className={`min-h-[2.75rem] w-full min-w-0 flex-1 ${PHILIFE_FB_INPUT_CLASS}`}
        value={value}
        placeholder={placeholder}
        readOnly={!isLoggedIn}
        disabled={(disabled || busy) && isLoggedIn}
        onClick={() => {
          if (!isLoggedIn) {
            const n = window.location.pathname + window.location.search;
            void requireAction("community_comment", () => undefined, { next: n });
          }
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled && !busy && isLoggedIn && value.trim()) onSubmit();
          }
        }}
        autoComplete="off"
        enterKeyHint="send"
      />
      <button
        type="submit"
        disabled={disabled || busy || !isLoggedIn || !value.trim()}
        className={`h-10 shrink-0 px-4 ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
        aria-label={t("community_comment_post_aria")}
      >
        {t("community_comment_post_aria")}
      </button>
    </form>
  );
}
