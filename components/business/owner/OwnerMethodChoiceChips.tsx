"use client";

import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

/**
 * 사장님 돈 화면 수단 선택(입금 수단·출금 수단) — 화면 안 선택 칩 (Owner 2026-11-04).
 * 네이티브 `<select>` 는 Android 앱에서 라디오 목록 팝업으로 떠서 어색함 → 선택지 2~3개는 펼쳐 둔 칩으로 고른다.
 * 겉모양은 팝업 SSOT `OverlayUi.chip` (선택됨 = `aria-checked`).
 */
export function OwnerMethodChoiceChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
  dataAttr,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** 실기·테스트 식별용 data 속성 이름 (예: `data-owner-bc-topup-method`) */
  dataAttr?: string;
}) {
  const dataProps = dataAttr ? { [dataAttr]: "1" } : {};
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2" {...dataProps}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            className={`${OverlayUi.chip} min-w-[6rem]`}
            data-method={o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
