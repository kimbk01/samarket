"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoresBrowseCustomerSortAvailability } from "@/lib/stores/stores-browse-customer-sort-availability";
import { STORES_BROWSE_CUSTOMER_SORT_AVAILABILITY_DEFAULT } from "@/lib/stores/stores-browse-customer-sort-availability";
import {
  STORES_BROWSE_MIN_ORDER_FILTER_VALUES,
  STORES_BROWSE_RATING_FILTER_VALUES,
  type StoresBrowseCustomerFilters,
  type StoresBrowseDeliveryMethodFilter,
} from "@/lib/stores/stores-browse-customer-filters";
import { formatMoneyPhp } from "@/lib/utils/format";
import {
  MIRROR_CHIP_ACTIVE_CLASS,
  MIRROR_CHIP_BASE_CLASS,
  MIRROR_CHIP_OFF_CLASS,
  MIRROR_CHIP_ROW_CLASS,
  MIRROR_CHIP_SORT_CLASS,
  MIRROR_SHEET_BACKDROP_CLASS,
  MIRROR_SHEET_FOOTER_CLASS,
  MIRROR_SHEET_PANEL_CLASS,
  MIRROR_SHEET_ROW_CLASS,
  MIRROR_SHEET_TITLE_CLASS,
} from "@/lib/design/delivery-baemin-mirror";
import type { StoreBrowseSortId } from "./StoreListFilters";

/** 배민 「기본순」 시트 5줄 — 찜 많은 순은 서버 정렬 뒤 찜 수로 다시 정렬 */
export type StoreBrowseChipSortId = StoreBrowseSortId | "favorites";

type SheetKind = "sort" | "method" | "rating" | "min_order" | "etc";

function SortIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M5 2.5v11M5 13.5L2.5 11M5 13.5L7.5 11M11 13.5v-11M11 2.5L8.5 5M11 2.5L13.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M9.2 1.5L3.5 9h3.9l-.8 5.5L12.5 7H8.6l.6-5.5z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2l-3.9 2.2.9-4.4-3.3-3 4.4-.5L8 1.5z" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
      <path d="M2 4h6M11 4h3M2 8h2M7 8h7M2 12h8M13 12h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="5.5" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Caret() {
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
      <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5 text-[color:#0B421A]" fill="none" aria-hidden>
      <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="delivery-ui" data-baemin-mirror-sheet="1">
      <button type="button" aria-label={title} className={MIRROR_SHEET_BACKDROP_CLASS} onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title} className={MIRROR_SHEET_PANEL_CLASS}>
        <div className={MIRROR_SHEET_TITLE_CLASS}>{title}</div>
        <div className="max-h-[60vh] overflow-y-auto">{children}</div>
        <div className={MIRROR_SHEET_FOOTER_CLASS}>{footer}</div>
      </div>
    </div>,
    document.body
  );
}

function SheetRow({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`${MIRROR_SHEET_ROW_CLASS} ${selected ? "font-bold" : "font-normal"}`} onClick={onClick}>
      <span>{label}</span>
      {selected ? <Check /> : null}
    </button>
  );
}

/**
 * 배민 미러링 4단 — 필터 칩 6개 + 아래에서 올라오는 시트 (설계 v6 §2).
 * ⇅ 정렬 · ⚡ 할인·쿠폰(켜기) · 배달방식 ⌄ · ★ 별점 ⌄ · 최소주문금액 ⌄ · ☰ 기타(항목 있을 때만).
 */
