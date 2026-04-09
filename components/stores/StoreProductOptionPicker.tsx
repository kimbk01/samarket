"use client";

import type { ParsedOptionGroup } from "@/lib/stores/product-line-options";
import { formatMoneyPhp } from "@/lib/utils/format";

type Props = {
  groups: ParsedOptionGroup[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  disabled?: boolean;
};

/** 배달 샘플과 동일: 전폭 버튼 + 선택 시 signature 테두리 */
export function StoreProductOptionPicker({ groups, value, onChange, disabled }: Props) {
  if (groups.length === 0) return null;

  const setGroup = (key: string, names: string[]) => {
    onChange({ ...value, [key]: names });
  };

  const effMin = (g: (typeof groups)[0]) => (g.isRequired ? Math.max(g.minSelect, 1) : g.minSelect);

  const toggleMulti = (
    key: string,
    name: string,
    maxSelect: number,
    minSelect: number,
    current: string[]
  ) => {
    const has = current.includes(name);
    let next: string[];
    if (has) {
      if (current.length <= minSelect) return;
      next = current.filter((n) => n !== name);
    } else if (current.length >= maxSelect) {
      if (maxSelect <= 1) next = [name];
      else next = [...current.slice(0, maxSelect - 1), name];
    } else {
      next = [...current, name];
    }
    setGroup(key, next);
  };

  const btnBase =
    "flex w-full items-center justify-between rounded-ui-rect border px-3 py-2.5 text-left text-sm transition-colors";
  const btnOn = "border-signature bg-signature/5 text-gray-900";
  const btnOff = "border-gray-200 bg-white text-gray-900";

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const selected = value[g.key] ?? [];
        const single = g.maxSelect <= 1;
        const rangeHint =
          g.minSelect === g.maxSelect
            ? `(${g.minSelect}개 선택)`
            : g.minSelect > 0
              ? `(${g.minSelect}~${g.maxSelect}개)`
              : `(선택, 최대 ${g.maxSelect}개)`;

        return (
          <div key={g.key}>
            <p className="mb-2 text-sm font-semibold text-gray-900">
              {g.label}
              <span className="ml-1 text-xs font-normal text-gray-500">{rangeHint}</span>
            </p>
            <ul className="space-y-2">
              {g.options.map((opt) => {
                const checked = selected.includes(opt.name);
                const delta =
                  opt.priceDelta > 0
                    ? `+${formatMoneyPhp(opt.priceDelta)}`
                    : opt.priceDelta < 0
                      ? formatMoneyPhp(opt.priceDelta)
                      : formatMoneyPhp(0);

                if (single) {
                  return (
                    <li key={opt.name}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        disabled={disabled}
                        onClick={() => !disabled && setGroup(g.key, [opt.name])}
                        className={`${btnBase} ${checked ? btnOn : btnOff} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                      >
                        <span>{opt.name}</span>
                        <span className="shrink-0 text-gray-700">{delta}</span>
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={opt.name}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      disabled={disabled}
                      onClick={() =>
                        !disabled && toggleMulti(g.key, opt.name, g.maxSelect, effMin(g), selected)
                      }
                      className={`${btnBase} ${checked ? btnOn : btnOff} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <span>{opt.name}</span>
                      <span className="shrink-0 text-gray-700">{delta}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
