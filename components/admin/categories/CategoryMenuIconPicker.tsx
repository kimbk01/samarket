"use client";

import { CategoryIcon } from "@/components/home/CategoryIcon";
import { COMMUNITY_SKIN_OPTIONS, TRADE_SUBTYPE_OPTIONS } from "@/lib/types/category";

const TRADE_TILE_EMOJI: Record<string, string> = {
  general: "📦",
  "used-car": "🚗",
  "real-estate": "🏠",
  jobs: "💼",
  exchange: "💱",
};

const COMMUNITY_TILE_EMOJI: Record<string, string> = {
  basic: "💬",
  gallery: "🖼",
  magazine: "📰",
};

interface CategoryMenuIconPickerProps {
  variant: "trade" | "community";
  value: string;
  onChange: (iconKey: string) => void;
}

/** 메뉴 관리 폼: 런처·칩에 쓰일 아이콘을 타일로 선택 (이모지 + 라인 아이콘 미리보기) */
export function CategoryMenuIconPicker({ variant, value, onChange }: CategoryMenuIconPickerProps) {
  if (variant === "trade") {
    const presets = TRADE_SUBTYPE_OPTIONS.filter((o) => o.value !== "__custom__");
    return (
      <div className="space-y-2">
        <p className="text-[12px] font-medium text-gray-600">아이콘·종류 빠른 선택</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {presets.map((o) => {
            const selected = value === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={`flex flex-col items-center gap-1 rounded-ui-rect border px-2 py-2.5 text-center transition-colors ${
                  selected
                    ? "border-signature bg-signature/5 ring-1 ring-signature/30"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <span className="text-[20px] leading-none" aria-hidden>
                  {TRADE_TILE_EMOJI[o.value] ?? "📌"}
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-neutral-700">
                  <CategoryIcon iconKey={o.value} className="size-[18px] text-current" />
                </span>
                <span className="line-clamp-2 text-[10px] font-medium leading-tight text-gray-800">{o.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-gray-500">「추가(직접 입력)」은 아래 종류 드롭다운에서 선택하세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-medium text-gray-600">게시판 스킨·아이콘 빠른 선택</p>
      <div className="grid grid-cols-3 gap-2">
        {COMMUNITY_SKIN_OPTIONS.map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`flex flex-col items-center gap-1 rounded-ui-rect border px-2 py-2.5 text-center transition-colors ${
                selected
                  ? "border-signature bg-signature/5 ring-1 ring-signature/30"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className="text-[20px] leading-none" aria-hidden>
                {COMMUNITY_TILE_EMOJI[o.value] ?? "💬"}
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-neutral-700">
                <CategoryIcon iconKey={o.value} className="size-[18px] text-current" />
              </span>
              <span className="text-[10px] font-medium text-gray-800">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
