"use client";

import type { MyProductFilterKey } from "@/lib/products/status-utils";
import { MY_PRODUCT_FILTER_OPTIONS } from "@/lib/products/status-utils";
import {
  APP_TOP_MENU_ROW1_ACTIVE,
  APP_TOP_MENU_ROW1_BASE,
  APP_TOP_MENU_ROW1_INACTIVE,
} from "@/lib/ui/app-top-menu";

interface MyProductFilterProps {
  value: MyProductFilterKey;
  onChange: (value: MyProductFilterKey) => void;
}

export function MyProductFilter({ value, onChange }: MyProductFilterProps) {
  return (
    <div className="sam-tabs sam-tabs--scroll mb-3">
      {MY_PRODUCT_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`${APP_TOP_MENU_ROW1_BASE} ${
            value === opt.value ? APP_TOP_MENU_ROW1_ACTIVE : APP_TOP_MENU_ROW1_INACTIVE
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
