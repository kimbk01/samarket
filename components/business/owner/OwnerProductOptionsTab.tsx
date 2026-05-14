"use client";

import {
  OWNER_STORE_FORM_GRID_2_CLASS,
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_SELECT_CLASS,
} from "@/lib/business/owner-store-stack";
import {
  emptyOptionGroup,
  emptyOptionRow,
  type ProductOptionGroup,
  type ProductOptionSelectionKind,
} from "@/lib/stores/owner-product-options-json";

type Props = {
  optionGroups: ProductOptionGroup[];
  onOptionGroupsChange: (fn: (prev: ProductOptionGroup[]) => ProductOptionGroup[]) => void;
  priceUnitLabel: string;
};

function setKindDefaults(
  kind: ProductOptionSelectionKind,
  required: boolean
): Pick<ProductOptionGroup, "minSelect" | "maxSelect"> {
  if (kind === "quantity") return { minSelect: "0", maxSelect: "3" };
  if (kind === "single") {
    return required ? { minSelect: "1", maxSelect: "1" } : { minSelect: "0", maxSelect: "1" };
  }
  return required ? { minSelect: "1", maxSelect: "99" } : { minSelect: "0", maxSelect: "99" };
}

export function OwnerProductOptionsTab({
  optionGroups,
  onOptionGroupsChange,
  priceUnitLabel,
}: Props) {
  return (
    <div className="space-y-2 px-2">
      <p className="sam-text-helper leading-relaxed text-sam-muted">
        옵션은 이 상품에 포함되는 선택 항목입니다. 옵션만 따로 저장되지 않으며, 하단 저장 버튼을 누르면 상품과
        함께 저장됩니다.
      </p>

      {optionGroups.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface py-6 text-center">
          <p className="sam-text-body-secondary text-sam-muted">옵션이 없습니다</p>
          <button
            type="button"
            aria-label="옵션그룹 추가"
            onClick={() => onOptionGroupsChange((prev) => [...prev, emptyOptionGroup()])}
            className="mt-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-sam-border bg-sam-surface sam-text-hero font-light leading-none text-sam-fg hover:bg-sam-app"
          >
            +
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {optionGroups.map((group, gi) => (
            <li
              key={group.groupLocalId}
              className="relative overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm"
            >
              <button
                type="button"
                aria-label="옵션 그룹 삭제"
                title="그룹 삭제"
                onClick={() => onOptionGroupsChange((prev) => prev.filter((_, j) => j !== gi))}
                className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full sam-text-page-title leading-none text-sam-meta hover:bg-sam-surface-muted hover:text-sam-fg"
              >
                ×
              </button>
              <div className="space-y-2 p-3 pr-12">
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                    옵션 그룹명
                  </label>
                  <input
                    value={group.nameKo}
                    onChange={(e) =>
                      onOptionGroupsChange((prev) => {
                        const next = [...prev];
                        next[gi] = { ...next[gi]!, nameKo: e.target.value };
                        return next;
                      })
                    }
                    placeholder="예) 매운맛 정도"
                    className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                  />
                </div>
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                    그룹 설명 (선택)
                  </label>
                  <input
                    value={group.description}
                    onChange={(e) =>
                      onOptionGroupsChange((prev) => {
                        const next = [...prev];
                        next[gi] = { ...next[gi]!, description: e.target.value };
                        return next;
                      })
                    }
                    className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                    placeholder="고객에게 보이는 안내"
                  />
                </div>
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                    노출 순서
                  </label>
                  <input
                    inputMode="numeric"
                    value={group.sortOrder}
                    onChange={(e) =>
                      onOptionGroupsChange((prev) => {
                        const next = [...prev];
                        next[gi] = { ...next[gi]!, sortOrder: e.target.value.replace(/\D/g, "") };
                        return next;
                      })
                    }
                    className={`${OWNER_STORE_PROFILE_CONTROL_CLASS} max-w-[100px]`}
                  />
                  <p className="mt-0.5 sam-text-xxs text-sam-muted">숫자가 작을수록 먼저 표시</p>
                </div>

                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                    선택 방식
                  </label>
                  <p className="mb-1 sam-text-xxs leading-snug text-sam-muted">
                    단일은 하나만 선택, 복수는 여러 개, 수량형은 같은 선택지의 개수를 고릅니다.
                  </p>
                  <select
                    value={group.selectionKind}
                    onChange={(e) => {
                      const kind = e.target.value as ProductOptionSelectionKind;
                      onOptionGroupsChange((prev) => {
                        const next = [...prev];
                        const cur = next[gi]!;
                        const mm = setKindDefaults(kind, cur.required);
                        next[gi] = { ...cur, selectionKind: kind, ...mm };
                        return next;
                      });
                    }}
                    className={OWNER_STORE_PROFILE_SELECT_CLASS}
                  >
                    <option value="single">단일 선택</option>
                    <option value="multiple">복수 선택</option>
                    <option value="quantity">수량형 선택</option>
                  </select>
                </div>

                <label className="flex cursor-pointer items-center gap-2 sam-text-body-secondary text-sam-fg">
                  <input
                    type="checkbox"
                    checked={group.required}
                    onChange={(e) => {
                      const required = e.target.checked;
                      onOptionGroupsChange((prev) => {
                        const next = [...prev];
                        const cur = next[gi]!;
                        let mm: Pick<ProductOptionGroup, "minSelect" | "maxSelect">;
                        if (cur.selectionKind === "single") {
                          mm = setKindDefaults("single", required);
                        } else if (cur.selectionKind === "multiple") {
                          mm = required
                            ? { minSelect: "1", maxSelect: cur.maxSelect }
                            : { minSelect: "0", maxSelect: cur.maxSelect };
                        } else {
                          mm = { minSelect: cur.minSelect, maxSelect: cur.maxSelect };
                        }
                        next[gi] = { ...cur, required, ...mm };
                        return next;
                      });
                    }}
                    className="h-4 w-4 rounded border-sam-border"
                  />
                  필수
                </label>

                {(group.selectionKind === "multiple" ||
                  group.selectionKind === "quantity" ||
                  (group.selectionKind === "single" && !group.required)) && (
                  <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
                    <div>
                      <label className="mb-0.5 block sam-text-xxs text-sam-muted">최소 선택 수</label>
                      <input
                        inputMode="numeric"
                        value={group.minSelect}
                        onChange={(e) =>
                          onOptionGroupsChange((prev) => {
                            const next = [...prev];
                            next[gi] = { ...next[gi]!, minSelect: e.target.value };
                            return next;
                          })
                        }
                        className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                      />
                    </div>
                    <div>
                      <label className="mb-0.5 block sam-text-xxs text-sam-muted">최대 선택 수</label>
                      <input
                        inputMode="numeric"
                        value={group.maxSelect}
                        onChange={(e) =>
                          onOptionGroupsChange((prev) => {
                            const next = [...prev];
                            next[gi] = { ...next[gi]!, maxSelect: e.target.value };
                            return next;
                          })
                        }
                        className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                      />
                    </div>
                  </div>
                )}

                {group.selectionKind === "single" && group.required ? (
                  <p className="sam-text-xxs text-sam-muted">필수 단일 선택: 고객은 반드시 1개를 고릅니다.</p>
                ) : null}

                <p className="sam-text-xxs font-medium text-sam-muted">
                  선택지 (이름 · 추가 금액 · 품절 · 기본 선택)
                </p>
                <ul className="space-y-2">
                  {group.options.map((opt, oi) => (
                    <li
                      key={opt.id}
                      className="flex flex-col gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-app/80 p-2"
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <input
                          value={opt.name}
                          onChange={(e) =>
                            onOptionGroupsChange((prev) => {
                              const next = [...prev];
                              const g = { ...next[gi]! };
                              const opts = [...g.options];
                              opts[oi] = { ...opts[oi]!, name: e.target.value };
                              g.options = opts;
                              next[gi] = g;
                              return next;
                            })
                          }
                          placeholder="예: 순한맛, 보통"
                          className="min-w-[120px] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-body text-sam-fg"
                        />
                        <div className="flex items-center gap-1">
                          <span className="sam-text-helper text-sam-muted">+</span>
                          <input
                            inputMode="numeric"
                            value={opt.priceDelta}
                            onChange={(e) =>
                              onOptionGroupsChange((prev) => {
                                const next = [...prev];
                                const g = { ...next[gi]! };
                                const opts = [...g.options];
                                opts[oi] = { ...opts[oi]!, priceDelta: e.target.value };
                                g.options = opts;
                                next[gi] = g;
                                return next;
                              })
                            }
                            className="w-[4.5rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-body text-sam-fg"
                          />
                          <span className="sam-text-helper text-sam-muted">{priceUnitLabel}</span>
                        </div>
                        <button
                          type="button"
                          aria-label="선택지 삭제"
                          onClick={() =>
                            onOptionGroupsChange((prev) => {
                              const next = [...prev];
                              const g = { ...next[gi]! };
                              g.options = g.options.filter((_, j) => j !== oi);
                              if (g.options.length === 0) g.options = [emptyOptionRow()];
                              next[gi] = g;
                              return next;
                            })
                          }
                          className="shrink-0 rounded-full border border-red-100 bg-red-50 px-2.5 py-1 sam-text-helper text-red-700"
                        >
                          삭제
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 sam-text-helper text-sam-fg">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={opt.soldOut}
                            onChange={(e) =>
                              onOptionGroupsChange((prev) => {
                                const next = [...prev];
                                const g = { ...next[gi]! };
                                const opts = [...g.options];
                                const sold = e.target.checked;
                                opts[oi] = {
                                  ...opts[oi]!,
                                  soldOut: sold,
                                  defaultSelected: sold ? false : opts[oi]!.defaultSelected,
                                };
                                g.options = opts;
                                next[gi] = g;
                                return next;
                              })
                            }
                            className="h-4 w-4 rounded border-sam-border"
                          />
                          품절
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={opt.defaultSelected}
                            disabled={opt.soldOut}
                            onChange={(e) =>
                              onOptionGroupsChange((prev) => {
                                const next = [...prev];
                                const g = { ...next[gi]! };
                                const opts = [...g.options];
                                const checked = e.target.checked;
                                if (g.selectionKind === "single" && checked) {
                                  for (let j = 0; j < opts.length; j++) {
                                    opts[j] = { ...opts[j]!, defaultSelected: j === oi };
                                  }
                                } else {
                                  opts[oi] = { ...opts[oi]!, defaultSelected: checked };
                                }
                                g.options = opts;
                                next[gi] = g;
                                return next;
                              })
                            }
                            className="h-4 w-4 rounded border-sam-border"
                          />
                          기본 선택
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    aria-label="선택지 추가"
                    onClick={() =>
                      onOptionGroupsChange((prev) => {
                        const next = [...prev];
                        const g = { ...next[gi]! };
                        g.options = [...g.options, emptyOptionRow()];
                        next[gi] = g;
                        return next;
                      })
                    }
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sam-border bg-sam-surface sam-text-page-title font-light leading-none text-sam-fg hover:bg-sam-app"
                  >
                    +
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {optionGroups.length > 0 ? (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            aria-label="옵션그룹 추가"
            onClick={() => onOptionGroupsChange((prev) => [...prev, emptyOptionGroup()])}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-sam-border bg-sam-surface sam-text-hero font-light leading-none text-sam-muted hover:border-sam-border hover:bg-sam-app"
          >
            +
          </button>
        </div>
      ) : null}
    </div>
  );
}
