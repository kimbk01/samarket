"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeUnitTotal,
  validateOptionSelections,
} from "@/lib/stores/delivery-mock/cart-math";
import type { CartSelectedOption, DeliveryMenuItem, DeliveryMenuOptionGroup } from "@/lib/stores/delivery-mock/types";
import { formatMoneyPhp } from "@/lib/utils/format";

function defaultSelection(groups: DeliveryMenuOptionGroup[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const g of groups) {
    if (g.minSelect >= 1 && g.options[0]) {
      out[g.id] = [g.options[0].id];
    } else {
      out[g.id] = [];
    }
  }
  return out;
}

function toSelections(item: DeliveryMenuItem, selected: Record<string, string[]>): CartSelectedOption[] {
  return item.optionGroups.map((g) => {
    const ids = selected[g.id] ?? [];
    const opts = ids
      .map((oid) => g.options.find((o) => o.id === oid))
      .filter(Boolean)
      .map((o) => ({
        optionId: o!.id,
        name: o!.name,
        priceDelta: o!.priceDelta,
      }));
    return { groupId: g.id, groupNameKo: g.nameKo, options: opts };
  });
}

function toggleOption(
  group: DeliveryMenuOptionGroup,
  selected: Record<string, string[]>,
  optionId: string
): Record<string, string[]> {
  const cur = [...(selected[group.id] ?? [])];
  const idx = cur.indexOf(optionId);
  if (group.maxSelect === 1) {
    return { ...selected, [group.id]: [optionId] };
  }
  if (idx >= 0) {
    cur.splice(idx, 1);
  } else {
    if (cur.length >= group.maxSelect) cur.shift();
    cur.push(optionId);
  }
  return { ...selected, [group.id]: cur };
}

interface MenuCustomizeSheetProps {
  item: DeliveryMenuItem | null;
  onClose: () => void;
  onAddToCart: (quantity: number, selections: CartSelectedOption[]) => void;
}

export function MenuCustomizeSheet({ item, onClose, onAddToCart }: MenuCustomizeSheetProps) {
  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (item) {
      setQty(1);
      setSelected(defaultSelection(item.optionGroups));
    }
  }, [item]);

  const unitTotal = useMemo(() => {
    if (!item) return 0;
    return computeUnitTotal(item, selected);
  }, [item, selected]);

  if (!item) return null;

  const err = validateOptionSelections(item.optionGroups, selected);
  const canAdd = !err && !item.isSoldOut && qty >= 1;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/45" role="dialog" aria-modal>
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="max-h-[85vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="pr-4 text-base font-bold text-gray-900">{item.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
            aria-label="바텀시트 닫기"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[55vh] overflow-y-auto px-4 pb-4 pt-2">
          {item.description ? <p className="mb-3 text-sm text-gray-600">{item.description}</p> : null}
          {item.isSoldOut ? (
            <p className="mb-3 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600">품절</p>
          ) : null}

          {item.optionGroups.map((g) => (
            <div key={g.id} className="mb-4">
              <p className="mb-2 text-sm font-semibold text-gray-900">
                {g.nameKo}
                <span className="ml-1 text-xs font-normal text-gray-500">
                  {g.minSelect === g.maxSelect
                    ? `(${g.minSelect}개 선택)`
                    : `(${g.minSelect}~${g.maxSelect}개)`}
                </span>
              </p>
              <ul className="space-y-2">
                {g.options.map((o) => {
                  const sel = selected[g.id] ?? [];
                  const on = sel.includes(o.id);
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        disabled={item.isSoldOut}
                        onClick={() => setSelected((prev) => toggleOption(g, prev, o.id))}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm ${
                          on ? "border-signature bg-signature/5" : "border-gray-200 bg-white"
                        } ${item.isSoldOut ? "opacity-50" : ""}`}
                      >
                        <span className="text-gray-900">{o.name}</span>
                        <span className="text-gray-700">
                          {o.priceDelta > 0 ? `+${formatMoneyPhp(o.priceDelta)}` : formatMoneyPhp(0)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
            <span className="text-sm font-medium text-gray-800">수량</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={qty <= 1 || item.isSoldOut}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg disabled:opacity-40"
              >
                −
              </button>
              <span className="w-8 text-center text-base font-semibold">{qty}</span>
              <button
                type="button"
                disabled={qty >= 99 || item.isSoldOut}
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-lg disabled:opacity-40"
              >
                +
              </button>
            </div>
          </div>
          {err ? <p className="mt-2 text-xs text-red-600">{err}</p> : null}
        </div>

        <div className="border-t border-gray-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-gray-600">합계</span>
            <span className="text-lg font-bold text-gray-900">{formatMoneyPhp(unitTotal * qty)}</span>
          </div>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => {
              onAddToCart(qty, toSelections(item, selected));
              onClose();
            }}
            className="w-full rounded-xl bg-signature py-3.5 text-center text-sm font-bold text-white disabled:bg-gray-300"
          >
            장바구니 담기
          </button>
        </div>
      </div>
    </div>
  );
}
