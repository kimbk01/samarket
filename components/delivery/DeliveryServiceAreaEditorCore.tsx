"use client";

/**
 * Shared Owner/Admin regional delivery service-area editor.
 * Same selection semantics · same API payload shape · different permission routes only.
 *
 * Presentation: two-column base (≈≤R) + extended (≈R..R+10), round multi-select with
 * green check + selected row background, selected chips. No nested list scroll.
 * Customer eligibility remains Owner-selected LGU set (backend V2 LOCKED).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type DeliveryServiceAreaCandidateRow = {
  geoIdentity: string;
  displayName: string;
  isStoreHome: boolean;
  selected: boolean;
  centroidDistanceKm: number | null;
  approxDistanceKm?: number | null;
  isWithinBaseRange?: boolean;
  isWithinExtendedRange?: boolean;
  listBand?: "base" | "extended" | "outside";
};

export type DeliveryServiceAreaEditorPayload = {
  ok: boolean;
  authorityMode?: string;
  storeHomeLguId?: string | null;
  storeHomeDisplayName?: string | null;
  storeNeighborhoodLabel?: string | null;
  storeLat?: number | null;
  storeLng?: number | null;
  referenceDistanceKm?: number;
  candidateSearchKm?: number;
  selectionSource?: "saved" | "initial_base_default";
  candidates?: DeliveryServiceAreaCandidateRow[];
  selectedAreas?: Array<{
    geoIdentity: string;
    displayNameSnapshot: string | null;
    isStoreHome: boolean;
  }>;
  selectedCount?: number;
  error?: string;
};

export type DeliveryServiceAreaEditorSurface = "owner" | "admin";

type Props = {
  storeId: string;
  /** Canonical same-SSOT endpoint for this actor (Owner or Admin). */
  apiPath: string;
  surface: DeliveryServiceAreaEditorSurface;
  /** When R input changes, reload candidates only — selections unchanged until SAVE. */
  referenceRadiusKmDisplay?: string;
  onSaved?: () => void;
};

function applyPayloadToSelection(json: DeliveryServiceAreaEditorPayload): {
  selected: Set<string>;
  extraLabels: Record<string, string>;
} {
  const selected = new Set<string>();
  const extraLabels: Record<string, string> = {};
  for (const c of json.candidates ?? []) {
    if (c.selected) selected.add(c.geoIdentity);
  }
  for (const a of json.selectedAreas ?? []) {
    selected.add(a.geoIdentity);
    if (a.displayNameSnapshot) extraLabels[a.geoIdentity] = a.displayNameSnapshot;
  }
  return { selected, extraLabels };
}

/**
 * Round multi-select — primary selected-state indicator (not native radio).
 * SELECTED: dibaY green fill + white check. UNSELECTED: white center + gray border.
 * Uses --biz-primary / signature (real tokens). Do not use undefined --biz-brand.
 */
