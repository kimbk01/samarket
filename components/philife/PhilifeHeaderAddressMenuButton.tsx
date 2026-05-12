"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SAMARKET_ADDRESSES_UPDATED_EVENT } from "@/components/addresses/MandatoryAddressGate";
import { UserAddressDesignationTitle } from "@/components/addresses/UserAddressDesignationTitle";
import { useRegion } from "@/contexts/RegionContext";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";
import { buildAddressManagementListPrimaryLine } from "@/lib/addresses/user-address-format";
import {
  describeMeAddressesListFailure,
  fetchMeAddressesListSingleFlight,
  readCachedMeAddressList,
  writeCachedMeAddressList,
} from "@/lib/addresses/address-list-client-cache";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import {
  formatNeighborhoodRegionSubtitle,
  neighborhoodLocationLabelFromRegion,
  neighborhoodLocationMetaFromRegion,
} from "@/lib/neighborhood/location-key";

export function PhilifeHeaderAddressMenuButton({
  panelPlacement = "anchor",
}: {
  panelPlacement?: "anchor" | "top-right" | "anchor-top-right";
}) {
  const [open, setOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [panelEntered, setPanelEntered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [panelOrigin, setPanelOrigin] = useState("top right");
  const [view, setView] = useState<"menu" | "picker">("menu");
  const [viewAnimating, setViewAnimating] = useState(false);
  const [list, setList] = useState<UserAddressDTO[]>(() => readCachedMeAddressList() ?? []);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevViewRef = useRef<"menu" | "picker">("menu");
  const closeTimerRef = useRef<number | null>(null);
  const { currentRegion } = useRegion();
  const rep = useRepresentativeAddressLine();
  const meta = neighborhoodLocationMetaFromRegion(currentRegion);
  const label = neighborhoodLocationLabelFromRegion(currentRegion);
  const fallback = formatNeighborhoodRegionSubtitle(meta, (label || currentRegion?.label || "").trim());
  const addressLine = rep.status === "loading" ? "주소 확인 중..." : rep.line?.trim() || fallback || "주소 미설정";

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleMenu = () => {
    if (open) {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
      setPanelEntered(false);
      setOpen(false);
      closeTimerRef.current = window.setTimeout(() => {
        setRenderOpen(false);
        closeTimerRef.current = null;
      }, 240);
      return;
    }
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setRenderOpen(true);
    setPanelEntered(false);
    setOpen(true);
    requestAnimationFrame(() => setPanelEntered(true));
  };

  const closeMenu = () => {
    if (!open && !renderOpen) return;
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
    }
    setPanelEntered(false);
    setOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      setRenderOpen(false);
      closeTimerRef.current = null;
    }, 240);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const updateRect = () => {
      if (!buttonRef.current) return;
      setAnchorRect(buttonRef.current.getBoundingClientRect());
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !anchorRect) return;
    const panel = panelRef.current;
    if (!panel) return;
    const panelRect = panel.getBoundingClientRect();
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
    const x = clamp(anchorRect.left + anchorRect.width / 2 - panelRect.left, 10, panelRect.width - 10);
    const y = clamp(anchorRect.top + anchorRect.height / 2 - panelRect.top, 8, panelRect.height - 8);
    setPanelOrigin(`${Math.round(x)}px ${Math.round(y)}px`);
  }, [open, anchorRect, panelEntered, view]);

  useEffect(() => {
    if (!open) return;
    setView("menu");
    if (list.length > 0) return;
    let ignore = false;
    setListLoading(true);
    setListError(null);
    void fetchMeAddressesListSingleFlight()
      .then((result) => {
        if (ignore) return;
        if (!result.ok) {
          setListError(describeMeAddressesListFailure(result, "주소 목록을 불러오지 못했어요."));
          return;
        }
        const rows = result.rows;
        setList(rows);
        if (rows.length > 0) writeCachedMeAddressList(rows);
      })
      .catch(() => {
        if (ignore) return;
        setListError("네트워크 오류로 주소 목록을 불러오지 못했어요.");
      })
      .finally(() => {
        if (ignore) return;
        setListLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [open, list.length]);

  useEffect(() => {
    if (!open) return;
    if (prevViewRef.current === view) return;
    prevViewRef.current = view;
    setViewAnimating(true);
    const t = window.setTimeout(() => setViewAnimating(false), 220);
    return () => window.clearTimeout(t);
  }, [view, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const panelStyle = useMemo(() => {
    if (panelPlacement === "top-right") {
      return { top: 62, right: 12 };
    }
    if (panelPlacement === "anchor-top-right" && anchorRect) {
      const top = Math.max(8, Math.round(anchorRect.top - 10));
      const left = Math.max(8, Math.round(anchorRect.right + 6));
      return { top, left };
    }
    if (!anchorRect) return { top: 62, right: 12 };
    const top = Math.round(anchorRect.bottom + 6);
    const right = Math.max(8, Math.round(window.innerWidth - anchorRect.right));
    return { top, right };
  }, [anchorRect, panelPlacement]);

  async function setAsRepresentative(id: string) {
    const row = list.find((a) => a.id === id);
    if (!row || row.isDefaultMaster || busyId) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/me/addresses/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isDefaultMaster: true,
          isDefaultLife: true,
          isDefaultTrade: true,
          isDefaultDelivery: true,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; address?: UserAddressDTO };
      if (!res.ok || !j.ok) {
        setListError(typeof j.error === "string" ? j.error : "대표 주소를 바꾸지 못했어요.");
        return;
      }
      const updated = list.map((item) => ({
        ...item,
        isDefaultMaster: item.id === id,
        isDefaultLife: item.id === id,
        isDefaultTrade: item.id === id,
        isDefaultDelivery: item.id === id,
      }));
      setList(updated);
      writeCachedMeAddressList(updated);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SAMARKET_ADDRESSES_UPDATED_EVENT));
      }
      setView("menu");
    } catch {
      setListError("네트워크 오류로 대표 주소를 바꾸지 못했어요.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="sam-header-action h-10 w-10 text-sam-primary transition-[transform,background-color,opacity] duration-300 ease-out active:duration-100 active:scale-[0.88] active:bg-sam-primary/10 active:opacity-85"
        aria-label="주소 메뉴 열기"
        aria-expanded={open}
        onClick={toggleMenu}
      >
        <svg className="h-6 w-6 scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21s6-5.1 6-10a6 6 0 10-12 0c0 4.9 6 10 6 10z"
          />
          <circle cx="12" cy="11" r="2" />
        </svg>
      </button>
      {renderOpen && mounted && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[70]" role="presentation">
              <button
                type="button"
                className="absolute inset-0 cursor-default bg-transparent"
                aria-label="주소 메뉴 닫기"
                onClick={closeMenu}
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                className="absolute z-[71] w-[min(92vw,300px)] overflow-hidden rounded-[12px] border border-black/10 bg-white text-neutral-900 shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
                style={{
                  ...panelStyle,
                  transformOrigin: panelOrigin,
                  transform:
                    panelPlacement === "anchor-top-right"
                      ? panelEntered
                        ? "translate3d(0,-100%,0) scale(1)"
                        : "translate3d(18px,calc(-100% - 18px),0) scale(0.82)"
                      : panelEntered
                        ? "translate3d(0,0,0) scale(1)"
                        : "translate3d(18px,-18px,0) scale(0.82)",
                  opacity: panelEntered ? 1 : 0,
                  transition:
                    "transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out",
                  willChange: "transform, opacity",
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    transform: viewAnimating ? "translate3d(0,-6px,0)" : "translate3d(0,0,0)",
                    opacity: viewAnimating ? 0.98 : 1,
                    transition: "transform 210ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out",
                    willChange: "transform, opacity",
                  }}
                >
                {view === "menu" ? (
                  <>
                    <div className="border-b border-black/10 px-3 py-2.5">
                      <p className="text-[12px] leading-4 text-neutral-500">현재 주소</p>
                      <p className="mt-1 truncate text-[14px] font-medium leading-5 text-neutral-900">{addressLine}</p>
                    </div>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-3 text-left text-[14px] leading-5 hover:bg-neutral-50"
                      onClick={() => setView("picker")}
                    >
                      <span>주소 변경</span>
                      <svg
                        className="h-4 w-4 text-neutral-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="max-h-[min(62vh,420px)] overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-black/10 px-3 py-2.5">
                      <button
                        type="button"
                        className="rounded px-1 py-0.5 text-[13px] text-neutral-600 hover:bg-neutral-100"
                        onClick={() => setView("menu")}
                      >
                        뒤로
                      </button>
                      <p className="text-[13px] font-semibold text-neutral-800">주소 변경</p>
                      <span className="w-[28px]" aria-hidden />
                    </div>
                    {listError ? (
                      <p className="px-3 py-2 text-[12px] leading-4 text-amber-700">{listError}</p>
                    ) : null}
                    {listLoading && list.length === 0 ? (
                      <p className="px-3 py-3 text-[13px] text-neutral-600">주소를 불러오는 중...</p>
                    ) : null}
                    {!listLoading && list.length === 0 ? (
                      <p className="px-3 py-3 text-[13px] text-neutral-600">등록된 주소가 없어요.</p>
                    ) : null}
                    {list.map((row) => {
                      const isActive = row.isDefaultMaster;
                      const mainLine = buildAddressManagementListPrimaryLine(row);
                      const busy = busyId === row.id;
                      return (
                        <button
                          key={row.id}
                          type="button"
                          className="flex w-full items-start gap-2 border-t border-black/5 px-3 py-2.5 text-left hover:bg-neutral-50"
                          onClick={() => void setAsRepresentative(row.id)}
                          disabled={busy || busyId != null}
                        >
                          <span
                            className={`mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border ${
                              isActive ? "border-sam-primary bg-sam-primary" : "border-neutral-300 bg-white"
                            }`}
                            aria-hidden
                          >
                            {isActive ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <UserAddressDesignationTitle
                                row={row}
                                className="text-[12px] font-semibold text-neutral-700"
                              />
                              {isActive ? (
                                <span className="rounded-full bg-sam-primary-soft px-1.5 py-[1px] text-[11px] font-medium text-sam-primary">
                                  현재
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block truncate text-[13px] leading-5 text-neutral-700">{mainLine}</span>
                          </span>
                          {busy ? <span className="text-[11px] text-neutral-500">변경중...</span> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
