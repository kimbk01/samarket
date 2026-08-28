/** Canonical DIBAY platform Gift artwork — premium green certificate identity. */
export function DibayPlatformGiftFallback({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#059669] via-[#047857] to-[#065F46] text-white ${className}`}
      data-gift-platform-fallback="1"
      aria-hidden
    >
      <svg viewBox="0 0 120 120" className="absolute h-[72%] w-[72%] opacity-95" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="18" y="34" width="84" height="62" rx="6" fill="#10B981" stroke="#A7F3D0" strokeWidth="2" />
        <rect x="18" y="34" width="84" height="18" rx="6" fill="#047857" />
        <path d="M60 34V96" stroke="#A7F3D0" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M18 52H102" stroke="#A7F3D0" strokeWidth="2" />
        <path
          d="M60 18C66 28 74 32 84 34C74 36 66 40 60 50C54 40 46 36 36 34C46 32 54 28 60 18Z"
          fill="#FBBF24"
          stroke="#F59E0B"
          strokeWidth="1.5"
        />
      </svg>
      <span className="absolute bottom-3 text-[11px] font-bold tracking-[0.14em]">DIBAY</span>
    </div>
  );
}
