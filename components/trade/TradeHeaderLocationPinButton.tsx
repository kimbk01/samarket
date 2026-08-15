"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  SAM_TIER1_HEADER_ACTION_BTN_CLASS,
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_STROKE_WIDTH,
} from "@/lib/ui/tier1-header-icon";
import { fetchAddressDefaultsSnapshot } from "@/lib/addresses/fetch-address-defaults-client";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { resolveCanonicalToLegacyProductAlias } from "@/lib/trade/location/national/legacy-product-alias-canonical";
import { resolveTradeLguNearbyCities } from "@/lib/trade/location/trade-lgu-adjacency";
import {
  TRADE_LOCATION_SEED_PARAM,
  buildTradeCityScopeFromCanonical,
  buildTradeLocationHref,
  parseTradeLocationScopeFromSearchParams,
  peekTradeLguDisplayLabel,
  rememberTradeLguDisplayLabel,
  tradeLocationScopeEquals,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import {
  TradeLocationNationalPicker,
  type TradeNationalPickerHit,
} from "@/components/trade/TradeLocationNationalPicker";

type PanelPhase = "closed" | "open" | "closing";
type PanelView = "main" | "national-picker";
type SectorTab = "all" | "region" | "distance";

const DISTANCE_PRESETS_KM = [5, 10, 20, 30, 50] as const;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
        on ? "border-sam-primary bg-sam-primary" : "border-sam-border"
      }`}
      aria-hidden
    />
  );
}

async function resolveMasterNationalLgu(addr: UserAddressDTO): Promise<{
  canonicalId: string;
  displayName: string;
} | null> {
  const cityMunicipality = (addr.cityMunicipality ?? "").trim();
  const province = (addr.province ?? "").trim();
  if (!cityMunicipality) return null;
  try {
    const sp = new URLSearchParams({ mode: "resolve", cityMunicipality });
    if (province) sp.set("province", province);
    const res = await fetch(`/api/trade/national-lgu?${sp.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      resolution?: {
        status?: string;
        canonicalId?: string;
        lgu?: { displayName?: string; canonicalId?: string };
      };
    };
    if (json.resolution?.status !== "resolved") return null;
    const canonicalId =
      (typeof json.resolution.canonicalId === "string" && json.resolution.canonicalId) ||
      (typeof json.resolution.lgu?.canonicalId === "string" && json.resolution.lgu.canonicalId) ||
      "";
    const displayName =
      (typeof json.resolution.lgu?.displayName === "string" &&
        json.resolution.lgu.displayName.trim()) ||
      "";
    if (!canonicalId || !displayName) return null;
    return { canonicalId, displayName };
  } catch {
    return null;
  }
}