export function StoreListFilterChips({
  sort,
  onSortChange,
  filters,
  onFiltersChange,
  hasGeo,
  availability = STORES_BROWSE_CUSTOMER_SORT_AVAILABILITY_DEFAULT,
  showMethodChip = true,
  showReservationFilter = false,
}: {
  sort: StoreBrowseChipSortId;
  onSortChange: (id: StoreBrowseChipSortId) => void;
  filters: StoresBrowseCustomerFilters;
  onFiltersChange: (next: StoresBrowseCustomerFilters) => void;
  hasGeo: boolean;
  availability?: StoresBrowseCustomerSortAvailability;
  /** 픽업 상단 탭은 배달방식 칩 없음 */
  showMethodChip?: boolean;
  /** 예약 가능 매장이 있을 때만 「기타」 칩 */
  showReservationFilter?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<SheetKind | null>(null);
  const [etcDraft, setEtcDraft] = useState(filters.reservation);
  const close = () => setOpen(null);

  const sortOptions: { id: StoreBrowseChipSortId; label: string; disabled?: boolean }[] = [
    { id: "default", label: t("nav_store_sort_default") },
    ...(availability.popular ? [{ id: "popular" as const, label: t("nav_store_sort_popular") }] : []),
    ...(availability.rating ? [{ id: "rating" as const, label: t("store_browse_sort_rating_high") }] : []),
    ...(availability.distance ? [{ id: "distance" as const, label: t("store_browse_sort_distance_near"), disabled: !hasGeo }] : []),
    { id: "favorites", label: t("store_browse_sort_favorites") },
  ];
  const sortLabel = sortOptions.find((o) => o.id === sort)?.label ?? t("nav_store_sort_default");

  const methodLabel =
    filters.method === "delivery"
      ? t("store_browse_filter_method_delivery")
      : filters.method === "pickup"
        ? t("store_browse_filter_method_pickup")
        : t("store_browse_filter_method");
  const ratingLabel =
    filters.minRating != null
      ? t("store_browse_filter_rating_min", { n: filters.minRating.toFixed(1) })
      : t("store_browse_filter_rating");
  const minOrderLabel =
    filters.maxMinOrderPhp != null
      ? t("store_browse_filter_min_order_max", { amount: formatMoneyPhp(filters.maxMinOrderPhp) })
      : t("store_browse_filter_min_order");

  const set = (patch: Partial<StoresBrowseCustomerFilters>) => onFiltersChange({ ...filters, ...patch });
  const chipClass = (active: boolean) => `${MIRROR_CHIP_BASE_CLASS} ${active ? MIRROR_CHIP_ACTIVE_CLASS : MIRROR_CHIP_OFF_CLASS}`;
  const closeFooter = (
    <button type="button" className="flex-1 text-[16px] font-bold text-[color:#362415]" onClick={close}>
      {t("store_browse_filter_close")}
    </button>
  );

  return (
    <>
      <div className={MIRROR_CHIP_ROW_CLASS} data-baemin-mirror-chips="1">
        <button
          type="button"
          className={`${MIRROR_CHIP_BASE_CLASS} ${MIRROR_CHIP_SORT_CLASS}`}
          data-browse-chip="sort"
          onClick={() => setOpen("sort")}
        >
          <SortIcon />
          {sortLabel}
        </button>
        <button
          type="button"
          className={chipClass(filters.coupon)}
          aria-pressed={filters.coupon}
          data-browse-chip="coupon"
          onClick={() => set({ coupon: !filters.coupon })}
        >
          <BoltIcon />
          {t("store_browse_filter_coupon")}
        </button>
        {showMethodChip ?
          <button type="button" className={chipClass(filters.method != null)} data-browse-chip="method" onClick={() => setOpen("method")}>
            {methodLabel}
            <Caret />
          </button>
        : null}
        <button type="button" className={chipClass(filters.minRating != null)} data-browse-chip="rating" onClick={() => setOpen("rating")}>
          <StarIcon />
          {ratingLabel}
          <Caret />
        </button>
        <button type="button" className={chipClass(filters.maxMinOrderPhp != null)} data-browse-chip="min_order" onClick={() => setOpen("min_order")}>
          {minOrderLabel}
          <Caret />
        </button>
        {showReservationFilter ?
          <button
            type="button"
            className={chipClass(filters.reservation)}
            data-browse-chip="etc"
            onClick={() => {
              setEtcDraft(filters.reservation);
              setOpen("etc");
            }}
          >
            <SlidersIcon />
            {t("store_browse_filter_etc")}
          </button>
        : null}
      </div>

      {open === "sort" ?
        <Sheet title={t("store_browse_sort_sheet_title")} onClose={close} footer={closeFooter}>
          {sortOptions.map((o) => (
            <SheetRow
              key={o.id}
              label={o.label}
              selected={o.id === sort}
              onClick={() => {
                if (o.disabled) return;
                onSortChange(o.id);
                close();
              }}
            />
          ))}
        </Sheet>
      : null}

      {open === "method" ?
        <Sheet title={t("store_browse_filter_method")} onClose={close} footer={closeFooter}>
          {([null, "delivery", "pickup"] as (StoresBrowseDeliveryMethodFilter | null)[]).map((m) => (
            <SheetRow
              key={m ?? "all"}
              label={
                m === "delivery"
                  ? t("store_browse_filter_method_delivery")
                  : m === "pickup"
                    ? t("store_browse_filter_method_pickup")
                    : t("store_browse_filter_method_all")
              }
              selected={filters.method === m}
              onClick={() => {
                set({ method: m });
                close();
              }}
            />
          ))}
        </Sheet>
      : null}

      {open === "rating" ?
        <Sheet title={t("store_browse_filter_rating")} onClose={close} footer={closeFooter}>
          {([null, ...STORES_BROWSE_RATING_FILTER_VALUES] as (number | null)[]).map((r) => (
            <SheetRow
              key={r ?? "all"}
              label={r == null ? t("store_browse_filter_rating_all") : t("store_browse_filter_rating_min", { n: r.toFixed(1) })}
              selected={filters.minRating === r}
              onClick={() => {
                set({ minRating: r });
                close();
              }}
            />
          ))}
        </Sheet>
      : null}

      {open === "min_order" ?
        <Sheet title={t("store_browse_filter_min_order")} onClose={close} footer={closeFooter}>
          {([null, ...STORES_BROWSE_MIN_ORDER_FILTER_VALUES] as (number | null)[]).map((v) => (
            <SheetRow
              key={v ?? "all"}
              label={v == null ? t("store_browse_filter_min_order_all") : t("store_browse_filter_min_order_max", { amount: formatMoneyPhp(v) })}
              selected={filters.maxMinOrderPhp === v}
              onClick={() => {
                set({ maxMinOrderPhp: v });
                close();
              }}
            />
          ))}
        </Sheet>
      : null}

      {open === "etc" ?
        <Sheet
          title={t("store_browse_filter_etc_title")}
          onClose={close}
          footer={
            <>
              <button type="button" className="flex-1 text-[16px] text-[color:#362415]" onClick={close}>
                {t("store_browse_filter_close")}
              </button>
              <button
                type="button"
                className="flex-1 border-l border-[color:#E4E6E8] text-[16px] font-bold text-[color:#0B421A]"
                onClick={() => {
                  set({ reservation: etcDraft });
                  close();
                }}
              >
                {t("store_browse_filter_apply")}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-2 px-[20px] pb-4">
            <button
              type="button"
              aria-pressed={etcDraft}
              className={`h-[40px] rounded-full border-[1.5px] text-[14px] ${
                etcDraft ? "border-[color:#0B421A] font-bold text-[color:#0B421A]" : "border-[color:#E4E6E8] text-[color:#362415]"
              }`}
              onClick={() => setEtcDraft((v) => !v)}
            >
              {t("store_browse_filter_reservation")}
            </button>
          </div>
        </Sheet>
      : null}
    </>
  );
}
