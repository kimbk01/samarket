"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { isLinkedSamarketStoreAddressRow } from "@/lib/addresses/is-linked-samarket-store-address";
import { translateUserAddressApiError } from "@/lib/addresses/user-address-api-error-i18n";
import {
  buildMypageAddressesHref,
  parseSafeInternalReturnTo,
  resolveAddressFlowEntryPath,
} from "@/lib/addresses/mypage-addresses-return-to";
import { writeAddressFlowExitHref } from "@/lib/addresses/mypage-address-flow-exit";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS,
  MAIN_BOTTOM_NAV_SHEET_MAX_H_CLASS,
  MAIN_BOTTOM_NAV_SHEET_Z_CLASS,
} from "@/lib/main-menu/bottom-nav-config";

export type DeliveryStyleAddressPickerPurpose = "delivery" | "master";

/**
 * 배달 홈·마이페이지 프로필 — 동일 delivery-ui 바텀시트 주소 선택.
 * DO NOT: 시트별 목록 fetch·PATCH 분기 복제 — purpose 만 바꿔 재사용.
 */
export function DeliveryStyleAddressPickerSheet({
  open,
  onClose,
  purpose,
  titleKey = purpose === "delivery" ? "philife_addr_change" : "philife_addr_change",
  /** 메인 BottomNav(1200) 위에 붙임 — 하단 목록·버튼이 탭에 가리지 않게 */
  anchorAboveMainBottomNav = true,
  /** 주소 관리 링크·확인 복귀용 — `/stores` 헤더 시트 등 진입 화면을 명시 */
  managementReturnTo = null,
}: {
  open: boolean;
  onClose: () => void;
  purpose: DeliveryStyleAddressPickerPurpose;
  titleKey?: MessageKey;
  anchorAboveMainBottomNav?: boolean;
  managementReturnTo?: string | null;
}) {
  const { t } = useI18n();
  const pathname = usePathname() ?? "";
  const manageReturnTarget = useMemo(() => {
    const explicit = parseSafeInternalReturnTo(managementReturnTo);
    if (explicit) return explicit;
    return resolveAddressFlowEntryPath(
      pathname,
      typeof window !== "undefined" ? window.location.search : ""
    );
  }, [managementReturnTo, pathname]);
  const manageAddressesHref = buildMypageAddressesHref(manageReturnTarget);
  const openAddressManagement = useCallback(() => {
    if (manageReturnTarget) writeAddressFlowExitHref(manageReturnTarget);
    onClose();
  }, [manageReturnTarget, onClose]);
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
          setError(describeMeAddressesListFailure(result, t, "philife_addr_list_load_failed"));
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

  const pickRow = useCallback(
    async (id: string) => {
      const row = list.find((a) => a.id === id);
      if (!row || busyId) return;
      const alreadyActive =
        purpose === "delivery" ? row.isDefaultDelivery : row.isDefaultMaster;
      if (alreadyActive) {
        onClose();
        return;
      }
      if (purpose === "master" && isLinkedSamarketStoreAddressRow(row)) {
        setError(t("addr_ui_store_not_master"));
        return;
      }
      setBusyId(id);
      setError(null);
      try {
        const body =
          purpose === "delivery"
            ? { isDefaultDelivery: true }
            : {
                isDefaultMaster: true,
                isDefaultLife: true,
                isDefaultTrade: true,
                isDefaultDelivery: true,
              };
        const res = await fetch(`/api/me/addresses/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !j.ok) {
          setError(
            translateUserAddressApiError(
              j.error,
              t,
              purpose === "delivery" ? "philife_addr_change_failed" : "philife_addr_change_failed",
            ),
          );
          return;
        }
        const updated = list.map((item) => {
          if (purpose === "delivery") {
            return { ...item, isDefaultDelivery: item.id === id };
          }
          const selected = item.id === id;
          return {
            ...item,
            isDefaultMaster: selected,
            isDefaultLife: selected,
            isDefaultTrade: selected,
            isDefaultDelivery: selected,
          };
        });
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
    [busyId, list, onClose, purpose, t],
  );

  if (!mounted || !open) return null;

  const sheetBottomClass = anchorAboveMainBottomNav ? MAIN_BOTTOM_NAV_SHEET_BOTTOM_CLASS : "bottom-0";
  const sheetMaxHClass = anchorAboveMainBottomNav
    ? MAIN_BOTTOM_NAV_SHEET_MAX_H_CLASS
    : "max-h-[min(78dvh,520px)]";
  const overlayZClass = anchorAboveMainBottomNav ? MAIN_BOTTOM_NAV_SHEET_Z_CLASS : "z-[115]";

  return createPortal(
    <div className={`fixed inset-0 ${overlayZClass}`} role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-[color:var(--delivery-backdrop)]"
        aria-label={t("philife_addr_close_menu_aria")}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(titleKey)}
        className={`delivery-ui absolute inset-x-0 ${sheetBottomClass} flex ${sheetMaxHClass} flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--delivery-bg-card)] shadow-[var(--delivery-shadow-sheet)] transition-transform duration-300 ease-out ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[color:var(--delivery-border)]" aria-hidden />
        <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--delivery-border)] px-[var(--delivery-page-x)] py-3">
          <h2 className="text-[17px] font-bold text-[color:var(--delivery-text-main)]">{t(titleKey)}</h2>
          <Link
            href={manageAddressesHref}
            onClick={openAddressManagement}
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
              const active = purpose === "delivery" ? row.isDefaultDelivery : row.isDefaultMaster;
              const busy = busyId === row.id;
              const storeBlocked = purpose === "master" && isLinkedSamarketStoreAddressRow(row);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={busy || busyId != null || storeBlocked}
                    onClick={() => void pickRow(row.id)}
                    className={`flex w-full items-start gap-3 rounded-[var(--delivery-radius)] px-3 py-3 text-left transition-colors ${
                      active ?
                        "bg-[color:var(--delivery-primary-soft)] ring-1 ring-[color:var(--delivery-primary-border)]"
                      : storeBlocked ?
                        "cursor-not-allowed opacity-50"
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
                      {active ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <AddressListRowBody
                        row={row}
                        showDefaultDeliveryBadge={purpose === "delivery"}
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
    document.body,
  );
}
