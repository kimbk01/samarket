/** Designed STORE gift fallback — certificate tile, not a broken placeholder. */
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
      className={`relative flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#FFF0EF] via-white to-[#FFE8E6] text-[#EE3635] ${className}`}
      data-gift-store-fallback="1"
      aria-hidden
    >
      <div className="absolute inset-0 opacity-30">
        <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
          <path d="M0 20H100M0 50H100M0 80H100" stroke="#EE3635" strokeWidth="0.5" strokeDasharray="4 6" />
          <path d="M20 0V100M50 0V100M80 0V100" stroke="#EE3635" strokeWidth="0.5" strokeDasharray="4 6" />
        </svg>
      </div>
      <span className="relative text-3xl font-black">{letter}</span>
      <span className="relative mt-1 text-[9px] font-bold tracking-[0.14em]">STORE GIFT</span>
    </div>
  );
}
