"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

function readInitial(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  return [...trimmed][0] ?? "?";
}

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
  const pulseRingClass =
    isStarbucks && placeholderTone === "outgoingVoice"
      ? "border-[#D4E9E2]/60 shadow-[0_0_0_1px_rgba(212,233,226,0.26)]"
      : placeholderTone === "outgoingVoice"
        ? "border-[#c4b5fd]/55 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
        : isStarbucks
          ? "border-[#D4E9E2]/32"
          : "border-white/18";
  const pulseRingOuterClass =
    isStarbucks && placeholderTone === "outgoingVoice"
      ? "border-[#D4E9E2]/36"
      : placeholderTone === "outgoingVoice"
        ? "border-[#a78bfa]/35"
        : isStarbucks
          ? "border-[#D4E9E2]/18"
          : "border-white/10";
  return (
    <div className="relative flex h-[clamp(120px,36vw,168px)] w-[clamp(120px,36vw,168px)] items-center justify-center md:h-[168px] md:w-[168px]">
      {pulse ? (
        <>
          <div
            className={`absolute inset-[-8%] rounded-full border opacity-[0.85] animate-pulse ${pulseRingClass}`}
            style={{ animationDuration: "2.2s" }}
            aria-hidden
          />
          <div
            className={`absolute inset-[-16%] rounded-full border opacity-60 animate-pulse ${pulseRingOuterClass}`}
            style={{ animationDuration: "2.8s" }}
            aria-hidden
          />
        </>
      ) : null}
      <div
        className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full ${placeholderCls}`}
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
