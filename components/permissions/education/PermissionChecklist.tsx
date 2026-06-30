"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import type { PermissionCapabilityItem } from "@/lib/permissions/education/permission-education-types";

type Props = {
  items: PermissionCapabilityItem[];
  onItemAction?: (item: PermissionCapabilityItem) => void;
};

export function PermissionChecklist({ items, onItemAction }: Props) {
  const { safeT } = useI18n();

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={`flex w-full items-start gap-3 rounded-ui-rect border border-sam-border px-3 py-3 text-left ${
              item.pass ? "bg-sam-surface" : "bg-sam-surface/80"
            }`}
            onClick={() => onItemAction?.(item)}
          >
            <span className="mt-0.5 text-base" aria-hidden>
              {item.pass ? "✅" : "❌"}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block ${Sam.text.body} text-sam-fg`}>
                {safeT(item.labelKey, {
                  fallbackKo: "권한 항목",
                  fallbackEn: "Permission item",
                })}
              </span>
              {item.detailKey ? (
                <span className={`mt-1 block ${Sam.text.helper} text-sam-muted`}>
                  {safeT(item.detailKey, {
                    fallbackKo: "설정에서 확인해 주세요.",
                    fallbackEn: "Check this in Settings.",
                  })}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
