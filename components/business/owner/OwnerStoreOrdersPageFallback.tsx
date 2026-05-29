"use client";

/** Suspense fallback — body skeleton only; shell owns the header */
export function OwnerStoreOrdersPageFallback() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--biz-app-bg)] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
      <div className="min-h-0 flex-1 animate-pulse pt-2">
        <div className="h-11 rounded-[4px] bg-white" />
        <div className="mt-2 space-y-2">
          <div className="h-24 rounded-[4px] bg-white" />
          <div className="h-24 rounded-[4px] bg-white" />
        </div>
      </div>
    </div>
  );
}
