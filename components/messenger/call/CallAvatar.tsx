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
  /** Placeholder when no `avatarUrl`: brand (default) or orange (incoming desktop style). */
  placeholderTone = "brand",
}: {
  label: string;
  avatarUrl?: string | null;
  pulse?: boolean;
  placeholderTone?: "brand" | "orange";
}) {
  const placeholderCls =
    placeholderTone === "orange"
      ? "bg-[#ea580c] shadow-[0_18px_44px_rgba(0,0,0,0.45)] ring-1 ring-white/10"
      : "bg-white shadow-[0_18px_44px_rgba(0,0,0,0.22)] ring-1 ring-white/12";
  const initialCls = placeholderTone === "orange" ? "sam-text-hero font-semibold text-white" : "sam-text-hero font-semibold text-[#5b48d6]";
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      {pulse ? (
        <>
          <div className="absolute inset-[-10px] rounded-full border border-white/18 opacity-70 animate-pulse" aria-hidden />
          <div className="absolute inset-[-22px] rounded-full border border-white/10 opacity-60 animate-pulse" aria-hidden />
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
