"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useMemo, useState } from "react";
import type { ModifierSelectionsWire, ParsedOptionGroup } from "@/lib/stores/modifiers/types";
import { sortModifierGroupsForCustomerUi } from "@/lib/stores/modifiers/sort-for-ui";
import { formatMoneyPhp } from "@/lib/utils/format";
import { STORE_ORDER_CTA_STEPPER } from "@/components/stores/store-order-detail/store-order-brand";

/**
 * WP7 (배민형) — 시트·메뉴 상세 옵션: 필수 = 진한 알약(`--sam-fg` 배경·흰 글자), 선택 = 회색 알약.
 * 라디오·체크 선택색 = 진한색(`--sam-fg`). 브랜드 그린은 하단 담기 버튼에만.
 */
const SHEET_BADGE_REQUIRED =
  "inline-flex h-5 items-center rounded-full bg-sam-fg px-2 text-[11px] font-bold text-white";
const SHEET_BADGE_OPTIONAL =
  "inline-flex h-5 items-center rounded-full bg-sam-surface-muted px-2 text-[11px] font-semibold text-sam-muted";
const SHEET_SELECTED_COLOR = "var(--sam-fg)";

/**
 * 팝업 SSOT T3 — `surface="overlay"`(담기 시트 `StoreProductAddSheet`)일 때만 쓰는 값.
 * 메뉴 상세 페이지(`StoreBaeminProductDetailView`)는 같은 `variant="sheet"` 를 쓰므로 기본(page) 값은 그대로 둔다.
 * 글자 12·14·16 · 팝업 토큰 · 선택 = 브랜드 · 비활성 = 회색 (투명도·grayscale 금지).
 */
const OV_BADGE_REQUIRED =
  "inline-flex h-5 items-center rounded-full bg-[color:var(--overlay-text-primary)] px-2 text-[length:var(--overlay-caption-size)] font-semibold text-[color:var(--overlay-surface)]";
const OV_BADGE_OPTIONAL =
  "inline-flex h-5 items-center rounded-full bg-[color:var(--overlay-secondary)] px-2 text-[length:var(--overlay-caption-size)] font-semibold text-[color:var(--overlay-text-secondary)]";
const OV_SELECTED_COLOR = "var(--overlay-primary)";
const OV_STEPPER =
  "flex h-8 w-8 shrink-0 touch-manipulation select-none items-center justify-center rounded-[length:var(--overlay-radius-sm)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)] text-[length:var(--overlay-body-1-size)] font-semibold leading-none text-[color:var(--overlay-text-primary)] transition-[background-color,transform] duration-100 enabled:active:scale-[0.98] enabled:active:bg-[color:var(--overlay-secondary)] disabled:cursor-not-allowed disabled:bg-[color:var(--sm-color-primary-disabled)] disabled:text-[color:var(--overlay-text-secondary)]";

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
  /** page(기본) = 메뉴 상세 페이지 모양 · overlay = 담기 시트 안 (팝업 SSOT T3) — `variant="sheet"` 에만 적용 */
  surface?: "page" | "overlay";
};

