"use client";

import type { ReactNode } from "react";
import { useId, useState } from "react";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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

type OptionBadgeVariant = "option" | "group";

const OPTION_ADD_BADGE_VARIANT_CLASS: Record<OptionBadgeVariant, string> = {
  option:
    "border-signature/28 bg-signature/10 text-signature hover:border-signature/40 hover:bg-signature/16",
  group:
    "border-sam-border bg-sam-app text-sam-fg hover:border-sam-border hover:bg-sam-border-soft/60",
};

function OptionAddBadgeButton({
  children,
  onClick,
  "aria-label": ariaLabel,
  variant = "option",
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  "aria-label": string;
  variant?: OptionBadgeVariant;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={
        "inline-flex touch-manipulation select-none items-center gap-1.5 rounded-[4px] border px-3.5 py-2 shadow-sm transition-[transform,box-shadow,background-color,border-color] sam-text-body-secondary font-semibold active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 " +
        OPTION_ADD_BADGE_VARIANT_CLASS[variant] +
        " " +
        className
      }
    >
      <span aria-hidden className="text-[1.1rem] font-semibold leading-none">
        +
      </span>
      {children}
    </button>
  );
}

function OptionGroupDeleteBadgeButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      aria-label={t("business_phase7_217")}
      onClick={onClick}
      className={
        "inline-flex touch-manipulation select-none items-center rounded-[4px] border border-red-200/90 bg-red-50 px-3.5 py-2 shadow-sm transition-[transform,box-shadow,background-color] sam-text-body-secondary font-semibold text-red-800 hover:border-red-300 hover:bg-red-100 active:scale-[0.98]"
      }
    >
      {t("common_delete")}
    </button>
  );
}

type Props = {
  optionGroups: ProductOptionGroup[];
  onOptionGroupsChange: (fn: (prev: ProductOptionGroup[]) => ProductOptionGroup[]) => void;
  priceUnitLabel: string;
};

