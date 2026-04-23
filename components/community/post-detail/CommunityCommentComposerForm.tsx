"use client";

import { useRouter } from "next/navigation";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  PHILIFE_FB_INPUT_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

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
  if (me?.avatarUrl) {
    return <img src={me.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[#DADDE1]/60" />;
  }
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E4E6EB] text-[14px] font-semibold text-[#65676B]"
      aria-hidden
    >
      {ch}
    </div>
  );
}

/** 대댓글 연결용 L형(↳) */
export function ReplyLGlyph() {
  return (
    <span
      className="inline-flex h-8 w-7 shrink-0 select-none items-center justify-center text-[1rem] font-bold leading-none text-[#7360F2]"
      aria-hidden
      title="답글"
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
  const router = useRouter();

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
            void router.push(`/login?next=${encodeURIComponent(n)}`);
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
        aria-label="댓글 등록"
      >
        게시
      </button>
    </form>
  );
}
