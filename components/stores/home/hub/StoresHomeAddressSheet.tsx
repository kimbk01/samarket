"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AddressListRowBody } from "@/components/addresses/AddressListRowBody";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import {
  describeMeAddressesListFailure,
  fetchMeAddressesListSingleFlight,
  readCachedMeAddressList,
  writeCachedMeAddressList,
} from "@/lib/addresses/address-list-client-cache";
import { invalidateAddressDefaultsSnapshotCache } from "@/lib/addresses/fetch-address-defaults-client";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";

/**
 * CONTRACT — `/stores` 주소 바텀시트.
 * DO NOT: pill `현재` 뱃지·헤더와 다른 주소 한 줄 포맷 — `AddressListRowBody` 공유.
 * `store_address_manage_link` 는 시트 헤더 링크에만.
 */
export function StoresHomeAddressSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [list, setList] = useState<UserAddressDTO[]>(() => readCachedMeAddressList() ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    document.body.classList.add("overflow-hidden");
    const id = requestAnimationFrame(() => setEntered(true));
    return () => {
      cancelAnimationFrame(id);
      document.body.classList.remove("overflow-hidden");
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchMeAddressesListSingleFlight()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setError(describeMeAddressesListFailure(result, t("philife_addr_list_load_failed")));
          return;
        }
        setList(result.rows);
        if (result.rows.length > 0) writeCachedMeAddressList(result.rows);
      })
      .catch(() => {
        if (!cancelled) setError(t("philife_addr_list_network_failed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pickDelivery = useCallback(
    async (id: string) => {
      const row = list.find((a) => a.id === id);
      if (!row || row.isDefaultDelivery || busyId) return;
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(`/api/me/addresses/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefaultDelivery: true }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setError(typeof j.error === "string" ? j.error : t("philife_addr_change_failed"));
          return;
        }
        const updated = list.map((item) => ({
          ...item,
          isDefaultDelivery: item.id === id,
        }));
        setList(updated);
        writeCachedMeAddressList(updated);
        invalidateAddressDefaultsSnapshotCache();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SAMARKET_ADDRESSES_UPDATED_EVENT));
        }
        onClose();
      } catch {
        setError(t("philife_addr_change_network_failed"));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, list, onClose, t]
  );

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[115]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-[color:var(--delivery-backdrop)]"
        aria-label={t("philife_addr_close_menu_aria")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("layout_neighborhood_address_aria", { line: "" })}
        className={`delivery-ui absolute inset-x-0 bottom-0 flex max-h-[min(78dvh,520px)] flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--delivery-bg-card)] shadow-[var(--delivery-shadow-sheet)] transition-transform duration-300 ease-out ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[color:var(--delivery-border)]" aria-hidden />
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--delivery-border)] px-[var(--delivery-page-x)] py-3">
          <h2 className="text-[17px] font-bold text-[color:var(--delivery-text-main)]">
            {t("philife_addr_change")}
          </h2>
          <Link
            href="/mypage/addresses"
            onClick={onClose}
            className="text-[13px] font-semibold text-[color:var(--delivery-primary)]"
          >
            {t("store_address_manage_link")}
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[var(--delivery-page-x)] py-2">
          {error ?
            <p className="mb-2 rounded-[var(--delivery-radius)] bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              {error}
            </p>
          : null}
          {loading && list.length === 0 ?
            <p className="py-4 text-[13px] text-[color:var(--delivery-text-muted)]">
              {t("philife_addr_list_loading")}
            </p>
          : null}
          {!loading && list.length === 0 ?
            <p className="py-4 text-[13px] text-[color:var(--delivery-text-muted)]">{t("philife_addr_empty")}</p>
          : null}
          <ul className="space-y-1">
            {list.map((row) => {
              const active = row.isDefaultDelivery;
              const busy = busyId === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={busy || busyId != null}
                    onClick={() => void pickDelivery(row.id)}
                    className={`flex w-full items-start gap-3 rounded-[var(--delivery-radius)] px-3 py-3 text-left transition-colors ${
                      active ?
                        "bg-[color:var(--delivery-primary-soft)] ring-1 ring-[color:var(--delivery-primary-border)]"
                      : "hover:bg-[color:var(--delivery-bg-soft)]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        active ?
                          "border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary)]"
                        : "border-[color:var(--delivery-border)] bg-white"
                      }`}
                      aria-hidden
                    >
                      {active ?
                        <span className="h-2 w-2 rounded-full bg-white" />
                      : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <AddressListRowBody
                        row={row}
                        showDefaultDeliveryBadge
                        preferFullAddressLine
                        addressMainClassName="text-[color:var(--delivery-text-main)]"
                      />
                    </span>
                    {busy ?
                      <span className="shrink-0 text-[11px] text-[color:var(--delivery-text-muted)]">
                        {t("philife_addr_changing")}
                      </span>
                    : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>,
    document.body
  );
}
