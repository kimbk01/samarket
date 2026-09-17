"use client";

/**
 * Shared Owner/Admin regional delivery service-area editor.
 * Same selection semantics · same API payload shape · different permission routes only.
 *
 * Presentation: base (≈≤R) + extended (≈R–2R) lists with round multi-select controls.
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
  const ring =
    surface === "admin"
      ? checked
        ? "border-signature bg-signature"
        : "border-sam-border bg-sam-app"
      : checked
        ? "border-[var(--biz-brand)] bg-[var(--biz-brand)]"
        : "border-[var(--biz-card-border)] bg-[var(--biz-card-bg)]";
  const dot = checked ? "bg-white" : "bg-transparent";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${ring}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
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
  const [candidates, setCandidates] = useState<DeliveryServiceAreaCandidateRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activateV2, setActivateV2] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<
    Array<{ geoIdentity: string; displayName: string; provinceName: string | null }>
  >([]);
  const [extraLabels, setExtraLabels] = useState<Record<string, string>>({});
  const [showFarSearch, setShowFarSearch] = useState(false);

  const shellClass =
    surface === "admin"
      ? "mt-3 space-y-3 border-t border-sam-border-soft pt-3"
      : "mt-6 space-y-4 border-t border-[var(--biz-card-border)] pt-4";
  const titleClass =
    surface === "admin"
      ? "sam-text-helper font-medium text-sam-fg"
      : "text-[14px] font-semibold text-[var(--biz-text)]";
  const mutedClass =
    surface === "admin" ? "sam-text-helper text-sam-muted" : "sam-text-helper text-[var(--biz-text-muted)]";
  const labelClass =
    surface === "admin"
      ? "sam-text-helper font-medium text-sam-fg"
      : "mb-1.5 block text-[12px] font-semibold text-[var(--biz-text)]";
  const sectionTitleClass =
    surface === "admin"
      ? "sam-text-helper font-semibold text-sam-fg"
      : "text-[13px] font-semibold text-[var(--biz-text)]";
  const controlClass =
    surface === "admin"
      ? "w-full max-w-xs rounded border border-sam-border bg-sam-app px-2.5 py-1.5 sam-text-body text-sam-fg"
      : "w-full rounded-xl border border-[var(--biz-card-border)] bg-[var(--biz-card-bg)] px-3 py-2 text-[14px] text-[var(--biz-text)] max-w-xs";
  const bodyTextClass =
    surface === "admin" ? "min-w-0 sam-text-body text-sam-fg" : "min-w-0 text-[13px] text-[var(--biz-text)]";
  const linkClass =
    surface === "admin"
      ? "text-left sam-text-body text-signature underline"
      : "text-left text-[13px] text-[var(--biz-brand)] underline";
  const primaryBtnClass =
    surface === "admin"
      ? "rounded border border-signature bg-signature px-3 py-1.5 sam-text-helper font-medium text-white hover:opacity-90 disabled:opacity-50"
      : "sam-btn sam-btn-primary";
  const secondaryBtnClass =
    surface === "admin"
      ? "rounded border border-sam-border bg-sam-app px-3 py-1.5 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted disabled:opacity-50"
      : "sam-btn sam-btn-secondary";
  const dangerClass =
    surface === "admin" ? "sam-text-helper text-red-600" : "text-[13px] text-[var(--sam-danger)]";

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
      setAuthorityMode(json.authorityMode || "legacy_radius");
      setReferenceDistanceKm(
        typeof json.referenceDistanceKm === "number" ? json.referenceDistanceKm : null
      );
      setCandidateSearchKm(json.candidateSearchKm ?? null);
      setStoreHomeDisplayName(json.storeHomeDisplayName ?? null);
      setCandidates(json.candidates ?? []);
      const applied = applyPayloadToSelection(json);
      setSelected(applied.selected);
      setExtraLabels(applied.extraLabels);
      setActivateV2(json.authorityMode === "v2_lgu");
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

  const { baseRows, extendedRows, farRows } = useMemo(() => {
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
    const far = all.filter((r) => selected.has(r.geoIdentity) && !listed.has(r.geoIdentity)).sort(sortRows);
    return { baseRows: base, extendedRows: extended, farRows: far };
  }, [candidates, selected, extraLabels]);

  function toggleId(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function rowSubtitle(row: DeliveryServiceAreaCandidateRow): string {
    if (row.isStoreHome) return t("business_delivery_service_area_store_home_badge");
    const approx = row.approxDistanceKm;
    if (approx != null) return t("business_delivery_service_area_approx_km", { v1: String(approx) });
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
      setAuthorityMode(json.authorityMode || "legacy_radius");
      setReferenceDistanceKm(
        typeof json.referenceDistanceKm === "number" ? json.referenceDistanceKm : null
      );
      setCandidateSearchKm(json.candidateSearchKm ?? null);
      setStoreHomeDisplayName(json.storeHomeDisplayName ?? null);
      setCandidates(json.candidates ?? []);
      const applied = applyPayloadToSelection(json);
      setSelected(applied.selected);
      setExtraLabels(applied.extraLabels);
      setActivateV2(json.authorityMode === "v2_lgu");
      onSaved?.();
    } catch {
      setError("save_failed");
    } finally {
      setSaving(false);
    }
  }

  function renderRow(row: DeliveryServiceAreaCandidateRow) {
    const checked = selected.has(row.geoIdentity);
    const sub = rowSubtitle(row);
    return (
      <li key={row.geoIdentity}>
        <div className="flex items-start gap-2.5">
          <RoundMultiSelect
            checked={checked}
            surface={surface}
            label={row.displayName}
            onToggle={() => toggleId(row.geoIdentity)}
          />
          <button
            type="button"
            className={`${bodyTextClass} flex-1 text-left`}
            onClick={() => toggleId(row.geoIdentity)}
          >
            <span className="font-medium">{row.displayName}</span>
            {sub ? <span className={`ml-2 text-[12px] ${mutedClass}`}>{sub}</span> : null}
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className={shellClass} data-delivery-service-area-editor={surface} data-store-id={storeId}>
      <div>
        <h3 className={titleClass}>{t("business_delivery_service_area_section")}</h3>
        <p className={`${mutedClass} mt-1`}>
          {t("business_delivery_service_area_store_location")}:{" "}
          <span className="font-medium text-sam-fg">
            {storeHomeDisplayName?.trim() || t("business_delivery_service_area_store_location_unknown")}
          </span>
        </p>
        {referenceDistanceKm != null ? (
          <p className={`${mutedClass} mt-1`}>
            {t("business_store_delivery_radius_label")}:{" "}
            <span className="font-medium text-sam-fg">{referenceDistanceKm} km</span>
          </p>
        ) : null}
        {referenceDistanceKm != null && candidateSearchKm != null ? (
          <p className={`${mutedClass} mt-1`}>
            {t("business_delivery_service_area_list_help", {
              v1: String(candidateSearchKm),
              v2: String(referenceDistanceKm),
            })}
          </p>
        ) : (
          <p className={`${mutedClass} mt-1`}>{t("business_delivery_service_area_help")}</p>
        )}
        <p className={`${mutedClass} mt-1`}>
          {t("business_delivery_service_area_authority_label")}:{" "}
          <span className="font-medium text-sam-fg">
            {authorityMode === "v2_lgu"
              ? t("business_delivery_service_area_authority_v2")
              : t("business_delivery_service_area_authority_legacy")}
          </span>
        </p>
      </div>

      {loading ? (
        <p className={mutedClass}>{t("business_delivery_service_area_loading")}</p>
      ) : (
        <>
          <div data-delivery-service-area-band="base">
            <p className={sectionTitleClass}>{t("business_delivery_service_area_base_section")}</p>
            <p className={`${mutedClass} mt-0.5`}>
              {t("business_delivery_service_area_base_hint", {
                v1: String(referenceDistanceKm ?? ""),
              })}
            </p>
            <ul className="mt-2 space-y-2.5">{baseRows.map(renderRow)}</ul>
          </div>

          {extendedRows.length > 0 ? (
            <div data-delivery-service-area-band="extended">
              <p className={sectionTitleClass}>{t("business_delivery_service_area_extended_section")}</p>
              <p className={`${mutedClass} mt-0.5`}>
                {t("business_delivery_service_area_extended_hint", {
                  v1: String(referenceDistanceKm ?? ""),
                  v2: String(candidateSearchKm ?? ""),
                })}
              </p>
              <ul className="mt-2 space-y-2.5">{extendedRows.map(renderRow)}</ul>
            </div>
          ) : null}

          {farRows.length > 0 ? (
            <div data-delivery-service-area-band="manual-far">
              <p className={sectionTitleClass}>{t("business_delivery_service_area_manual_far_section")}</p>
              <ul className="mt-2 space-y-2.5">{farRows.map(renderRow)}</ul>
            </div>
          ) : null}

          <div>
            {!showFarSearch ? (
              <button
                type="button"
                className={linkClass}
                onClick={() => setShowFarSearch(true)}
              >
                + {t("business_delivery_service_area_add_other")}
              </button>
            ) : (
              <>
                <p className={labelClass}>{t("business_delivery_service_area_add_other")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="search"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    className={controlClass}
                    placeholder={t("business_delivery_service_area_search_placeholder")}
                  />
                  <button type="button" className={secondaryBtnClass} onClick={() => void onSearch()}>
                    {t("business_delivery_service_area_search")}
                  </button>
                </div>
                {searchHits.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {searchHits.map((hit) => (
                      <li key={hit.geoIdentity}>
                        <button
                          type="button"
                          className={linkClass}
                          onClick={() => {
                            setSelected((prev) => new Set(prev).add(hit.geoIdentity));
                            setExtraLabels((prev) => ({
                              ...prev,
                              [hit.geoIdentity]: hit.displayName,
                            }));
                          }}
                        >
                          + {hit.displayName}
                          {hit.provinceName ? ` (${hit.provinceName})` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <p className={mutedClass}>
            {t("business_delivery_service_area_selected_count", { v1: String(selectedCount) })}
          </p>

          {authorityMode !== "v2_lgu" ? (
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className={
                  surface === "admin"
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