function RoundMultiSelect({
  checked,
  surface,
  onToggle,
  label,
}: {
  checked: boolean;
  surface: DeliveryServiceAreaEditorSurface;
  onToggle: () => void;
  label: string;
}) {
  const ring = checked
    ? surface === "admin"
      ? "border-[var(--signature,#0B421A)] bg-[var(--signature,#0B421A)]"
      : "border-[var(--biz-primary,#0B421A)] bg-[var(--biz-primary,#0B421A)]"
    : surface === "admin"
      ? "border-[#b8c0c8] bg-white"
      : "border-[#b8c0c8] bg-white";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      data-round-multi-select={checked ? "selected" : "unselected"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${ring}`}
    >
      {checked ? (
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
          <path
            d="M2 5.6 4.4 8 9 2.8"
            fill="none"
            stroke="#ffffff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </button>
  );
}

/**
 * ONE presentation + selection model for Owner and Admin.
 * Permissions differ only via `apiPath`.
 */
export function DeliveryServiceAreaEditorCore({
  storeId,
  apiPath,
  surface,
  referenceRadiusKmDisplay,
  onSaved,
}: Props) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authorityMode, setAuthorityMode] = useState("legacy_radius");
  const [referenceDistanceKm, setReferenceDistanceKm] = useState<number | null>(null);
  const [candidateSearchKm, setCandidateSearchKm] = useState<number | null>(null);
  const [storeHomeDisplayName, setStoreHomeDisplayName] = useState<string | null>(null);
  const [storeNeighborhoodLabel, setStoreNeighborhoodLabel] = useState<string | null>(null);
  const [storeLat, setStoreLat] = useState<number | null>(null);
  const [storeLng, setStoreLng] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<DeliveryServiceAreaCandidateRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activateV2, setActivateV2] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<
    Array<{ geoIdentity: string; displayName: string; provinceName: string | null }>
  >([]);
  const [extraLabels, setExtraLabels] = useState<Record<string, string>>({});

  const isAdmin = surface === "admin";
  const shellClass = isAdmin
    ? "mt-3 space-y-3 border-t border-sam-border-soft pt-3"
    : "mt-6 space-y-3 border-t border-[var(--biz-card-border)] pt-4";
  const titleClass = isAdmin
    ? "sam-text-helper font-medium text-sam-fg"
    : "text-[14px] font-semibold text-[var(--biz-text)]";
  const mutedClass = isAdmin
    ? "sam-text-helper text-sam-muted"
    : "sam-text-helper text-[var(--biz-text-muted)]";
  const panelClass = isAdmin
    ? "rounded-ui-rect border border-sam-border bg-sam-app p-3"
    : "rounded-ui-rect border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] p-3";
  const baseColumnClass = isAdmin
    ? "rounded-ui-rect border border-emerald-200/80 bg-emerald-50/70 p-2.5"
    : "rounded-ui-rect border border-emerald-200/70 bg-emerald-50/60 p-2.5";
  const extendedColumnClass = isAdmin
    ? "rounded-ui-rect border border-sky-200/80 bg-sky-50/70 p-2.5"
    : "rounded-ui-rect border border-sky-200/70 bg-sky-50/60 p-2.5";
  const baseTitleClass = isAdmin
    ? "text-[12px] font-semibold text-emerald-800"
    : "text-[12px] font-semibold text-emerald-700";
  const extendedTitleClass = isAdmin
    ? "text-[12px] font-semibold text-sky-800"
    : "text-[12px] font-semibold text-sky-700";
  const controlClass = isAdmin
    ? "min-w-0 flex-1 rounded border border-sam-border bg-white px-2.5 py-1.5 sam-text-body text-sam-fg"
    : "min-w-0 flex-1 rounded-xl border border-[var(--biz-card-border)] bg-white px-3 py-2 text-[14px] text-[var(--biz-text)]";
  const bodyTextClass = isAdmin
    ? "min-w-0 sam-text-body text-sam-fg"
    : "min-w-0 text-[13px] text-[var(--biz-text)]";
  const primaryBtnClass = isAdmin
    ? "rounded border border-signature bg-signature px-3 py-1.5 sam-text-helper font-medium text-white hover:opacity-90 disabled:opacity-50"
    : "sam-btn sam-btn-primary";
  const secondaryBtnClass = isAdmin
    ? "shrink-0 rounded border border-signature bg-white px-3 py-1.5 sam-text-helper font-medium text-signature hover:bg-signature/5 disabled:opacity-50"
    : "shrink-0 rounded-xl border border-[var(--biz-brand)] bg-white px-3 py-2 text-[13px] font-medium text-[var(--biz-brand)]";
  const mapBtnClass = isAdmin
    ? "shrink-0 rounded border border-sam-border bg-white px-2.5 py-1 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted"
    : "shrink-0 rounded-lg border border-[var(--biz-card-border)] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[var(--biz-text)]";
  const dangerClass = isAdmin ? "sam-text-helper text-red-600" : "text-[13px] text-[var(--sam-danger)]";
  const selectedRowClass = isAdmin
    ? "bg-emerald-100/90"
    : "bg-emerald-100/80";
  const idleRowClass = "bg-white";
  const chipClass = isAdmin
    ? "inline-flex items-center gap-1 rounded-full border border-sam-border bg-white px-2.5 py-1 sam-text-helper text-sam-fg"
    : "inline-flex items-center gap-1 rounded-full border border-[var(--biz-card-border)] bg-white px-2.5 py-1 text-[12px] text-[var(--biz-text)]";
  const homeBadgeClass =
    "ml-1.5 inline-flex rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white";

  function applyEditorPayload(json: DeliveryServiceAreaEditorPayload) {
    setAuthorityMode(json.authorityMode || "legacy_radius");
    setReferenceDistanceKm(
      typeof json.referenceDistanceKm === "number" ? json.referenceDistanceKm : null
    );
    setCandidateSearchKm(json.candidateSearchKm ?? null);
    setStoreHomeDisplayName(json.storeHomeDisplayName ?? null);
    setStoreNeighborhoodLabel(json.storeNeighborhoodLabel ?? null);
    setStoreLat(typeof json.storeLat === "number" ? json.storeLat : null);
    setStoreLng(typeof json.storeLng === "number" ? json.storeLng : null);
    setCandidates(json.candidates ?? []);
    const applied = applyPayloadToSelection(json);
    setSelected(applied.selected);
    setExtraLabels(applied.extraLabels);
    setActivateV2(json.authorityMode === "v2_lgu");
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiPath, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as DeliveryServiceAreaEditorPayload;
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        return;
      }
      applyEditorPayload(json);
    } catch {
      setError("load_failed");
    } finally {
      setLoading(false);
    }
  }, [apiPath]);

  useEffect(() => {
    void load();
  }, [load, storeId, referenceRadiusKmDisplay]);

  const selectedCount = selected.size;

  const locationLabel = useMemo(() => {
    const city =
      storeHomeDisplayName?.trim() || t("business_delivery_service_area_store_location_unknown");
    const hood = storeNeighborhoodLabel?.trim();
    return hood ? `${city} (${hood})` : city;
  }, [storeHomeDisplayName, storeNeighborhoodLabel, t]);

  const { baseRows, extendedRows, farRows, selectedChips } = useMemo(() => {
    const byId = new Map<string, DeliveryServiceAreaCandidateRow>();
    for (const c of candidates) byId.set(c.geoIdentity, c);
    for (const id of selected) {
      if (!byId.has(id)) {
        byId.set(id, {
          geoIdentity: id,
          displayName: extraLabels[id] || id,
          isStoreHome: false,
          selected: true,
          centroidDistanceKm: null,
          approxDistanceKm: null,
          isWithinBaseRange: false,
          isWithinExtendedRange: false,
          listBand: "outside",
        });
      }
    }
    const all = [...byId.values()];
    const sortRows = (a: DeliveryServiceAreaCandidateRow, b: DeliveryServiceAreaCandidateRow) => {
      if (a.isStoreHome !== b.isStoreHome) return a.isStoreHome ? -1 : 1;
      const da = a.centroidDistanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.centroidDistanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.displayName.localeCompare(b.displayName);
    };
    const base = all
      .filter((r) => r.isStoreHome || r.isWithinBaseRange || r.listBand === "base")
      .sort(sortRows);
    const baseIds = new Set(base.map((r) => r.geoIdentity));
    const extended = all
      .filter(
        (r) =>
          !baseIds.has(r.geoIdentity) &&
          (r.isWithinExtendedRange || r.listBand === "extended")
      )
      .sort(sortRows);
    const listed = new Set([...baseIds, ...extended.map((r) => r.geoIdentity)]);
    const far = all
      .filter((r) => selected.has(r.geoIdentity) && !listed.has(r.geoIdentity))
      .sort(sortRows);
    const chips = [...selected]
      .map((id) => {
        const row = byId.get(id);
        return {
          geoIdentity: id,
          displayName: row?.displayName || extraLabels[id] || id,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    return { baseRows: base, extendedRows: extended, farRows: far, selectedChips: chips };
  }, [candidates, selected, extraLabels]);

  function toggleId(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function distanceLabel(row: DeliveryServiceAreaCandidateRow): string {
    const approx = row.approxDistanceKm;
    if (approx != null) return t("business_delivery_service_area_approx_km", { v1: String(approx) });
    if (row.isStoreHome) return t("business_delivery_service_area_approx_km", { v1: "0" });
    return "";
  }

  async function onSearch() {
    const q = searchQ.trim();
    if (q.length < 2) {
      setSearchHits([]);
      return;
    }
    const res = await fetch(apiPath, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q }),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      results?: Array<{ geoIdentity: string; displayName: string; provinceName: string | null }>;
    };
    setSearchHits(json.results ?? []);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiPath, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geoIdentities: [...selected],
          activateV2: activateV2 === true,
        }),
      });
      const json = (await res.json()) as DeliveryServiceAreaEditorPayload;
      if (!res.ok || !json.ok) {
        setError(json.error || "save_failed");
        return;
      }
      applyEditorPayload(json);
      onSaved?.();
    } catch {
      setError("save_failed");
    } finally {
      setSaving(false);
    }
  }

  function renderRow(row: DeliveryServiceAreaCandidateRow) {
    const checked = selected.has(row.geoIdentity);
    const dist = distanceLabel(row);
    return (
      <li key={row.geoIdentity}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleId(row.geoIdentity)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleId(row.geoIdentity);
            }
          }}
          className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
            checked ? selectedRowClass : idleRowClass
          }`}
          data-selected={checked ? "true" : "false"}
        >
          <RoundMultiSelect
            checked={checked}
            surface={surface}
            label={row.displayName}
            onToggle={() => toggleId(row.geoIdentity)}
          />
          <span className={`${bodyTextClass} flex min-w-0 flex-1 items-center`}>
            <span className="truncate font-medium">{row.displayName}</span>
            {row.isStoreHome ? (
              <span className={homeBadgeClass}>{t("business_delivery_service_area_store_home_badge")}</span>
            ) : null}
          </span>
          {dist ? <span className={`shrink-0 text-[11px] ${mutedClass}`}>{dist}</span> : null}
        </div>
      </li>
    );
  }

  const mapHref =
    storeLat != null && storeLng != null
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${storeLat},${storeLng}`)}`
      : null;

  return (
    <div className={shellClass} data-delivery-service-area-editor={surface} data-store-id={storeId}>
      <h3 className={titleClass}>{t("business_delivery_service_area_section")}</h3>

      {loading ? (
        <p className={mutedClass}>{t("business_delivery_service_area_loading")}</p>
      ) : (
        <>
          <div className={panelClass}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className={`${bodyTextClass} font-medium`}>
                  {t("business_delivery_service_area_store_location")}: {locationLabel}
                </p>
                {referenceDistanceKm != null && candidateSearchKm != null ? (
                  <p className={mutedClass}>
                    {t("business_delivery_service_area_reference_chip", {
                      v1: String(referenceDistanceKm),
                    })}
                    {" · "}
                    {t("business_delivery_service_area_envelope_label")}:{" "}
                    {t("business_delivery_service_area_envelope_value", {
                      v1: String(candidateSearchKm),
                      v2: String(referenceDistanceKm),
                    })}
                  </p>
                ) : null}
              </div>
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={mapBtnClass}
                >
                  {t("business_delivery_service_area_view_map")}
                </a>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div data-delivery-service-area-band="base" className={baseColumnClass}>
                <p className={baseTitleClass}>
                  {t("business_delivery_service_area_base_section")}
                  {referenceDistanceKm != null ? (
                    <span className={`ml-1 font-normal ${mutedClass}`}>
                      ({t("business_delivery_service_area_base_hint", {
                        v1: String(referenceDistanceKm),
                      })})
                    </span>
                  ) : null}
                </p>
                <ul className="mt-1.5 space-y-1">{baseRows.map(renderRow)}</ul>
              </div>

              <div data-delivery-service-area-band="extended" className={extendedColumnClass}>
                <p className={extendedTitleClass}>
                  {t("business_delivery_service_area_extended_section")}
                  {referenceDistanceKm != null && candidateSearchKm != null ? (
                    <span className={`ml-1 font-normal ${mutedClass}`}>
                      ({t("business_delivery_service_area_extended_hint", {
                        v1: String(referenceDistanceKm),
                        v2: String(candidateSearchKm),
                      })})
                    </span>
                  ) : null}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {extendedRows.length > 0
                    ? extendedRows.map(renderRow)
                    : (
                      <li className={`px-2 py-1.5 ${mutedClass}`}>
                        {t("business_delivery_service_area_manual_empty")}
                      </li>
                    )}
                </ul>
              </div>
            </div>
          </div>

          <div data-delivery-service-area-band="manual-far">
            <p className={titleClass}>{t("business_delivery_service_area_manual_far_section")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onSearch();
                  }
                }}
                className={controlClass}
                placeholder={t("business_delivery_service_area_search_placeholder")}
              />
              <button type="button" className={secondaryBtnClass} onClick={() => void onSearch()}>
                + {t("business_delivery_service_area_add_other")}
              </button>
            </div>
            {searchHits.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {searchHits.map((hit) => (
                  <li key={hit.geoIdentity}>
                    <button
                      type="button"
                      className={`${bodyTextClass} text-left underline`}
                      onClick={() => {
                        setSelected((prev) => new Set(prev).add(hit.geoIdentity));
                        setExtraLabels((prev) => ({
                          ...prev,
                          [hit.geoIdentity]: hit.displayName,
                        }));
                        setSearchHits([]);
                        setSearchQ("");
                      }}
                    >
                      + {hit.displayName}
                      {hit.provinceName ? ` (${hit.provinceName})` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div
              className={`mt-2 rounded-ui-rect border border-dashed px-3 py-2 ${
                isAdmin ? "border-sam-border" : "border-[var(--biz-card-border)]"
              }`}
            >
              {farRows.length > 0 ? (
                <ul className="space-y-1">{farRows.map(renderRow)}</ul>
              ) : (
                <p className={mutedClass}>{t("business_delivery_service_area_manual_empty")}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className={`${bodyTextClass} font-semibold`}>
              {t("business_delivery_service_area_selected_count", { v1: String(selectedCount) })}
            </p>
            {selectedChips.map((chip) => (
              <span key={chip.geoIdentity} className={chipClass}>
                {chip.displayName}
                <button
                  type="button"
                  aria-label={`${t("business_delivery_service_area_remove_chip")}: ${chip.displayName}`}
                  className="ml-0.5 text-[14px] leading-none opacity-60 hover:opacity-100"
                  onClick={() => toggleId(chip.geoIdentity)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          {authorityMode !== "v2_lgu" ? (
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className={
                  isAdmin
                    ? "mt-0.5 h-4 w-4 shrink-0 rounded border-sam-border text-signature accent-signature"
                    : "mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--biz-card-border)] text-[var(--biz-brand)]"
                }
                checked={activateV2}
                onChange={(e) => setActivateV2(e.target.checked)}
              />
              <span className={bodyTextClass}>{t("business_delivery_service_area_activate_v2")}</span>
            </label>
          ) : null}

          {error ? <p className={dangerClass}>{error}</p> : null}

          <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => void onSave()}>
            {saving
              ? t("business_delivery_service_area_saving")
              : t("business_delivery_service_area_save")}
          </button>
        </>
      )}
    </div>
  );
}
