"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressListRowBody } from "@/components/addresses/AddressListRowBody";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/**
 * ONE saved-address selection list.
 * Does not invent master/delivery/trade address books — only returns a row to the caller.
 */
export function AddressBookPickerList(props: {
  list: UserAddressDTO[];
  loading?: boolean;
  error?: string | null;
  busyId?: string | null;
  selectedId?: string | null;
  /** Highlight / prefer delivery badge when caller is delivery checkout */
  preferDeliveryBadge?: boolean;
  preferFullAddressLine?: boolean;
  manageHref?: string | null;
  onManageClick?: () => void;
  onSelect: (row: UserAddressDTO) => void;
  isRowDisabled?: (row: UserAddressDTO) => boolean;
  emptyLabel?: string;
}) {
  const { t } = useI18n();
  const {
    list,
    loading,
    error,
    busyId,
    selectedId,
    preferDeliveryBadge = false,
    preferFullAddressLine = false,
    manageHref,
    onManageClick,
    onSelect,
    isRowDisabled,
    emptyLabel,
  } = props;

  return (
    <div className="min-h-0 flex-1">
      {manageHref ? (
        <div className="mb-2 flex justify-end">
          <Link
            href={manageHref}
            onClick={onManageClick}
            className="text-[13px] font-semibold text-sam-primary"
          >
            {t("store_address_manage_link")}
          </Link>
        </div>
      ) : null}
      {error ? (
        <p className="mb-2 rounded-ui-rect bg-amber-50 px-3 py-2 text-[12px] text-amber-900">{error}</p>
      ) : null}
      {loading && list.length === 0 ? (
        <p className="py-4 text-[13px] text-sam-muted">{t("philife_addr_list_loading")}</p>
      ) : null}
      {!loading && list.length === 0 ? (
        <p className="py-4 text-[13px] text-sam-muted">{emptyLabel ?? t("philife_addr_empty")}</p>
      ) : null}
      <ul className="space-y-1">
        {list.map((row) => {
          const active = selectedId != null && selectedId === row.id;
          const busy = busyId === row.id;
          const disabled = Boolean(isRowDisabled?.(row)) || busy || busyId != null;
          return (
            <li key={row.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(row)}
                className={`flex w-full items-start gap-3 rounded-ui-rect px-3 py-3 text-left transition-colors ${
                  active
                    ? "bg-sam-primary-soft ring-1 ring-sam-primary/40"
                    : disabled
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-sam-surface-muted"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    active ? "border-sam-primary bg-sam-primary" : "border-sam-border bg-white"
                  }`}
                  aria-hidden
                >
                  {active ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <AddressListRowBody
                    row={row}
                    showDefaultDeliveryBadge={preferDeliveryBadge}
                    preferFullAddressLine={preferFullAddressLine}
                  />
                </span>
                {busy ? (
                  <span className="shrink-0 text-[11px] text-sam-muted">{t("philife_addr_changing")}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
