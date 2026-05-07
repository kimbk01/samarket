"use client";

function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-neutral-200/80 via-neutral-100/90 to-neutral-200/80 bg-[length:200%_100%] ${className}`}
      style={{ animationDuration: "1.2s" }}
    />
  );
}

/** Summary shell 이후 메뉴 데이터 대기 중 — 칩·목록 자리만 표시 */
export function StoreDetailMenusSkeleton() {
  return (
    <>
      <div className="mt-4 border-y border-neutral-100">
        <Shimmer className="h-[48px] w-full rounded-none" />
      </div>
      <div className="mt-2 px-4">
        <div className="flex gap-2 overflow-hidden">
          <Shimmer className="h-[34px] w-20 shrink-0 rounded-full" />
          <Shimmer className="h-[34px] w-24 shrink-0 rounded-full" />
          <Shimmer className="h-[34px] w-16 shrink-0 rounded-full" />
        </div>
      </div>
      <div className="mt-6 space-y-4 px-4">
        <Shimmer className="h-5 w-32 rounded" />
        {[1, 2, 3].map((k) => (
          <div key={k} className="flex gap-3 border-b border-neutral-100 py-3">
            <Shimmer className="h-24 w-24 shrink-0 rounded-[14px]" />
            <div className="flex-1 space-y-2">
              <Shimmer className="h-4 w-full rounded" />
              <Shimmer className="h-3 w-2/3 rounded" />
              <Shimmer className="h-4 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
