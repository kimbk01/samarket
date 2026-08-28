/** Canonical DIBAY platform gift fallback art (single module). */
export function DibayPlatformGiftFallback({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-br from-emerald-600 to-emerald-800 text-white ${className}`}
      data-gift-platform-fallback="1"
      aria-hidden
    >
      <span className="text-xs font-bold tracking-wide">DIBAY</span>
    </div>
  );
}
