"use client";

import { useMemo, useState } from "react";
import type { ModifierSelectionsWire, ParsedOptionGroup } from "@/lib/stores/modifiers/types";
import { sortModifierGroupsForCustomerUi } from "@/lib/stores/modifiers/sort-for-ui";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  STORE_ORDER_BADGE_OPTIONAL,
  STORE_ORDER_BADGE_REQUIRED,
  STORE_ORDER_BRAND,
  STORE_ORDER_CTA_STEPPER,
} from "@/components/stores/store-order-detail/store-order-brand";

function deltaLabel(n: number): string {
  if (n === 0) return formatMoneyPhp(0);
  if (n > 0) return `+${formatMoneyPhp(n)}`;
  return formatMoneyPhp(n);
}

type Props = {
  groups: ParsedOptionGroup[];
  value: ModifierSelectionsWire;
  onChange: (next: ModifierSelectionsWire) => void;
  disabled?: boolean;
  /** 장바구니 시트: 페이스북형 리스트·포커스 블루 */
  variant?: "default" | "sheet";
};

export function StoreModifierPicker({ groups, value, onChange, disabled, variant = "default" }: Props) {
  const sorted = useMemo(() => sortModifierGroupsForCustomerUi(groups), [groups]);
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});

  const setPick = (key: string, names: string[]) => {
    onChange({ ...value, pick: { ...value.pick, [key]: names } });
  };

  const setQty = (gKey: string, itemKey: string, nextQty: number) => {
    const g = groups.find((x) => x.key === gKey);
    if (!g) return;
    const cap = effectiveMaxSelect(g);
    const prev = { ...(value.qty[gKey] ?? {}) };
    const othersSum = Object.entries(prev).reduce(
      (s, [k, v]) => s + (k === itemKey ? 0 : Math.floor(Number(v) || 0)),
      0
    );
    const maxForThis = Math.max(0, cap - othersSum);
    const n = Math.max(0, Math.min(maxForThis, Math.floor(nextQty)));
    if (n <= 0) delete prev[itemKey];
    else prev[itemKey] = n;
    const nextQtyMap = { ...value.qty };
    if (Object.keys(prev).length === 0) delete nextQtyMap[gKey];
    else nextQtyMap[gKey] = prev;
    onChange({ ...value, qty: nextQtyMap });
  };

  const toggleMulti = (
    key: string,
    name: string,
    maxSelect: number,
    minSelect: number,
    current: string[]
  ) => {
    const opt = groups.find((g) => g.key === key)?.options.find((o) => o.name === name);
    if (opt?.soldOut) return;
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
    setPick(key, next);
  };

  if (sorted.length === 0) return null;

  if (variant === "sheet") {
    return (
      <div className="space-y-0">
        {sorted.map((g, gi) => {
          const required = g.isRequired || g.minSelect > 0;
          const maxS = effectiveMaxSelect(g);
          const minS = effectiveMinSelect(g);
          const rangeHint =
            g.inputType === "quantity"
              ? `(0~${maxS}개)`
              : minS === maxS
                ? `(${minS}개)`
                : minS > 0
                  ? `(${minS}~${maxS}개)`
                  : `(최대 ${maxS}개)`;

          const single = g.inputType === "radio" || g.inputType === "select" || maxS <= 1;

          return (
            <section
              key={g.key}
              className={gi > 0 ? "border-t-[8px] border-[#EDEDED] bg-white" : "bg-white"}
            >
              <div className="px-4 pb-2 pt-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-extrabold tracking-[-0.025em] text-neutral-900">{g.label}</h3>
                  {required ? (
                    <span className={STORE_ORDER_BADGE_REQUIRED}>필수</span>
                  ) : (
                    <span className={STORE_ORDER_BADGE_OPTIONAL}>선택 {rangeHint}</span>
                  )}
                </div>
                {g.description ? (
                  <p className="mt-1 text-[12px] font-medium leading-snug text-neutral-500">{g.description}</p>
                ) : null}
              </div>
              {g.inputType === "quantity" ? (
                <ul className="divide-y divide-neutral-100 px-4">
                  {g.options.map((opt) => {
                    const q = Math.floor(value.qty[g.key]?.[opt.key] ?? 0);
                    const prev = value.qty[g.key] ?? {};
                    const othersSum = Object.entries(prev).reduce(
                      (s, [k, v]) => s + (k === opt.key ? 0 : Math.floor(Number(v) || 0)),
                      0
                    );
                    const maxForThis = Math.max(0, maxS - othersSum);
                    const dim = disabled || opt.soldOut;
                    const groupSum = g.options.reduce(
                      (acc, it) => acc + Math.floor(Number(prev[it.key] ?? 0)),
                      0
                    );
                    const blockDec = q > 0 && groupSum - 1 < minS;
                    return (
                      <li key={opt.key} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-bold text-neutral-900">{opt.name}</p>
                          <p className="mt-0.5 text-[12px] font-semibold tabular-nums text-neutral-700">
                            {deltaLabel(opt.priceDelta)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={dim || q <= 0 || blockDec}
                            onClick={() => setQty(g.key, opt.key, q - 1)}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center text-base font-bold leading-none ${STORE_ORDER_CTA_STEPPER}`}
                          >
                            −
                          </button>
                          <span className="min-w-[1.25rem] text-center text-[15px] font-bold tabular-nums">{q}</span>
                          <button
                            type="button"
                            disabled={dim || q >= maxForThis}
                            onClick={() => setQty(g.key, opt.key, q + 1)}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center text-base font-bold leading-none ${STORE_ORDER_CTA_STEPPER}`}
                          >
                            +
                          </button>
                        </div>
                        {opt.soldOut ? (
                          <span className="sam-text-xxs font-medium text-amber-700">품절</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="divide-y divide-neutral-100 px-4">
                  {g.options.map((opt) => {
                    const selected = (value.pick[g.key] ?? []).includes(opt.name);
                    const dim = disabled || opt.soldOut;
                    if (single) {
                      return (
                        <li key={opt.key}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            disabled={dim}
                            onClick={() => {
                              if (dim) return;
                              if (selected && minS >= 1) return;
                              setPick(g.key, [opt.name]);
                            }}
                            className={`flex w-full touch-manipulation items-center gap-3 py-3 text-left transition-colors active:bg-neutral-50 ${
                              selected ? "bg-white" : "hover:bg-neutral-50"
                            } ${dim ? "cursor-not-allowed opacity-45" : ""}`}
                          >
                            <span
                              className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 bg-white"
                              style={{
                                borderColor: selected ? STORE_ORDER_BRAND.accent : "#CCD0D5",
                              }}
                            >
                              {selected ? (
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: STORE_ORDER_BRAND.accent }}
                                />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1 text-[14px] font-bold text-neutral-900">{opt.name}</span>
                            <span
                              className="shrink-0 text-[13px] font-extrabold tabular-nums text-neutral-900"
                            >
                              {deltaLabel(opt.priceDelta)}
                            </span>
                          </button>
                          {opt.soldOut ? (
                            <p className="px-3 pb-2 sam-text-xxs text-amber-700">품절</p>
                          ) : null}
                        </li>
                      );
                    }
                    return (
                      <li key={opt.key}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          disabled={dim}
                          onClick={() =>
                            !dim && toggleMulti(g.key, opt.name, maxS, minS, value.pick[g.key] ?? [])
                          }
                          className={`flex w-full touch-manipulation items-center gap-3 py-3 text-left transition-colors active:bg-neutral-50 ${
                            selected ? "bg-white" : "hover:bg-neutral-50"
                          } ${dim ? "cursor-not-allowed opacity-45" : ""}`}
                        >
                          <span
                            className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border bg-white text-[11px] font-bold leading-none"
                            style={{
                              borderColor: selected ? STORE_ORDER_BRAND.accent : "#CCD0D5",
                              color: selected ? "#fff" : "transparent",
                              backgroundColor: selected ? STORE_ORDER_BRAND.accent : "white",
                            }}
                          >
                            {selected ? "✓" : ""}
                          </span>
                          <span className="min-w-0 flex-1 text-[14px] font-bold text-neutral-900">{opt.name}</span>
                          <span
                            className="shrink-0 text-[13px] font-extrabold tabular-nums text-neutral-900"
                          >
                            {deltaLabel(opt.priceDelta)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((g) => {
        const required = g.isRequired || g.minSelect > 0;
        const maxS = effectiveMaxSelect(g);
        const minS = effectiveMinSelect(g);
        const rangeHint =
          g.inputType === "quantity"
            ? `(0~${maxS}개)`
            : minS === maxS
              ? `(${minS}개 선택)`
              : minS > 0
                ? `(${minS}~${maxS}개)`
                : `(선택, 최대 ${maxS}개)`;

        const isOpen = openKeys[g.key] ?? (required || sorted.length <= 4);
        const single = g.inputType === "radio" || g.inputType === "select" || maxS <= 1;

        const header = (
          <div className="flex flex-wrap items-center gap-2">
            <span className="sam-text-body font-semibold text-sam-fg">{g.label}</span>
            {required ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 sam-text-xxs font-bold text-rose-800">
                필수
              </span>
            ) : (
              <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-medium text-sam-muted">
                선택
              </span>
            )}
            <span className="sam-text-helper text-sam-muted">{rangeHint}</span>
          </div>
        );

        const body = (
          <div className="mt-2 space-y-2">
            {g.description ? <p className="sam-text-helper text-sam-muted">{g.description}</p> : null}
            {g.inputType === "quantity" ? (
              <ul className="space-y-3">
                {g.options.map((opt) => {
                  const q = Math.floor(value.qty[g.key]?.[opt.key] ?? 0);
                  const prev = value.qty[g.key] ?? {};
                  const othersSum = Object.entries(prev).reduce(
                    (s, [k, v]) => s + (k === opt.key ? 0 : Math.floor(Number(v) || 0)),
                    0
                  );
                  const maxForThis = Math.max(0, maxS - othersSum);
                  const groupSum = g.options.reduce(
                    (acc, it) => acc + Math.floor(Number(prev[it.key] ?? 0)),
                    0
                  );
                  const blockDec = q > 0 && groupSum - 1 < minS;
                  return (
                    <li
                      key={opt.key}
                      className="flex items-center justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="sam-text-body font-medium text-sam-fg">{opt.name}</p>
                        <p className="sam-text-body-secondary text-sam-muted">{deltaLabel(opt.priceDelta)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={disabled || opt.soldOut || q <= 0 || blockDec}
                          onClick={() => setQty(g.key, opt.key, q - 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-ui-rect border border-sam-border text-lg leading-none text-sam-fg disabled:opacity-40"
                        >
                          −
                        </button>
                        <span className="min-w-[1.5rem] text-center sam-text-body font-semibold">{q}</span>
                        <button
                          type="button"
                          disabled={disabled || opt.soldOut || q >= maxForThis}
                          onClick={() => setQty(g.key, opt.key, q + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-ui-rect border border-sam-border text-lg leading-none text-sam-fg disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                      {opt.soldOut ? (
                        <span className="sam-text-xxs font-medium text-amber-700">품절</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-2">
                {g.options.map((opt) => {
                  const selected = (value.pick[g.key] ?? []).includes(opt.name);
                  const btnBase =
                    "flex w-full items-center justify-between rounded-ui-rect border px-3 py-3 text-left transition-colors";
                  const btnOn = "border-signature bg-signature/5 text-sam-fg";
                  const btnOff = "border-sam-border bg-sam-surface text-sam-fg";
                  const dim = disabled || opt.soldOut;
                  if (single) {
                    return (
                      <li key={opt.key}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={dim}
                          onClick={() => {
                            if (dim) return;
                            if (selected && minS >= 1) return;
                            setPick(g.key, [opt.name]);
                          }}
                          className={`${btnBase} ${selected ? btnOn : btnOff} ${dim ? "cursor-not-allowed opacity-45" : ""}`}
                        >
                          <span className="sam-text-body font-medium">{opt.name}</span>
                          <span className="shrink-0 sam-text-body font-semibold text-sam-fg">
                            {deltaLabel(opt.priceDelta)}
                          </span>
                        </button>
                        {opt.soldOut ? (
                          <p className="mt-0.5 sam-text-xxs text-amber-700">품절 · 선택 불가</p>
                        ) : null}
                      </li>
                    );
                  }
                  return (
                    <li key={opt.key}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={dim}
                        onClick={() => !dim && toggleMulti(g.key, opt.name, maxS, minS, value.pick[g.key] ?? [])}
                        className={`${btnBase} ${selected ? btnOn : btnOff} ${dim ? "cursor-not-allowed opacity-45" : ""}`}
                      >
                        <span className="sam-text-body font-medium">{opt.name}</span>
                        <span className="shrink-0 sam-text-body font-semibold text-sam-fg">
                          {deltaLabel(opt.priceDelta)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );

        if (sorted.length > 5) {
          return (
            <details
              key={g.key}
              open={isOpen}
              className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 shadow-sm"
              onToggle={(e) => {
                const el = e.currentTarget;
                setOpenKeys((k) => ({ ...k, [g.key]: el.open }));
              }}
            >
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                {header}
              </summary>
              {body}
            </details>
          );
        }

        return (
          <section key={g.key} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface p-3 shadow-sm">
            {header}
            {body}
          </section>
        );
      })}
    </div>
  );
}

function effectiveMinSelect(g: ParsedOptionGroup): number {
  if (g.isRequired) return Math.max(g.minSelect, 1);
  return g.minSelect;
}

function effectiveMaxSelect(g: ParsedOptionGroup): number {
  return Math.max(g.maxSelect, effectiveMinSelect(g));
}