export function StoreModifierPicker({
  groups,
  value,
  onChange,
  disabled,
  variant = "default",
  surface = "page",
}: Props) {
  const { t } = useI18n();
  const ov = surface === "overlay";
  const sheetCls = ov
    ? {
        sectionFirst: "bg-[color:var(--overlay-surface)]",
        sectionNext: "border-t-[8px] border-[color:var(--overlay-secondary)] bg-[color:var(--overlay-surface)]",
        groupTitle: `break-words [overflow-wrap:anywhere] text-[length:var(--overlay-body-1-size)] font-semibold leading-[1.4] text-[color:var(--overlay-text-primary)]`,
        badgeRequired: OV_BADGE_REQUIRED,
        badgeOptional: OV_BADGE_OPTIONAL,
        hint: `mt-0.5 text-[length:var(--overlay-caption-size)] font-medium text-[color:var(--overlay-text-secondary)]`,
        desc: `mt-1 text-[length:var(--overlay-caption-size)] font-medium leading-snug text-[color:var(--overlay-text-secondary)]`,
        list: "divide-y divide-[color:var(--overlay-border)] px-4",
        qtyName: `text-[length:var(--overlay-body-1-size)] font-medium text-[color:var(--overlay-text-primary)]`,
        qtyDelta: `mt-0.5 text-[length:var(--overlay-caption-size)] font-semibold tabular-nums text-[color:var(--overlay-text-secondary)]`,
        stepper: OV_STEPPER,
        qtyCount: `min-w-[1.25rem] text-center text-[length:var(--overlay-body-1-size)] font-semibold tabular-nums text-[color:var(--overlay-text-primary)]`,
        soldOut: "dibay-overlay-caption dibay-overlay-caption--danger font-medium",
        soldOutP: "dibay-overlay-caption dibay-overlay-caption--danger px-3 pb-2",
        row: (selected: boolean, dim: boolean) =>
          `flex w-full touch-manipulation items-center gap-3 bg-[color:var(--overlay-surface)] py-3 text-left transition-colors ${
            dim ? "cursor-not-allowed" : "active:bg-[color:var(--overlay-secondary)]"
          }`,
        optName: (dim: boolean) => `min-w-0 flex-1 break-words [overflow-wrap:anywhere] text-[length:var(--overlay-body-1-size)] font-medium ${dim ? "text-[color:var(--overlay-text-secondary)]" : "text-[color:var(--overlay-text-primary)]"}`,
        optDelta: (dim: boolean) => `shrink-0 text-[length:var(--overlay-body-2-size)] font-semibold tabular-nums ${dim ? "text-[color:var(--overlay-text-secondary)]" : "text-[color:var(--overlay-text-primary)]"}`,
        selectedColor: OV_SELECTED_COLOR,
        idleBorder: "var(--overlay-border)",
        markSurface: "var(--overlay-surface)",
        radio: "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2",
        check:
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[length:var(--overlay-radius-xs)] border text-[length:var(--overlay-caption-size)] font-bold leading-none",
      }
    : {
        sectionFirst: "bg-white",
        sectionNext: "border-t-[8px] border-sam-surface-muted bg-white",
        groupTitle: "text-[15px] font-extrabold tracking-[-0.025em] text-sam-fg",
        badgeRequired: SHEET_BADGE_REQUIRED,
        badgeOptional: SHEET_BADGE_OPTIONAL,
        hint: "mt-0.5 text-[12px] font-medium text-sam-muted",
        desc: "mt-1 text-[12px] font-medium leading-snug text-sam-muted",
        list: "divide-y divide-sam-border-soft px-4",
        qtyName: "text-[14px] font-bold text-sam-fg",
        qtyDelta: "mt-0.5 text-[12px] font-semibold tabular-nums text-sam-muted",
        stepper: `flex h-8 w-8 shrink-0 items-center justify-center text-base font-bold leading-none ${STORE_ORDER_CTA_STEPPER}`,
        qtyCount: "min-w-[1.25rem] text-center text-[15px] font-bold tabular-nums",
        soldOut: "sam-text-xxs font-medium text-sam-warning",
        soldOutP: "px-3 pb-2 sam-text-xxs text-sam-warning",
        row: (selected: boolean, dim: boolean) =>
          `flex w-full touch-manipulation items-center gap-3 py-3 text-left transition-colors active:bg-sam-surface-muted ${
            selected ? "bg-white" : "hover:bg-sam-surface-muted"
          } ${dim ? "delivery-unavailable" : ""}`,
        optName: (_dim: boolean) => "min-w-0 flex-1 text-[14px] font-bold text-sam-fg",
        optDelta: (_dim: boolean) => "shrink-0 text-[13px] font-extrabold tabular-nums text-sam-fg",
        selectedColor: SHEET_SELECTED_COLOR,
        idleBorder: "var(--sam-border-default)",
        markSurface: "white",
        radio: "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 bg-white",
        check:
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-ui-rect border bg-white text-[11px] font-bold leading-none",
      };
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
          /** 「최대 n개 선택」 등 — 여러 개 고르는 그룹·선택 그룹만 제목 아래 표시 (필수 1개 그룹은 배지로 충분) */
          const rangeHint =
            g.inputType === "quantity"
              ? t("store_modifier_count_upto", { max: String(maxS) })
              : minS === maxS
                ? t("store_modifier_count_min_select", { min: String(minS) })
                : minS > 0
                  ? t("store_modifier_count_range_select", { min: String(minS), max: String(maxS) })
                  : t("store_modifier_count_max_select", { max: String(maxS) });
          const showRangeHint = maxS > 1 || !required;

          const single = g.inputType === "radio" || g.inputType === "select" || maxS <= 1;

          return (
            <section
              key={g.key}
              className={gi > 0 ? sheetCls.sectionNext : sheetCls.sectionFirst}
            >
              <div className="px-4 pb-2 pt-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={sheetCls.groupTitle}>{g.label}</h3>
                  {required ? (
                    <span className={sheetCls.badgeRequired} data-modifier-badge="required">
                      {t("store_modifier_required")}
                    </span>
                  ) : (
                    <span className={sheetCls.badgeOptional} data-modifier-badge="optional">
                      {t("store_modifier_optional_chip")}
                    </span>
                  )}
                </div>
                {showRangeHint ? (
                  <p className={sheetCls.hint}>{rangeHint}</p>
                ) : null}
                {g.description ? (
                  <p className={sheetCls.desc}>{g.description}</p>
                ) : null}
              </div>
              {g.inputType === "quantity" ? (
                <ul className={sheetCls.list}>
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
                          <p className={sheetCls.qtyName}>{opt.name}</p>
                          <p className={sheetCls.qtyDelta}>
                            {deltaLabel(opt.priceDelta)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={dim || q <= 0 || blockDec}
                            onClick={() => setQty(g.key, opt.key, q - 1)}
                            className={sheetCls.stepper}
                          >
                            −
                          </button>
                          <span className={sheetCls.qtyCount}>{q}</span>
                          <button
                            type="button"
                            disabled={dim || q >= maxForThis}
                            onClick={() => setQty(g.key, opt.key, q + 1)}
                            className={sheetCls.stepper}
                          >
                            +
                          </button>
                        </div>
                        {opt.soldOut ? (
                          <span className={sheetCls.soldOut}>{t("store_sold_out")}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className={sheetCls.list}>
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
                            className={sheetCls.row(selected, dim)}
                          >
                            <span
                              className={sheetCls.radio}
                              style={{
                                borderColor: selected ? sheetCls.selectedColor : sheetCls.idleBorder,
                                ...(ov ? { backgroundColor: sheetCls.markSurface } : null),
                              }}
                            >
                              {selected ? (
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: sheetCls.selectedColor }}
                                />
                              ) : null}
                            </span>
                            <span className={sheetCls.optName(dim)}>{opt.name}</span>
                            <span className={sheetCls.optDelta(dim)}>
                              {deltaLabel(opt.priceDelta)}
                            </span>
                          </button>
                          {opt.soldOut ? (
                            <p className={sheetCls.soldOutP}>{t("store_sold_out")}</p>
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
                          className={sheetCls.row(selected, dim)}
                        >
                          <span
                            className={sheetCls.check}
                            style={{
                              borderColor: selected ? sheetCls.selectedColor : sheetCls.idleBorder,
                              color: selected ? (ov ? "var(--overlay-surface)" : "#fff") : "transparent",
                              backgroundColor: selected ? sheetCls.selectedColor : sheetCls.markSurface,
                            }}
                          >
                            {selected ? "✓" : ""}
                          </span>
                          <span className={sheetCls.optName(dim)}>{opt.name}</span>
                          <span className={sheetCls.optDelta(dim)}>
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
            ? t("store_modifier_count_upto", { max: String(maxS) })
            : minS === maxS
              ? t("store_modifier_count_min_select", { min: String(minS) })
              : minS > 0
                ? t("store_modifier_count_range_select", { min: String(minS), max: String(maxS) })
                : t("store_modifier_count_max_select", { max: String(maxS) });

        const isOpen = openKeys[g.key] ?? (required || sorted.length <= 4);
        const single = g.inputType === "radio" || g.inputType === "select" || maxS <= 1;

        const header = (
          <div className="flex flex-wrap items-center gap-2">
            <span className="sam-text-body font-semibold text-sam-fg">{g.label}</span>
            {required ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 sam-text-xxs font-bold text-rose-800">
                {t("store_modifier_required")}
              </span>
            ) : (
              <span className="rounded-full bg-sam-surface-muted px-2 py-0.5 sam-text-xxs font-medium text-sam-muted">
                {t("store_modifier_optional_chip")}
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
                        <span className="sam-text-xxs font-medium text-sam-warning">{t("store_sold_out")}</span>
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
                          className={`${btnBase} ${selected ? btnOn : btnOff} ${dim ? "delivery-unavailable" : ""}`}
                        >
                          <span className="sam-text-body font-medium">{opt.name}</span>
                          <span className="shrink-0 sam-text-body font-semibold text-sam-fg">
                            {deltaLabel(opt.priceDelta)}
                          </span>
                        </button>
                        {opt.soldOut ? (
                          <p className="mt-0.5 sam-text-xxs text-sam-warning">{t("store_sold_out_cannot_select")}</p>
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
                        className={`${btnBase} ${selected ? btnOn : btnOff} ${dim ? "delivery-unavailable" : ""}`}
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
