"use client";

export function StoreProductSheetOptionsSkeleton() {
  return (
    <div className="border-t-[8px] border-[#EDEDED] px-4 py-4">
      <div className="mb-3 h-4 w-28 animate-pulse rounded bg-neutral-200/90" />
      <div className="space-y-3">
        {[1, 2].map((k) => (
          <div key={k} className="rounded-[12px] border border-neutral-100 bg-neutral-50/80 p-3">
            <div className="h-3 w-24 animate-pulse rounded bg-neutral-200/80" />
            <div className="mt-3 flex flex-wrap gap-2">
              <div className="h-9 w-16 animate-pulse rounded-full bg-neutral-200/70" />
              <div className="h-9 w-20 animate-pulse rounded-full bg-neutral-200/70" />
              <div className="h-9 w-14 animate-pulse rounded-full bg-neutral-200/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StoreProductSheetBodySkeleton() {
  return (
    <div className="pb-3">
      <div className="relative aspect-[16/10] max-h-[200px] min-h-[160px] w-full overflow-hidden bg-neutral-100">
        <div className="h-full w-full animate-pulse bg-neutral-200/60" />
      </div>
      <div className="bg-white px-4 pb-3 pt-3">
        <div className="h-7 w-4/5 animate-pulse rounded bg-neutral-200/90" />
        <div className="mt-3 h-4 w-32 animate-pulse rounded bg-neutral-100" />
      </div>
    </div>
  );
}