async function fetchNationalLguLabel(canonicalId: string): Promise<string | null> {
  const cached = peekTradeLguDisplayLabel(canonicalId);
  if (cached) return cached;
  try {
    const res = await fetch(
      `/api/trade/national-lgu?id=${encodeURIComponent(canonicalId)}`,
      { method: "GET", credentials: "same-origin", cache: "no-store" }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { item?: { displayName?: string } };
    const name = json.item?.displayName?.trim() ?? "";
    if (!name) return null;
    rememberTradeLguDisplayLabel(canonicalId, name);
    return name;
  } catch {
    return null;
  }
}

/**
 * Trade header MapPin — 3-sector panel: ALL / REGION / DISTANCE(disabled).
 * Immediate commit; Philippines-wide search uses national LGU SSOT (N0–N4).
 */
export function TradeHeaderLocationPinButton() {
  const { t } = useI18n();
  const pathname = usePathname() ?? "/market";
  const searchParams = useSearchParams();
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const [phase, setPhase] = useState<PanelPhase>("closed");
  const [view, setView] = useState<PanelView>("main");
  const [sector, setSector] = useState<SectorTab>("all");
  const [origin, setOrigin] = useState<{ top: number; right: number } | null>(null);
  const [myCanonicalId, setMyCanonicalId] = useState<string | null>(null);
  const [myLguLabel, setMyLguLabel] = useState<string | null>(null);
  const [addressMissing, setAddressMissing] = useState(false);
  const [committedLabel, setCommittedLabel] = useState<string | null>(null);
  const [clipOpen, setClipOpen] = useState(false);

  const committed = parseTradeLocationScopeFromSearchParams(searchParams);
  const isFiltered = committed.mode === "city";

  const myLegacyAlias = useMemo(
    () => (myCanonicalId ? resolveCanonicalToLegacyProductAlias(myCanonicalId) : null),
    [myCanonicalId]
  );

  const nearby = useMemo(
    () =>
      resolveTradeLguNearbyCities(myLegacyAlias, {
        excludeLguId: myLegacyAlias,
        limit: 4,
      }),
    [myLegacyAlias]
  );

  const commitScope = useCallback(
    (next: TradeLocationScope, label?: string | null) => {
      if (next.mode === "city" && label) {
        rememberTradeLguDisplayLabel(next.canonicalId, label);
      }
      if (tradeLocationScopeEquals(next, committed)) {
        setView("main");
        setPhase("closing");
        return;
      }
      const href = buildTradeLocationHref(pathname, searchParams.toString(), next);
      router.replace(href, { scroll: false });
      setView("main");
      setPhase("closing");
    },
    [committed, pathname, router, searchParams]
  );

  const commitCanonical = useCallback(
    (canonicalId: string, displayName?: string | null) => {
      const scope = buildTradeCityScopeFromCanonical(canonicalId);
      if (!scope) return;
      commitScope(scope, displayName ?? null);
    },
    [commitScope]
  );

  const openPanel = useCallback(() => {
    const el = triggerRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setOrigin({ top: r.top, right: window.innerWidth - r.right });
    } else {
      setOrigin({ top: 8, right: 8 });
    }
    setView("main");
    setSector(committed.mode === "city" ? "region" : "all");
    setPhase("open");
    setClipOpen(false);
  }, [committed.mode]);

  useLayoutEffect(() => {
    if (phase !== "open") return;
    if (prefersReducedMotion()) {
      setClipOpen(true);
      return;
    }
    const id = requestAnimationFrame(() => setClipOpen(true));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== "closing") return;
    if (prefersReducedMotion()) {
      setPhase("closed");
      setClipOpen(false);
      setView("main");
      return;
    }
    setClipOpen(false);
    const tmr = window.setTimeout(() => {
      setPhase("closed");
      setView("main");
    }, 280);
    return () => window.clearTimeout(tmr);
  }, [phase]);

  useEffect(() => {
    if (phase === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view === "national-picker") setView("main");
      else setPhase("closing");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, view]);

  useEffect(() => {
    if (phase !== "open") return;
    panelRef.current?.focus();
    return () => {
      triggerRef.current?.focus?.();
    };
  }, [phase, view]);

  useEffect(() => {
    if (committed.mode !== "city") {
      setCommittedLabel(null);
      return;
    }
    const peek = peekTradeLguDisplayLabel(committed.canonicalId);
    if (peek) {
      setCommittedLabel(peek);
      return;
    }
    let cancelled = false;
    void fetchNationalLguLabel(committed.canonicalId).then((name) => {
      if (!cancelled) setCommittedLabel(name);
    });
    return () => {
      cancelled = true;
    };
  }, [committed]);

  const loadMyArea = useCallback(async () => {
    try {
      const snapshot = await fetchAddressDefaultsSnapshot({
        caller: "trade_location_scope",
        reason: "trade_location_panel",
      });
      const master = coerceUserAddressDTO(snapshot?.defaults?.master ?? null);
      if (!master?.id) {
        setAddressMissing(true);
        setMyCanonicalId(null);
        setMyLguLabel(null);
        return;
      }
      const national = await resolveMasterNationalLgu(master);
      if (!national) {
        // Master exists but national LGU unresolved — still not "missing address".
        setAddressMissing(false);
        setMyCanonicalId(null);
        setMyLguLabel(null);
        return;
      }
      setAddressMissing(false);
      setMyCanonicalId(national.canonicalId);
      setMyLguLabel(national.displayName);
      rememberTradeLguDisplayLabel(national.canonicalId, national.displayName);
    } catch {
      setAddressMissing(true);
      setMyCanonicalId(null);
      setMyLguLabel(null);
    }
  }, []);

  useEffect(() => {
    if (phase === "open") void loadMyArea();
  }, [phase, loadMyArea]);

  useEffect(() => {
    if (searchParams.get(TRADE_LOCATION_SEED_PARAM) !== "1") return;
    let cancelled = false;
    void (async () => {
      const snapshot = await fetchAddressDefaultsSnapshot({
        force: true,
        caller: "trade_location_scope",
        reason: "trade_location_seed",
      });
      if (cancelled) return;
      const master = coerceUserAddressDTO(snapshot?.defaults?.master ?? null);
      const national = master ? await resolveMasterNationalLgu(master) : null;
      const params = new URLSearchParams(searchParams.toString());
      params.delete(TRADE_LOCATION_SEED_PARAM);
      const nextScope: TradeLocationScope = national
        ? buildTradeCityScopeFromCanonical(national.canonicalId) ?? { mode: "all" }
        : { mode: "all" };
      if (national && nextScope.mode === "city") {
        rememberTradeLguDisplayLabel(national.canonicalId, national.displayName);
      }
      router.replace(buildTradeLocationHref(pathname, params.toString(), nextScope), {
        scroll: false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, searchParams]);

  const goChangeAddress = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(TRADE_LOCATION_SEED_PARAM, "1");
    const returnPath = `${pathname}?${params.toString()}`;
    setPhase("closed");
    router.push(`/mypage/addresses?returnTo=${encodeURIComponent(returnPath)}`);
  }, [pathname, router, searchParams]);

  const onNationalSelect = useCallback(
    (hit: TradeNationalPickerHit) => {
      commitCanonical(hit.canonicalId, hit.displayName);
    },
    [commitCanonical]
  );

  const panelStyle: CSSProperties | undefined =
    origin && phase !== "closed"
      ? {
          top: Math.max(0, origin.top),
          right: Math.max(0, origin.right),
          left: 0,
          bottom: 0,
          clipPath: clipOpen ? "inset(0 0 0 0)" : "inset(0 0 100% 100%)",
          transition: prefersReducedMotion()
            ? "opacity 120ms ease"
            : "clip-path 280ms cubic-bezier(0.22, 1, 0.36, 1)",
          opacity: clipOpen || prefersReducedMotion() ? 1 : 0.96,
        }
      : undefined;

  const currentSummary =
    committed.mode === "all"
      ? t("trade_location_all")
      : committed.mode === "invalid"
        ? t("trade_location_invalid")
        : committedLabel ?? t("trade_location_section_region");

  const sectorBtn = (id: SectorTab, label: string) => {
    const active = sector === id;
    return (
      <button
        type="button"
        aria-pressed={active}
        className={`min-h-11 flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${
          active ? "bg-sam-primary text-white" : "bg-sam-surface-muted text-sam-fg"
        }`}
        onClick={() => {
          if (id === "all") {
            setSector("all");
            commitScope({ mode: "all" });
            return;
          }
          setSector(id);
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${SAM_TIER1_HEADER_ACTION_BTN_CLASS} relative ${
          isFiltered ? "text-sam-primary" : ""
        }`}
        aria-label={t("trade_location_pin_aria")}
        aria-expanded={phase === "open"}
        aria-haspopup="dialog"
        onClick={() => {
          if (phase === "open") setPhase("closing");
          else openPanel();
        }}
      >
        <MapPin
          className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS}
          strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH}
          aria-hidden
        />
      </button>

      {phase !== "closed" && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[80]" role="presentation">
              <button
                type="button"
                className="absolute inset-0 bg-black/35"
                aria-label={t("trade_location_close")}
                onClick={() => setPhase("closing")}
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="absolute flex flex-col bg-sam-surface text-sam-fg shadow-lg outline-none"
                style={panelStyle}
              >
                <div className="sticky top-0 z-10 border-b border-sam-border bg-sam-surface px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                  <div className="flex items-center justify-between gap-2">
                    <h2 id={titleId} className="text-base font-semibold">
                      {view === "national-picker"
                        ? t("trade_location_ph_full")
                        : t("trade_location_panel_title")}
                    </h2>
                    <button
                      type="button"
                      className={`${Sam.headerAction} text-sam-fg`}
                      aria-label={t("trade_location_close")}
                      onClick={() => setPhase("closing")}
                    >
                      <X className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                  {view === "main" ? (
                    <p className="mt-1 text-sm text-sam-fg-muted">
                      {t("trade_location_panel_subtitle")}
                    </p>
                  ) : null}
                </div>

                {view === "national-picker" ? (
                  <TradeLocationNationalPicker
                    selectedCanonicalId={
                      committed.mode === "city" ? committed.canonicalId : null
                    }
                    onSelect={onNationalSelect}
                    onBack={() => setView("main")}
                  />
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <p className="px-1 text-xs text-sam-fg-muted">
                      {t("trade_location_current")}:{" "}
                      <span className="font-medium text-sam-fg">{currentSummary}</span>
                    </p>

                    <div
                      className="mt-3 flex gap-2"
                      role="tablist"
                      aria-label={t("trade_location_panel_title")}
                    >
                      {sectorBtn("all", t("trade_location_section_all"))}
                      {sectorBtn("region", t("trade_location_section_region"))}
                      {sectorBtn("distance", t("trade_location_section_distance"))}
                    </div>

                    {sector === "all" ? (
                      <section className="mt-4">
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-sam-surface-muted"
                          onClick={() => commitScope({ mode: "all" })}
                        >
                          <RadioDot on={committed.mode === "all"} />
                          <span>
                            <span className="block font-medium">{t("trade_location_all")}</span>
                            <span className="mt-0.5 block text-sm text-sam-fg-muted">
                              {t("trade_location_all_hint")}
                            </span>
                          </span>
                        </button>
                      </section>
                    ) : null}

                    {sector === "region" ? (
                      <section className="mt-4">
                        <p className="px-1 text-xs font-medium text-sam-fg-muted">
                          {t("trade_location_my_address")}
                        </p>
                        {addressMissing ? (
                          <div className="mt-1 space-y-2 px-1">
                            <p className="text-sm text-sam-fg-muted">
                              {t("trade_location_need_address")}
                            </p>
                            <button
                              type="button"
                              className={`${Sam.sm.btnSecondary} min-h-11 w-full`}
                              onClick={goChangeAddress}
                            >
                              {t("trade_location_set_address")}
                            </button>
                          </div>
                        ) : myCanonicalId && myLguLabel ? (
                          <div className="mt-1">
                            <button
                              type="button"
                              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-sam-surface-muted"
                              onClick={() => commitCanonical(myCanonicalId, myLguLabel)}
                            >
                              <RadioDot
                                on={
                                  committed.mode === "city" &&
                                  committed.canonicalId === myCanonicalId
                                }
                              />
                              <span className="font-medium">{myLguLabel}</span>
                            </button>
                            <button
                              type="button"
                              className="mt-1 min-h-11 px-2 text-sm font-medium text-sam-primary"
                              onClick={goChangeAddress}
                            >
                              {t("trade_location_change_address")}
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1 space-y-2 px-1">
                            <p className="text-sm text-sam-fg-muted">
                              {t("trade_location_my_address_unresolved")}
                            </p>
                            <button
                              type="button"
                              className="min-h-11 px-1 text-sm font-medium text-sam-primary"
                              onClick={goChangeAddress}
                            >
                              {t("trade_location_change_address")}
                            </button>
                          </div>
                        )}

                        {nearby.length > 0 ? (
                          <>
                            <p className="mt-4 px-1 text-xs font-medium text-sam-fg-muted">
                              {t("trade_location_nearby")}
                            </p>
                            <ul className="mt-1 space-y-0.5">
                              {nearby.map((c) => {
                                const scope = buildTradeCityScopeFromCanonical(c.id);
                                const on =
                                  committed.mode === "city" &&
                                  scope != null &&
                                  committed.canonicalId === scope.canonicalId;
                                return (
                                  <li key={c.id}>
                                    <button
                                      type="button"
                                      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-sam-surface-muted"
                                      onClick={() => {
                                        if (!scope) return;
                                        commitScope(scope, c.displayName);
                                      }}
                                    >
                                      <RadioDot on={on} />
                                      <span className="font-medium">{c.displayName}</span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        ) : null}

                        {committed.mode === "city" &&
                        committedLabel &&
                        committed.canonicalId !== myCanonicalId &&
                        !nearby.some((n) => {
                          const s = buildTradeCityScopeFromCanonical(n.id);
                          return s?.canonicalId === committed.canonicalId;
                        }) ? (
                          <div className="mt-4">
                            <p className="px-1 text-xs font-medium text-sam-fg-muted">
                              {t("trade_location_current")}
                            </p>
                            <button
                              type="button"
                              className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-3 text-left hover:bg-sam-surface-muted"
                              onClick={() =>
                                commitCanonical(committed.canonicalId, committedLabel)
                              }
                            >
                              <RadioDot on />
                              <span className="font-medium">{committedLabel}</span>
                            </button>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          className={`${Sam.sm.btnPrimary} mt-4 min-h-11 w-full`}
                          onClick={() => setView("national-picker")}
                        >
                          {t("trade_location_ph_full")}
                        </button>
                      </section>
                    ) : null}

                    {sector === "distance" ? (
                      <section className="mt-4" aria-disabled="true">
                        <p className="px-1 text-sm font-medium text-sam-fg">
                          {t("trade_location_distance_soon")}
                        </p>
                        <p className="mt-1 px-1 text-sm text-sam-fg-muted">
                          {t("trade_location_distance_hint")}
                        </p>
                        <ul className="mt-3 space-y-1 opacity-50">
                          {DISTANCE_PRESETS_KM.map((n) => (
                            <li key={n}>
                              <div className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2.5">
                                <RadioDot on={false} />
                                <span className="text-sm">
                                  {t("trade_location_distance_km", { n: String(n) })}
                                </span>
                              </div>
                            </li>
                          ))}
                          <li>
                            <div className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2.5">
                              <RadioDot on={false} />
                              <span className="text-sm">
                                {t("trade_location_distance_custom")}
                              </span>
                            </div>
                          </li>
                        </ul>
                      </section>
                    ) : null}
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
