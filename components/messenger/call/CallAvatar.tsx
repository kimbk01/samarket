"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

function readInitial(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  return [...trimmed][0] ?? "?";
}

const AVATAR_PULSE_RING_CLASS =
  "pointer-events-none absolute rounded-full border border-[#D4E9E2]/50";

const AVATAR_PULSE_ANIMATION = "call-pulse-ring 1s cubic-bezier(0.2, 0.8, 0.2, 1) infinite";

export function CallAvatar({
  label,
  avatarUrl,
  pulse = false,
  placeholderTone = "brand",
  theme,
}: {
  label: string;
  avatarUrl?: string | null;
  pulse?: boolean;
  placeholderTone?: "brand" | "orange" | "outgoingVoice";
  theme?: "starbucks";
}) {
  const isStarbucks = theme === "starbucks";
  const placeholderCls =
    isStarbucks && placeholderTone === "outgoingVoice"
      ? "bg-gradient-to-br from-[#D4E9E2] via-[#00754A] to-[#003D29] shadow-[0_20px_50px_rgba(0,61,41,0.35)] ring-1 ring-[#D4E9E2]/35"
      : isStarbucks && placeholderTone === "orange"
        ? "bg-[#A9472B] shadow-[0_18px_44px_rgba(88,41,26,0.35)] ring-1 ring-[#F1F8F4]/18"
        : isStarbucks
          ? "bg-[#F1F8F4] shadow-[0_18px_44px_rgba(0,61,41,0.22)] ring-1 ring-[#D4E9E2]/40"
          : placeholderTone === "outgoingVoice"
            ? "bg-gradient-to-br from-[#fb923c] via-[#f472b6] to-[#ec4899] shadow-[0_20px_50px_rgba(0,0,0,0.35)] ring-1 ring-white/20"
            : placeholderTone === "orange"
              ? "bg-[#ea580c] shadow-[0_18px_44px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
              : "bg-white shadow-[0_18px_44px_rgba(0,0,0,0.22)] ring-1 ring-white/12";
  const initialCls =
    placeholderTone === "outgoingVoice" || placeholderTone === "orange"
      ? "sam-text-hero font-semibold text-white"
      : isStarbucks
        ? "sam-text-hero font-semibold text-[#006241]"
        : "sam-text-hero font-semibold text-[#5b48d6]";

  return (
    <div className="relative flex h-[clamp(120px,36vw,168px)] w-[clamp(120px,36vw,168px)] items-center justify-center md:h-[168px] md:w-[168px]">
      {pulse ? (
        <>
          <span
            className={`${AVATAR_PULSE_RING_CLASS} inset-[-6%]`}
            style={{ animation: AVATAR_PULSE_ANIMATION }}
            aria-hidden
          />
          <span
            className={`${AVATAR_PULSE_RING_CLASS} inset-[-12%]`}
            style={{ animation: AVATAR_PULSE_ANIMATION, animationDelay: "160ms" }}
            aria-hidden
          />
          <span
            className={`${AVATAR_PULSE_RING_CLASS} inset-[-18%]`}
            style={{ animation: AVATAR_PULSE_ANIMATION, animationDelay: "320ms" }}
            aria-hidden
          />
        </>
      ) : null}
      <div
        className={`relative z-[1] flex h-full w-full items-center justify-center overflow-hidden rounded-full ${placeholderCls}`}
      >
        <SamarketThumbnail
          src={avatarUrl}
          fill
          roundedClassName="rounded-full"
          className={placeholderCls}
          fallbackSrc=""
          fallbackNode={<span className={initialCls}>{readInitial(label)}</span>}
        />
      </div>
    </div>
  );
}
