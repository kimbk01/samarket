"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function StoreProductSheetOptionsSkeleton() {
  const { t } = useI18n();
  return (
    <div className="border-t-[8px] border-sam-surface-muted px-4 py-4">
      <div className="mb-3 h-4 w-28 animate-pulse rounded bg-sam-border-soft" />
      <div className="space-y-3">
        {[1, 2].map((k) => (
          <div key={k} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface-muted p-3">
            <div className="h-3 w-24 animate-pulse rounded bg-sam-border-soft" />
            <div className="mt-3 flex flex-wrap gap-2">
              <div className="h-9 w-16 animate-pulse rounded-full bg-sam-border-soft" />
              <div className="h-9 w-20 animate-pulse rounded-full bg-sam-border-soft" />
              <div className="h-9 w-14 animate-pulse rounded-full bg-sam-border-soft" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StoreProductSheetBodySkeleton() {
  const { t } = useI18n();
  return (
    <div className="pb-3">
      <div className="relative aspect-[16/10] max-h-[200px] min-h-[160px] w-full overflow-hidden bg-sam-surface-muted">
        <div className="h-full w-full animate-pulse bg-sam-border-soft" />
      </div>
      <div className="bg-white px-4 pb-3 pt-3">
        <div className="h-7 w-4/5 animate-pulse rounded bg-sam-border-soft" />
        <div className="mt-3 h-4 w-32 animate-pulse rounded bg-sam-surface-muted" />
      </div>
    </div>
  );
}
