"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ownerOrderTabLabel } from "@/lib/stores/owner-order-ui-labels";
import type { OwnerOrderTab } from "@/lib/store-owner/types";

const TAB_KEYS: OwnerOrderTab[] = ["all", "new", "active", "done", "issue"];

export function OwnerOrderTabs({
  active,
  onChange,
  counts,
}: {
  active: OwnerOrderTab;
  onChange: (t: OwnerOrderTab) => void;
  counts: Record<OwnerOrderTab, number>;
}) {
  const { language } = useI18n();
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TAB_KEYS.map((key) => {
        const on = active === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              on
                ? "bg-sam-ink text-white shadow-sm"
                : "bg-sam-surface text-sam-fg ring-1 ring-sam-border hover:bg-sam-app"
            }`}
          >
            {ownerOrderTabLabel(key, language)}
            <span className={`ml-1 tabular-nums ${on ? "text-white/80" : "text-sam-meta"}`}>
              {counts[key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
