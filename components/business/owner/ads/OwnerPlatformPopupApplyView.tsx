"use client";

/**
 * Owner Platform Popup apply workspace — product UX completion.
 * Surface multi-select + CTA destinations + visible crop + Cash recovery with requestId.
 */

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
        {safeT("owner_platform_popup_loading", {
          fallbackKo: "불러오는 중…",
          fallbackEn: "Loading…",
        })}
      </p>
    );
  }

  return (
    <div
      className={`${OWNER_STORE_STACK_Y_CLASS} pb-24`}
      style={formPadStyle}
      data-owner-platform-popup-apply="1"
    >
      <h1 className="text-lg font-bold text-sam-fg">
        {safeT("owner_platform_popup_apply_title", {
          fallbackKo: "팝업 광고 신청",
          fallbackEn: "Apply for Popup Ad",
        })}
      </h1>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_what_title", {
          fallbackKo: "팝업 광고란?",
          fallbackEn: "What is Popup Ad?",
        })}
      >
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-sam-muted">
          <li>
            {safeT("owner_platform_popup_what_1", {
              fallbackKo: "앱 화면 하단에 36:25 소재가 뜨는 전역 팝업 광고입니다.",
              fallbackEn: "A bottom-anchored 36:25 popup shown on eligible app screens.",
            })}
          </li>
          <li>
            {safeT("owner_platform_popup_what_2", {
              fallbackKo: "세로 화면에서만 노출되며, 가로 모드에서는 표시되지 않습니다.",
              fallbackEn: "Shown in portrait only — landscape suppresses the popup.",
            })}
          </li>
          <li>
            {safeT("owner_platform_popup_what_3", {
              fallbackKo: "Business Cash로 결제되며, 결제만으로 바로 노출되지 않습니다. 관리자 심사가 필요합니다.",
              fallbackEn: "Paid with Business Cash. Payment alone never goes live — admin review is required.",
            })}
          </li>
        </ul>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_preview", {
          fallbackKo: "실제 노출 미리보기",
          fallbackEn: "Placement preview",
        })}
      >
        <p className="mb-2 text-[13px] text-sam-muted">
          {safeT("owner_platform_popup_preview_hint", {
            fallbackKo: "휴대폰 기준으로 앱 하단에 표시되는 형태입니다.",
            fallbackEn: "Phone presentation — bottom of the app screen.",
          })}
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
              onRenderComplete={() => {}}
              onImageError={() => {}}
            />
          ) : (
            <div
              className="flex aspect-[36/25] items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-sm text-sam-muted"
              data-owner-popup-preview-placeholder="1"
            >
              {safeT("owner_platform_popup_preview_placeholder", {
                fallbackKo: "소재를 올리면 여기에 미리보기가 표시됩니다",
                fallbackEn: "Upload a creative to preview here",
              })}
            </div>
          )}
        </div>
      </OwnerStoreAdminDashSection>

      {error ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error === "INSUFFICIENT_BUSINESS_CASH" ? (
            <>
              <p>
                {safeT("owner_platform_popup_insufficient", {
                  fallbackKo: "Business Cash가 부족합니다.",
                  fallbackEn: "Not enough Business Cash.",
                })}
              </p>
              <Link href={financeHref} className="mt-2 inline-flex font-semibold underline">
                {safeT("owner_platform_popup_go_finance", {
                  fallbackKo: "충전하기",
                  fallbackEn: "Top up",
                })}
              </Link>
            </>
          ) : (
            error
          )}
        </div>
      ) : null}

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_store", {
          fallbackKo: "광고할 매장",
          fallbackEn: "Store",
        })}
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
        title={safeT("owner_platform_popup_section_surfaces", {
          fallbackKo: "노출 영역",
          fallbackEn: "Placement",
        })}
      >
        <fieldset className="space-y-2" data-owner-popup-surface-select="1">
          {PLATFORM_POPUP_ADMIN_SURFACE_MODE_OPTIONS.map((opt) => {
            const selected = isAdminSurfaceSelected(selectedSurfaces, opt.mode);
            const isGlobal = opt.mode === "GLOBAL";
            return (
              <label
                key={opt.mode}
                className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-sm transition-colors ${
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
          {lang === "en" ? "Selected" : "현재 선택"}:{" "}
          {adminSurfacesSelectionLabel(selectedSurfaces, lang)}
        </p>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_cta", {
          fallbackKo: "클릭 시 이동",
          fallbackEn: "Click destination",
        })}
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
        title={safeT("owner_platform_popup_section_schedule", {
          fallbackKo: "노출 기간",
          fallbackEn: "Schedule",
        })}
      >
        <p className="mb-2 text-[12px] text-sam-muted">
          {lang === "en"
            ? "Dates use Philippines time (Asia/Manila)."
            : "날짜는 필리핀 시간(Asia/Manila) 기준입니다."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
            <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>
              {lang === "en" ? "Start" : "시작"}
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
              {lang === "en" ? "End" : "종료"}
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
        title={safeT("owner_platform_popup_section_package", {
          fallbackKo: "요금 · Business Cash",
          fallbackEn: "Price · Business Cash",
        })}
      >
        {packages.length === 0 ? (
          <p className="text-sm text-sam-muted">
            {safeT("owner_platform_popup_no_package", {
              fallbackKo: "판매 중인 패키지가 없습니다.",
              fallbackEn: "No packages available.",
            })}
          </p>
        ) : (
          <div className="space-y-2">
            {packages.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`flex w-full items-center justify-between rounded-ui-rect border px-3 py-3 text-left ${
                  packageId === p.id ? "border-[#0A823E] bg-[#E6F4ED]" : "border-sam-border bg-white"
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
            <dt className="text-sam-muted">{lang === "en" ? "Ad price" : "광고 금액"}</dt>
            <dd className="tabular-nums font-semibold">
              {selectedPackage ? formatDeliveryAdPhpMinor(selectedPackage.priceMinor) : "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sam-muted">{lang === "en" ? "Current Cash" : "현재 Business Cash"}</dt>
            <dd className="tabular-nums font-semibold">{formatDeliveryAdPhpMinor(cashBalanceMinor)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-sam-muted">{lang === "en" ? "After payment" : "결제 후 예상 잔액"}</dt>
            <dd className={`tabular-nums font-semibold ${insufficient ? "text-red-600" : ""}`}>
              {afterBalance == null ? "—" : formatDeliveryAdPhpMinor(Math.max(0, afterBalance))}
            </dd>
          </div>
        </dl>
        {insufficient ? (
          <Link href={financeHref} className="mt-2 inline-flex text-sm font-semibold text-sam-brand underline">
            {safeT("owner_platform_popup_go_finance", {
              fallbackKo: "충전하기",
              fallbackEn: "Top up",
            })}
          </Link>
        ) : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_creative", {
          fallbackKo: "크리에이티브",
          fallbackEn: "Creative",
        })}
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
              {safeT("owner_platform_popup_crop_confirm", {
                fallbackKo: "중앙 크롭 결과 (저장될 최종 이미지)",
                fallbackEn: "Center-crop result (final asset to save)",
              })}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cropPreviewUrl}
              alt="36:25 crop preview"
              className="max-w-full rounded-ui-rect border border-sam-border"
            />
            <button
              type="button"
              className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
              disabled={busy}
              onClick={() => void applyCropAndUpload()}
            >
              {safeT("owner_platform_popup_apply_crop_save", {
                fallbackKo: "이 크롭 적용·저장",
                fallbackEn: "Apply & save this crop",
              })}
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
                {safeT("owner_platform_popup_cancel", {
                  fallbackKo: "취소",
                  fallbackEn: "Cancel",
                })}
              </Link>
              <button
                type="button"
                className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
                disabled={busy}
                onClick={() => void saveDraft()}
              >
                {safeT("owner_platform_popup_save_draft", {
                  fallbackKo: "임시 저장",
                  fallbackEn: "Save draft",
                })}
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
                {safeT("owner_platform_popup_submit", {
                  fallbackKo: "신청 · Cash 결제",
                  fallbackEn: "Submit · Pay Cash",
                })}
              </button>
            </div>
          </div>
        </div>
      </BodyPortal>

      {confirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="w-full max-w-md rounded-ui-rect bg-white p-4 shadow-lg"
            role="dialog"
            aria-modal="true"
            data-owner-popup-submit-confirm="1"
          >
            <h2 className="text-base font-bold">
              {lang === "en" ? "Confirm submission" : "신청 최종 확인"}
            </h2>
            <ul className="mt-3 space-y-1 text-sm text-sam-muted">
              <li>
                {lang === "en" ? "Store" : "매장"}: {storeName}
              </li>
              <li>
                {lang === "en" ? "Placement" : "노출"}:{" "}
                {adminSurfacesSelectionLabel(selectedSurfaces, lang)}
              </li>
              <li>
                CTA: {platformPopupOwnerCtaKindLabel(ctaKind, lang)}
              </li>
              <li>
                {lang === "en" ? "Price" : "금액"}:{" "}
                {selectedPackage ? formatDeliveryAdPhpMinor(selectedPackage.priceMinor) : "—"}
              </li>
            </ul>
            <p className="mt-3 text-[13px] text-sam-fg">
              {safeT("owner_platform_popup_submit_note", {
                fallbackKo:
                  "결제 후 관리자 심사를 거쳐 광고가 노출됩니다. 결제만으로 광고가 즉시 노출되지 않습니다.",
                fallbackEn:
                  "After payment, an admin reviews the ad before it goes live. Payment alone never activates the ad.",
              })}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
                onClick={() => setConfirmOpen(false)}
              >
                {lang === "en" ? "Back" : "돌아가기"}
              </button>
              <button
                type="button"
                className={OWNER_STORE_ADMIN_FOOTER_PRIMARY_BTN_CLASS}
                disabled={busy}
                onClick={() => void onSubmit()}
              >
                {lang === "en" ? "Pay & submit" : "결제하고 신청"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
