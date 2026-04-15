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
}: {
  label: string;
  avatarUrl?: string | null;
  pulse?: boolean;
}) {
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      {pulse ? (
        <>
          <div className="absolute inset-[-10px] rounded-full border border-white/18 opacity-70 animate-pulse" aria-hidden />
          <div className="absolute inset-[-22px] rounded-full border border-white/10 opacity-60 animate-pulse" aria-hidden />
        </>
      ) : null}
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_18px_44px_rgba(0,0,0,0.22)] ring-1 ring-white/12">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[48px] font-semibold text-[#5b48d6]">{readInitial(label)}</span>
        )}
      </div>
    </div>
  );
}
