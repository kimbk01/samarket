"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse bg-gradient-to-r from-neutral-200/80 via-neutral-100/90 to-neutral-200/80 bg-[length:200%_100%] ${className}`}
      style={{ animationDuration: "1.2s" }}
    />
  );
}

export function StoreDetailOrderSkeleton() {
  const { t } = useI18n();
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-white pb-8 [-webkit-overflow-scrolling:touch]">
      <div className="pt-[env(safe-area-inset-top,0px)]">
        <div className="flex h-14 items-center justify-between px-4">
          <Shimmer className="h-10 w-10 rounded-full" />
          <Shimmer className="h-4 w-24 rounded" />
          <div className="flex gap-1">
            <Shimmer className="h-10 w-10 rounded-full" />
            <Shimmer className="h-10 w-10 rounded-full" />
          </div>
        </div>
      </div>
      <Shimmer className="relative mt-0 h-[clamp(12.5rem,44vh,17.75rem)] min-h-[200px] w-full" />
      <div className="mx-4 -mt-7 rounded-[20px] bg-white p-4 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
        <Shimmer className="h-7 w-3/4 rounded" />
        <Shimmer className="mt-3 h-4 w-1/2 rounded" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Shimmer className="h-10 rounded-lg" />
          <Shimmer className="h-10 rounded-lg" />
          <Shimmer className="h-10 rounded-lg" />
        </div>
        <Shimmer className="mt-4 h-9 w-full rounded-full" />
      </div>
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
    </div>
  );
}
