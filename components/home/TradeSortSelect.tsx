"use client";

import type { CSSProperties } from "react";
import type { SortKey } from "@/lib/constants/sort";
import { SORT_OPTIONS } from "@/lib/constants/sort";

interface TradeSortSelectProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
  id?: string;
  /** 동네생활 피드 정렬 셀렉트와 동일 톤(마켓 2행 좌측) */
  variant?: "default" | "community";
}

const COMMUNITY_SELECT_CLASS =
  "w-max max-w-full appearance-none rounded-md border border-gray-300 bg-gray-100 py-1 pl-1 pr-5 text-[13px] font-semibold text-gray-900 shadow-none outline-none focus:border-gray-500 focus:ring-0";

const COMMUNITY_SELECT_STYLE: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='4' viewBox='0 0 7 4'%3E%3Cpath fill='%236b7280' d='M0 0h7L3.5 4z'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 4px center",
  backgroundSize: "7px 4px",
  fieldSizing: "content",
};

/** 홈·마켓 피드 정렬 (칩 행 대신 컴팩트 셀렉트) */
export function TradeSortSelect({ value, onChange, id, variant = "default" }: TradeSortSelectProps) {
  return (
    <select
      id={id}
      value={value}
      aria-label="정렬"
      onChange={(e) => onChange(e.target.value as SortKey)}
      className={
        variant === "community"
          ? COMMUNITY_SELECT_CLASS
          : "w-full max-w-[11rem] rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-9 text-[13px] font-semibold text-gray-800 shadow-sm"
      }
      style={variant === "community" ? COMMUNITY_SELECT_STYLE : undefined}
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.key} value={opt.key}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
