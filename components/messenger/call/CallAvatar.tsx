"use client";

function readInitial(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  return [...trimmed][0] ?? "?";
}

export function CallAvatar({
  label,
  avatarUrl,
  pulse = false,
  /** Placeholder when no `avatarUrl`: brand · orange · 음성 발신(오렌지-핑크 그라데이션+보라 링). */
  placeholderTone = "brand",
}: {
  label: string;
  avatarUrl?: string | null;
  pulse?: boolean;
  placeholderTone?: "brand" | "orange" | "outgoingVoice";
}) {
  const placeholderCls =
    placeholderTone === "outgoingVoice"
      ? "bg-gradient-to-br from-[#fb923c] via-[#f472b6] to-[#ec4899] shadow-[0_20px_50px_rgba(0,0,0,0.35)] ring-1 ring-white/20"
      : placeholderTone === "orange"
        ? "bg-[#ea580c] shadow-[0_18px_44px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
        : "bg-white shadow-[0_18px_44px_rgba(0,0,0,0.22)] ring-1 ring-white/12";
  const initialCls =
    placeholderTone === "outgoingVoice" || placeholderTone === "orange"
      ? "sam-text-hero font-semibold text-white"
      : "sam-text-hero font-semibold text-[#5b48d6]";
  const pulseRingClass =
    placeholderTone === "outgoingVoice"
      ? "border-[#c4b5fd]/55 shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
      : "border-white/18";
  const pulseRingOuterClass =
    placeholderTone === "outgoingVoice" ? "border-[#a78bfa]/35" : "border-white/10";
  return (
    <div className="relative flex h-[152px] w-[152px] items-center justify-center sm:h-40 sm:w-40">
      {pulse ? (
        <>
          <div
            className={`absolute inset-[-12px] rounded-full border opacity-[0.85] animate-pulse ${pulseRingClass}`}
            style={{ animationDuration: "2.2s" }}
            aria-hidden
          />
          <div
            className={`absolute inset-[-26px] rounded-full border opacity-60 animate-pulse ${pulseRingOuterClass}`}
            style={{ animationDuration: "2.8s" }}
            aria-hidden
          />
        </>
      ) : null}
      <div
        className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-full ${placeholderCls}`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className={initialCls}>{readInitial(label)}</span>
        )}
      </div>
    </div>
  );
}