type OptionDeleteConfirm =
  | null
  | { kind: "optionRow"; gi: number; oi: number }
  | { kind: "optionGroup"; gi: number };

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
  const { t } = useI18n();
  const optionDeleteTitleId = useId();
  const [deleteConfirm, setDeleteConfirm] = useState<OptionDeleteConfirm>(null);

  const applyConfirmedDelete = () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.kind === "optionRow") {
      const { gi, oi } = deleteConfirm;
      onOptionGroupsChange((prev) => {
        const next = [...prev];
        const g = { ...next[gi]! };
        g.options = g.options.filter((_, j) => j !== oi);
        if (g.options.length === 0) g.options = [emptyOptionRow()];
        next[gi] = g;
        return next;
      });
    } else {
      const { gi } = deleteConfirm;
      onOptionGroupsChange((prev) => prev.filter((_, j) => j !== gi));
    }
    setDeleteConfirm(null);
  };

  return (
    <>
    <div className="min-w-0 space-y-2 bg-transparent">
      {optionGroups.length === 0 ? (
        <div className="rounded-ui-rect border-2 border-dashed border-[var(--biz-primary)]/55 bg-[color-mix(in_srgb,var(--biz-primary)_8%,var(--biz-primary-soft))] py-6 text-center">
          <p className="sam-text-body-secondary text-sam-muted">{t("business_phase7_222")}</p>
          <div className="mt-4 flex justify-end px-1">
            <OptionAddBadgeButton
              variant="group"
              aria-label={t("business_phase7_218")}
              onClick={() => onOptionGroupsChange((prev) => [...prev, emptyOptionGroup()])}
            >
              {t("business_phase7_218")}
            </OptionAddBadgeButton>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {optionGroups.map((group, gi) => (
            <li
              key={group.groupLocalId}
              className="relative overflow-hidden rounded-ui-rect border-2 border-[var(--biz-primary)]/35 bg-sam-surface shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
            >
              <div className="space-y-2 p-3">
                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                    {t("business_phase7_401")}
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
                    placeholder={t("business_phase7_210")}
                    className={OWNER_STORE_PROFILE_CONTROL_CLASS}
                  />
                </div>

                <div>
                  <label className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">
                    {t("business_phase7_402")}
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-0 flex-1">
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
                        <option value="single">{t("business_phase7_051")}</option>
                        <option value="multiple">{t("business_phase7_128")}</option>
                        <option value="quantity">{t("business_phase7_168")}</option>
                      </select>
                      <span
                        aria-hidden
                        className="pointer-events-none absolute right-3 top-1/2 z-[1] -translate-y-1/2 text-[0.65rem] leading-none text-sam-muted"
                      >
                        ▼
                      </span>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap sam-text-body-secondary text-sam-fg">
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
                      {t("business_phase7_403")}
                    </label>
                  </div>
                </div>

                {(group.selectionKind === "multiple" ||
                  group.selectionKind === "quantity" ||
                  (group.selectionKind === "single" && !group.required)) && (
                  <div className={OWNER_STORE_FORM_GRID_2_CLASS}>
                    <div>
                      <label className="mb-0.5 block sam-text-xxs text-sam-muted">{t("business_phase7_291")}</label>
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
                      <label className="mb-0.5 block sam-text-xxs text-sam-muted">{t("business_phase7_290")}</label>
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

                <div className="space-y-2">
                  <p className="mb-1 block sam-text-body-secondary font-medium text-sam-fg">{t("business_phase7_220")}</p>
                  <ul className="space-y-2">
                  {group.options.map((opt, oi) => (
                    <li
                      key={opt.id}
                      className="flex flex-col gap-2 rounded-ui-rect border border-sam-border-soft bg-sam-app/80 p-2"
                    >
                      <div className="min-w-0">
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
                          placeholder={t("business_phase7_207")}
                          className="w-full min-w-0 rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-2 sam-text-body text-sam-fg"
                        />
                      </div>
                      <div className="flex min-w-0 items-stretch gap-2">
                        <div className="inline-flex min-h-[36px] min-w-0 flex-1 items-center gap-2 self-stretch rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1.5 shadow-none">
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
                            className="min-h-0 min-w-[5rem] flex-1 appearance-none border-0 bg-transparent p-0 text-right text-[15px] leading-none text-sam-fg outline-none [-webkit-appearance:none] [appearance:textfield] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none"
                            aria-label={t("business_phase7_293")}
                          />
                          <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold uppercase leading-none text-sam-muted">
                            {priceUnitLabel}
                          </span>
                        </div>
                        <div className="flex min-h-[36px] shrink-0 items-center justify-end gap-x-2 gap-y-1 self-stretch">
                          <label className="inline-flex items-center gap-1 sam-text-helper text-sam-fg">
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
                              className="h-4 w-4 shrink-0 rounded border-sam-border"
                            />
                            {t("business_phase7_317")}
                          </label>
                          <label className="inline-flex items-center gap-1 sam-text-helper text-sam-fg">
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
                              className="h-4 w-4 shrink-0 rounded border-sam-border"
                            />
                            {t("business_phase7_404")}
                          </label>
                          <button
                            type="button"
                            aria-label={t("business_phase7_162")}
                            title={t("common_delete")}
                            onClick={() => setDeleteConfirm({ kind: "optionRow", gi, oi })}
                            className="inline-flex h-[36px] min-h-[36px] shrink-0 items-center justify-center border-0 bg-transparent px-1 text-[1.65rem] font-extrabold leading-none text-red-700 hover:text-red-800 active:opacity-80"
                          >
                            <span aria-hidden>×</span>
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <OptionAddBadgeButton
                    variant="option"
                    aria-label={t("business_phase7_163")}
                    onClick={() =>
                      onOptionGroupsChange((prev) => {
                        const next = [...prev];
                        const g = { ...next[gi]! };
                        g.options = [...g.options, emptyOptionRow()];
                        next[gi] = g;
                        return next;
                      })
                    }
                  >
                    {t("business_phase7_163")}
                  </OptionAddBadgeButton>
                  <OptionGroupDeleteBadgeButton
                    onClick={() => onOptionGroupsChange((prev) => prev.filter((_, j) => j !== gi))}
                  />
                </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {optionGroups.length > 0 ? (
        <div className="flex justify-end pt-1">
          <OptionAddBadgeButton
            variant="group"
            aria-label={t("business_phase7_218")}
            onClick={() => onOptionGroupsChange((prev) => [...prev, emptyOptionGroup()])}
          >
            {t("business_phase7_218")}
          </OptionAddBadgeButton>
        </div>
      ) : null}
    </div>
    <OwnerStoreAdminConfirmModal
      open={deleteConfirm != null}
      titleId={optionDeleteTitleId}
      title={t("business_phase7_139")}
      description={
        deleteConfirm?.kind === "optionGroup"
          ? t("business_phase7_405")
          : deleteConfirm?.kind === "optionRow"
            ? t("business_phase7_406")
            : t("business_phase7_407")
      }
      cancelLabel={t("common_cancel")}
      confirmLabel={t("common_delete")}
      confirmTone="danger"
      onCancel={() => setDeleteConfirm(null)}
      onConfirm={() => {
        applyConfirmedDelete();
      }}
    />
    </>
  );
}
