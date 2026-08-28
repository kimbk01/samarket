/** Canonical DIBAY platform Gift artwork — reference §8 physical card identity. */
export function DibayPlatformGiftFallback({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-[#045E3A] text-white ${className}`}
      data-gift-platform-fallback="1"
      aria-hidden
    >
      <svg viewBox="0 0 120 120" className="h-[78%] w-[78%]" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="18" y="34" width="84" height="62" rx="6" fill="#0B7A4B" stroke="#B8E6CF" strokeWidth="2" />
        <rect x="18" y="34" width="84" height="18" rx="6" fill="#034730" />
        <path d="M60 34V96" stroke="#B8E6CF" strokeWidth="2" strokeDasharray="4 4" />
        <path d="M18 52H102" stroke="#B8E6CF" strokeWidth="2" />
        <path
          d="M60 18C66 28 74 32 84 34C74 36 66 40 60 50C54 40 46 36 36 34C46 32 54 28 60 18Z"
          fill="#F4C542"
          stroke="#E6B020"
          strokeWidth="1.5"
        />
      </svg>
      <span className="absolute bottom-2 text-[10px] font-bold tracking-[0.12em]">DIBAY</span>
    </div>
  );
}
