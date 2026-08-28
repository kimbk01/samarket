/** Designed STORE gift fallback — full-bleed certificate tile. */
export function StoreGiftFallback({
  initial,
  className = "",
}: {
  initial: string;
  className?: string;
}) {
  const letter = initial.charAt(0).toUpperCase() || "S";
  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#E11D48] via-[#BE123C] to-[#9F1239] text-white ${className}`}
      data-gift-store-fallback="1"
      aria-hidden
    >
      <div className="absolute inset-0 opacity-20">
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
          <path d="M0 20H100M0 50H100M0 80H100" stroke="white" strokeWidth="0.5" strokeDasharray="4 6" />
          <path d="M20 0V100M50 0V100M80 0V100" stroke="white" strokeWidth="0.5" strokeDasharray="4 6" />
        </svg>
      </div>
      <span className="relative text-4xl font-black drop-shadow-sm sm:text-5xl">{letter}</span>
      <span className="relative mt-2 text-[10px] font-bold tracking-[0.18em] opacity-90">STORE GIFT</span>
    </div>
  );
}
