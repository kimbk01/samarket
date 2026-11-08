"use client";

/**
 * Owner Platform Popup apply workspace — product UX completion.
 * Surface multi-select + CTA destinations + visible crop + Cash recovery with requestId.
 */

import { OwnerCta } from "@/lib/business/owner-cta-classes";
import { OwnerStoreAdminConfirmModal } from "@/components/business/owner/OwnerStoreAdminConfirmModal";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import {
  OWNER_STORE_PROFILE_CONTROL_CLASS,
  OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS,
  OWNER_STORE_PROFILE_FIELD_LABEL_CLASS,
  OWNER_STORE_STACK_Y_CLASS,
} from "@/lib/business/owner-store-stack";
import {
  OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS,
  OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS,
  OWNER_STORE_ADMIN_FOOTER_INNER_CLASS,
  OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS,
} from "@/lib/business/owner-admin-footer-actions";
import { useOwnerAdminFormKeyboard } from "@/lib/business/use-owner-admin-form-keyboard";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import type { PlatformPopupAdPackageRow, PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";
import { PLATFORM_POPUP_OWNER_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import {
  PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS,
  adminSurfacesFromDb,
  adminSurfacesSelectionLabel,
  isAdminSurfaceSelected,
  surfacesFromAdminSelection,
  toggleAdminSurfaceSelection,
} from "@/lib/platform-popup/admin-surface-target-mode";
import type { PlatformPopupTargetSurface } from "@/lib/platform-popup/types";
import {
  decodePlatformPopupOwnerCtaDestination,
  encodePlatformPopupOwnerCtaDestination,
  platformPopupOwnerCtaKindLabel,
  type PlatformPopupOwnerCtaKind,
  PLATFORM_POPUP_OWNER_CTA_KINDS,
} from "@/lib/platform-popup/popup-cta-destination-ux";
import {
  buildPlatformPopupCenterCropPreviewUrl,
  readPlatformPopupImageMeta,
  type PlatformPopupClientImageMeta,
} from "@/lib/platform-popup/client-creative-crop-preview";
import { DIBAY_CANONICAL_POPUP_CREATIVE_SIZE } from "@/lib/platform-popup/creative-pixel-ssot";
import { OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED } from "@/lib/platform-popup/owner-popup-new-sales-gate";
import { translateBy } from "@/lib/i18n/translate-by";

type EligibleStore = {
  id: string;
  storeName: string;
  eligible: boolean;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function OwnerPlatformPopupApplyView() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const searchParams = useSearchParams();
  const preloadStoreId = searchParams.get("storeId")?.trim() ?? "";
  const preloadRequestId = searchParams.get("requestId")?.trim() ?? "";
  const { formPadStyle, footerPadStyle, footerFixedClassName } = useOwnerAdminFormKeyboard({
    aboveBottomNav: true,
  });

  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [packages, setPackages] = useState<PlatformPopupAdPackageRow[]>([]);
  const [cashBalanceMinor, setCashBalanceMinor] = useState(0);
  const [storeId, setStoreId] = useState(preloadStoreId);
  const [request, setRequest] = useState<PlatformPopupOwnerRequestRow | null>(null);
  const [selectedSurfaces, setSelectedSurfaces] = useState<PlatformPopupTargetSurface[]>(["GLOBAL"]);
  const [ctaKind, setCtaKind] = useState<PlatformPopupOwnerCtaKind>("store");
  const [packageId, setPackageId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fileMeta, setFileMeta] = useState<PlatformPopupClientImageMeta | null>(null);
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = useState<string | null>(null);
  const [idempotencyKey] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `popup_${Date.now()}`
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storesRes, pkgRes] = await Promise.all([
          fetch("/api/me/delivery-ads", { credentials: "include" }),
          fetch("/api/me/platform-popup-packages", { credentials: "include" }),
        ]);
        const storesJson = (await storesRes.json().catch(() => ({}))) as {
          stores?: EligibleStore[];
          businessCash?: { balanceMinor?: number };
        };
        const pkgJson = (await pkgRes.json().catch(() => ({}))) as {
          packages?: PlatformPopupAdPackageRow[];
        };
        if (cancelled) return;
        const list = (storesJson.stores ?? []).filter((s) => s.eligible);
        setStores(list);
        setCashBalanceMinor(
          typeof storesJson.businessCash?.balanceMinor === "number"
            ? storesJson.businessCash.balanceMinor
            : 0
        );
        setPackages(pkgJson.packages ?? []);

        if (preloadRequestId) {
          const res = await fetch(
            `/api/me/platform-popup-requests/${encodeURIComponent(preloadRequestId)}`,
            { credentials: "include" }
          );
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            item?: PlatformPopupOwnerRequestRow;
          };
          if (!cancelled && res.ok && json.ok && json.item) {
            const item = json.item;
            setRequest(item);
            setStoreId(item.storeId);
            setSelectedSurfaces(adminSurfacesFromDb(item.requestedSurfaces));
            setPackageId(item.packageId ?? "");
            setStartAt(toLocalInput(item.requestedStartAt));
            setEndAt(toLocalInput(item.requestedEndAt));
            setCtaKind(
              decodePlatformPopupOwnerCtaDestination({
                ctaType: item.ctaType,
                ctaTarget: item.ctaTarget,
                storeId: item.storeId,
              })
            );
            return;
          }
        }

        if (preloadStoreId && list.some((s) => s.id === preloadStoreId)) {
          setStoreId(preloadStoreId);
        } else if (list.length === 1) {
          setStoreId(list[0]!.id);
        }
        if ((pkgJson.packages ?? []).length === 1) {
          setPackageId(pkgJson.packages![0]!.id);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadStoreId, preloadRequestId]);

  useEffect(() => {
    return () => {
      if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl);
    };
  }, [cropPreviewUrl]);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) ?? null,
    [packages, packageId]
  );

  const encodedCta = useMemo(() => {
    if (!storeId) return null;
    const r = encodePlatformPopupOwnerCtaDestination({ kind: ctaKind, storeId });
    return r.ok ? r.value : null;
  }, [ctaKind, storeId]);

  const afterBalance =
    selectedPackage != null ? cashBalanceMinor - selectedPackage.priceMinor : null;
  const insufficient =
    selectedPackage != null && cashBalanceMinor < selectedPackage.priceMinor;

  const ensureDraft = useCallback(async (): Promise<PlatformPopupOwnerRequestRow | null> => {
    if (request) return request;
    if (!storeId) {
      setError("store_required");
      return null;
    }
    const res = await fetch("/api/me/platform-popup-requests", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      item?: PlatformPopupOwnerRequestRow;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.item) {
      setError(json.error || "create_failed");
      return null;
    }
    setRequest(json.item);
    return json.item;
  }, [request, storeId]);

  const saveDraft = useCallback(async (): Promise<PlatformPopupOwnerRequestRow | null> => {
    setBusy(true);
    setError(null);
    try {
      const draft = await ensureDraft();
      if (!draft) return null;
      const cta = encodePlatformPopupOwnerCtaDestination({ kind: ctaKind, storeId: draft.storeId });
      if (!cta.ok) {
        setError(cta.error);
        return null;
      }
      const res = await fetch(`/api/me/platform-popup-requests/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: packageId || null,
          surfaces: surfacesFromAdminSelection(selectedSurfaces),
          startAt: fromLocalInput(startAt),
          endAt: fromLocalInput(endAt),
          ctaType: cta.value.ctaType,
          ctaTarget: cta.value.ctaTarget,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        item?: PlatformPopupOwnerRequestRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.item) {
        setError(json.error || "save_failed");
        return null;
      }
      setRequest(json.item);
      return json.item;
    } finally {
      setBusy(false);
    }
  }, [ensureDraft, packageId, selectedSurfaces, startAt, endAt, ctaKind]);

  const onPickFile = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const meta = await readPlatformPopupImageMeta(file);
      setFileMeta(meta);
      if (meta.ratioOk) {
        setPendingCropFile(null);
        if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl);
        setCropPreviewUrl(null);
        await uploadCreative(file, false);
        return;
      }
      const crop = await buildPlatformPopupCenterCropPreviewUrl(file);
      if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl);
      setCropPreviewUrl(crop.objectUrl);
      setPendingCropFile(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "image_failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadCreative = async (file: File, applyCrop: boolean) => {
    const draft = (await saveDraft()) ?? (await ensureDraft());
    if (!draft) return;
    const form = new FormData();
    form.set("file", file);
    if (applyCrop) form.set("applyCrop", "center");
    const res = await fetch(
      `/api/me/platform-popup-requests/${encodeURIComponent(draft.id)}/creative`,
      { method: "POST", credentials: "include", body: form }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      item?: PlatformPopupOwnerRequestRow;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.item) {
      setError(json.error || "upload_failed");
      return;
    }
    setRequest(json.item);
    setPendingCropFile(null);
    if (cropPreviewUrl) URL.revokeObjectURL(cropPreviewUrl);
    setCropPreviewUrl(null);
    setFileMeta(null);
  };

  const applyCropAndUpload = async () => {
    if (!pendingCropFile) return;
    setBusy(true);
    setError(null);
    try {
      await uploadCreative(pendingCropFile, true);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const draft = await saveDraft();
      if (!draft) return;
      if (insufficient) {
        setError("INSUFFICIENT_BUSINESS_CASH");
        setConfirmOpen(false);
        return;
      }
      const res = await fetch(
        `/api/me/platform-popup-requests/${encodeURIComponent(draft.id)}/submit`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        item?: PlatformPopupOwnerRequestRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.item) {
        setError(json.error || "submit_failed");
        return;
      }
      router.push(PLATFORM_POPUP_OWNER_ROUTES.popupRequestDetail(json.item.id));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  const previewUrl = request?.creativeAssetUrl ?? null;
  const storeName = stores.find((s) => s.id === storeId)?.storeName ?? storeId;
  const applyPathWithIds = (() => {
    const q = new URLSearchParams();
    if (storeId) q.set("storeId", storeId);
    if (request?.id) q.set("requestId", request.id);
    const qs = q.toString();
    return `${PLATFORM_POPUP_OWNER_ROUTES.createPlatformPopup}${qs ? `?${qs}` : ""}`;
  })();
  const financeBase = OwnerRoutes.finance(storeId);
  const financeHref = `${financeBase}${financeBase.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(
    applyPathWithIds
  )}`;

  if (!loaded) {
    return (
      <p className="p-4 text-sm text-sam-muted">
        {safeT("owner_platform_popup_loading")}
      </p>
    );
  }

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} pb-24`}
      style={formPadStyle}
      data-owner-platform-popup-apply="1"
    >
      {!OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED && !preloadRequestId ? (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
          data-owner-platform-popup-new-sales="disabled"
        >
          <h1 className="text-lg font-bold text-sam-fg">
            {safeT("owner_platform_popup_apply_title")}
          </h1>
          <p className="mt-2 text-sm text-sam-muted">
            {safeT("owner_platform_popup_new_sales_disabled")}
          </p>
        </div>
      ) : (
        <>
      <h1 className="text-lg font-bold text-sam-fg">
        {safeT("owner_platform_popup_apply_title")}
      </h1>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_what_title")}
      >
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-sam-muted">
          <li>
            {safeT("owner_platform_popup_what_1")}
          </li>
          <li>
            {safeT("owner_platform_popup_what_2")}
          </li>
          <li>
            {safeT("owner_platform_popup_what_3")}
          </li>
        </ul>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_preview")}
      >
        <p className="mb-2 text-[13px] text-sam-muted">
          {safeT("owner_platform_popup_preview_hint")}
        </p>
        <div className="mx-auto w-full max-w-[360px] rounded-ui-rect border border-sam-border bg-sam-app p-3">
          {previewUrl ? (
            <DibayPopupAd
              campaignId={request?.id ?? "preview"}
              surface="TRADE"
              creative={{
                id: "preview",
                imageUrl: previewUrl,
                altText: request?.creativeAltText || "Advertisement",
                aspectW: 36,
                aspectH: 25,
                creativeMode: "card",
              }}
              cta={{
                type: encodedCta?.ctaType ?? "store",
                href: encodedCta?.href ?? `/stores/${storeId || "preview"}`,
                label: null,
              }}
              suppressionOptions={resolvePlatformPopupPresentationSuppressionOptions({
                suppressionMode: "TODAY",
                suppressionDurationSeconds: null,
              })}
              exposureId="owner-preview"
              embedded
              onClose={() => {}}
              onSuppress={() => {}}
              onCta={() => {}}
              onImpression={() => {}}
              onImageError={() => {}}
            />
          ) : (
            <div
              className="flex aspect-[36/25] items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-sm text-sam-muted"
              data-owner-popup-preview-placeholder="1"
            >
              {safeT("owner_platform_popup_preview_placeholder")}
            </div>
          )}
        </div>
      </OwnerStoreAdminDashSection>

      {error ? (
        <div className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger-soft p-3 text-sm text-sam-danger" role="alert">
          {error === "INSUFFICIENT_BUSINESS_CASH" ? (
            <>
              <p>
                {safeT("owner_platform_popup_insufficient")}
              </p>
              <Link href={financeHref} className="mt-2 inline-flex font-semibold underline">
                {safeT("owner_platform_popup_go_finance")}
              </Link>
            </>
          ) : (
            error
          )}
        </div>
      ) : null}

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_store")}
      >
        <div className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
          <label className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>
            <select
              className={OWNER_STORE_PROFILE_CONTROL_CLASS}
              value={storeId}
              disabled={Boolean(request)}
              onChange={(e) => setStoreId(e.target.value)}
            >
              <option value="">—</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.storeName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_surfaces")}
      >
        <fieldset className="space-y-2" data-owner-popup-surface-select="1">
          {PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((opt) => {
            const selected = isAdminSurfaceSelected(selectedSurfaces, opt.mode);
            const isGlobal = opt.mode === "GLOBAL";
            return (
              <label
                key={opt.mode}
                className={`flex cursor-pointer items-start gap-2 rounded-ui-rect border px-3 py-2 text-sm transition-colors ${
                  selected
                    ? "border-sam-primary bg-sam-primary/10 text-sam-fg"
                    : "border-sam-border bg-sam-surface text-sam-fg"
                }`}
                data-owner-popup-surface-option={opt.mode}
                data-selected={selected ? "1" : "0"}
              >
                <input
                  type={isGlobal ? "radio" : "checkbox"}
                  name={isGlobal ? "owner-popup-surface-global" : undefined}
                  className="mt-1 accent-[var(--sam-primary)]"
                  checked={selected}
                  onChange={() => {
                    setSelectedSurfaces((prev) =>
                      toggleAdminSurfaceSelection(prev, opt.mode, isGlobal ? true : !selected)
                    );
                  }}
                />
                <span>
                  <span className={`font-medium ${selected ? "text-sam-primary" : ""}`}>
                    {lang === "en" ? opt.labelEn : opt.labelKo}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-sam-muted">
                    {lang === "en" ? opt.helpEn : opt.helpKo}
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-sam-muted">
                    {lang === "en" ? opt.pagesEn : opt.pagesKo}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <p className="mt-2 text-[12px] text-sam-muted">
          {translateBy(lang, "business_selected")}:{" "}
          {adminSurfacesSelectionLabel(selectedSurfaces, lang)}
        </p>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_cta")}
      >
        <fieldset className="space-y-2" data-owner-popup-cta-radio="1">
          {PLATFORM_POPUP_OWNER_CTA_KINDS.map((kind) => (
            <label key={kind} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="owner-popup-cta"
                checked={ctaKind === kind}
                onChange={() => setCtaKind(kind)}
              />
              <span>{platformPopupOwnerCtaKindLabel(kind, lang)}</span>
            </label>
          ))}
        </fieldset>
        <p className="mt-2 text-[13px] text-sam-muted">
          {storeName || "—"} · {encodedCta?.href || "—"}
        </p>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_schedule")}
      >
        <p className="mb-2 text-[12px] text-sam-muted">
          {translateBy(lang, "business_dates_use_philippines_time_asia_manila")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
            <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>
              {translateBy(lang, "business_start")}
            </span>
            <input
              type="datetime-local"
              className={OWNER_STORE_PROFILE_CONTROL_CLASS}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
            <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>
              {translateBy(lang, "business_end")}
            </span>
            <input
              type="datetime-local"
              className={OWNER_STORE_PROFILE_CONTROL_CLASS}
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </label>
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_package")}
      >
        {packages.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("owner_platform_popup_no_package")}
          </p>
        ) : (
          <div className="space-y-2">
            {packages.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`flex w-full items-center justify-between rounded-ui-rect border px-3 py-3 text-left ${
                  packageId === p.id ? "border-sam-primary bg-sam-primary-soft" : "border-sam-border bg-sam-surface"
                }`}
                onClick={() => setPackageId(p.id)}
              >
                <span className="font-medium text-sam-fg">{p.name}</span>
                <span className="tabular-nums text-sam-fg">
                  {formatDeliveryAdPhpMinor(p.priceMinor)} · {p.durationDays}d
                </span>
              </button>
            ))}
          </div>
        )}
        <dl className="mt-3 grid gap-1 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-sam-muted">{translateBy(lang, "business_ad_price")}</dt>
            <dd className="tabular-nums font-semibold">
              {selectedPackage ? formatDeliveryAdPhpMinor(selectedPackage.priceMinor) : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sam-muted">{translateBy(lang, "business_current_cash")}</dt>
            <dd className="tabular-nums font-semibold">{formatDeliveryAdPhpMinor(cashBalanceMinor)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sam-muted">{translateBy(lang, "business_after_payment")}</dt>
            <dd className={`tabular-nums font-semibold ${insufficient ? "text-sam-danger" : ""}`}>
              {afterBalance == null ? "—" : formatDeliveryAdPhpMinor(Math.max(0, afterBalance))}
            </dd>
          </div>
        </dl>
        {insufficient ? (
          <Link href={financeHref} className="mt-2 inline-flex text-sm font-semibold text-sam-primary underline">
            {safeT("owner_platform_popup_go_finance")}
          </Link>
        ) : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_creative")}
      >
        <p className="mb-2 text-[13px] text-sam-muted">
          {DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width} × {DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height} · 36:25 ·
          JPG/PNG/WEBP
        </p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || !storeId}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPickFile(f);
            e.target.value = "";
          }}
        />
        {fileMeta ? (
          <p className="mt-2 text-xs text-sam-muted">
            {fileMeta.fileName} · {fileMeta.width}×{fileMeta.height} ·{" "}
            {Math.round(fileMeta.fileSize / 1024)}KB
            {fileMeta.ratioOk ? " · 36:25 OK" : " · needs crop"}
          </p>
        ) : null}
        {pendingCropFile && cropPreviewUrl ? (
          <div className="mt-3 space-y-2" data-owner-popup-visible-crop="1">
            <p className="text-sm font-medium">
              {safeT("owner_platform_popup_crop_confirm")}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cropPreviewUrl}
              alt="36:25 crop preview"
              className="max-w-full rounded-ui-rect border border-sam-border"
            />
            <button
              type="button"
              className={`${OwnerCta.primary} w-full`}
              disabled={busy}
              onClick={() => void applyCropAndUpload()}
            >
              {safeT("owner_platform_popup_apply_crop_save")}
            </button>
          </div>
        ) : null}
        {previewUrl && !pendingCropFile ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="mt-3 max-w-full rounded-ui-rect border border-sam-border"
          />
        ) : null}
      </OwnerStoreAdminDashSection>

      <BodyPortal>
        <div className={footerFixedClassName} style={footerPadStyle}>
          <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
            <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
              <Link
                href={DELIVERY_AD_OWNER_ROUTES.hub}
                className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
              >
                {safeT("owner_platform_popup_cancel")}
              </Link>
              <button
                type="button"
                className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
                disabled={busy}
                onClick={() => void saveDraft()}
              >
                {safeT("owner_platform_popup_save_draft")}
              </button>
              <button
                type="button"
                className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                disabled={busy || !storeId || !packageId || !previewUrl}
                onClick={() => {
                  if (insufficient) {
                    setError("INSUFFICIENT_BUSINESS_CASH");
                    return;
                  }
                  setConfirmOpen(true);
                }}
              >
                {safeT("owner_platform_popup_submit")}
              </button>
            </div>
          </div>
        </div>
      </BodyPortal>

      {/* OA-13 — 사장님 공용 확인창(셸 규칙 §6) · 배경·뒤로·Esc = 「돌아가기」 (Owner 재설계안 승인 2026-11-03) */}
      <OwnerStoreAdminConfirmModal
        open={confirmOpen}
        titleId="owner-popup-submit-confirm-title"
        title={translateBy(lang, "business_confirm_submission")}
        description={safeT("owner_platform_popup_submit_note")}
        cancelLabel={translateBy(lang, "business_back")}
        confirmLabel={translateBy(lang, "business_pay_submit")}
        busy={busy}
        confirmTone="primary"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => onSubmit()}
      >
        <ul className="space-y-1 sam-text-body-secondary text-sam-muted" data-owner-popup-submit-confirm="1">
          <li>
            {translateBy(lang, "business_store")}: {storeName}
          </li>
          <li>
            {translateBy(lang, "business_placement_2")}: {adminSurfacesSelectionLabel(selectedSurfaces, lang)}
          </li>
          <li>CTA: {platformPopupOwnerCtaKindLabel(ctaKind, lang)}</li>
          <li>
            {translateBy(lang, "business_price")}:{" "}
            {selectedPackage ? formatDeliveryAdPhpMinor(selectedPackage.priceMinor) : "—"}
          </li>
        </ul>
      </OwnerStoreAdminConfirmModal>
        </>
      )}
    </div>
  );
}
