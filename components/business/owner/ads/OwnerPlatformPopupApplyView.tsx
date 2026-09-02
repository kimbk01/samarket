"use client";

/**
 * CUT 5 — Owner Platform Popup apply workspace.
 * Uses DibayPopupAd embedded preview. payment alone never activates.
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
  ownerStoreAdminFooterFixedClass,
} from "@/lib/business/owner-admin-footer-actions";
import { useOwnerAdminFormKeyboard } from "@/lib/business/use-owner-admin-form-keyboard";
import { BodyPortal } from "@/components/layout/BodyPortal";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import { PLATFORM_POPUP_TARGET_SURFACES } from "@/lib/platform-popup/types";
import type { PlatformPopupAdPackageRow, PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";
import { PLATFORM_POPUP_OWNER_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

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
  const { safeT } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preloadStoreId = searchParams.get("storeId")?.trim() ?? "";
  const preloadRequestId = searchParams.get("requestId")?.trim() ?? "";
  const {
    formPadStyle,
    footerPadStyle,
    footerFixedClassName,
  } = useOwnerAdminFormKeyboard({ aboveBottomNav: true });

  const [stores, setStores] = useState<EligibleStore[]>([]);
  const [packages, setPackages] = useState<PlatformPopupAdPackageRow[]>([]);
  const [cashBalanceMinor, setCashBalanceMinor] = useState(0);
  const [storeId, setStoreId] = useState(preloadStoreId);
  const [request, setRequest] = useState<PlatformPopupOwnerRequestRow | null>(null);
  const [surfaces, setSurfaces] = useState<string[]>(["GLOBAL"]);
  const [packageId, setPackageId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [ctaTarget, setCtaTarget] = useState("");
  const [applyCrop, setApplyCrop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
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
            setSurfaces(item.requestedSurfaces.length ? item.requestedSurfaces : ["GLOBAL"]);
            setPackageId(item.packageId ?? "");
            setStartAt(toLocalInput(item.requestedStartAt));
            setEndAt(toLocalInput(item.requestedEndAt));
            setCtaTarget(item.ctaTarget || item.storeId);
            return;
          }
        }

        if (preloadStoreId && list.some((s) => s.id === preloadStoreId)) {
          setStoreId(preloadStoreId);
          setCtaTarget(preloadStoreId);
        } else if (list.length === 1) {
          setStoreId(list[0]!.id);
          setCtaTarget(list[0]!.id);
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

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) ?? null,
    [packages, packageId]
  );

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
    setCtaTarget(json.item.ctaTarget || storeId);
    return json.item;
  }, [request, storeId]);

  const saveDraft = useCallback(async (): Promise<PlatformPopupOwnerRequestRow | null> => {
    setBusy(true);
    setError(null);
    try {
      const draft = await ensureDraft();
      if (!draft) return null;
      const res = await fetch(`/api/me/platform-popup-requests/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: packageId || null,
          surfaces,
          startAt: fromLocalInput(startAt),
          endAt: fromLocalInput(endAt),
          ctaType: "store",
          ctaTarget: ctaTarget || storeId,
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
  }, [ensureDraft, packageId, surfaces, startAt, endAt, ctaTarget, storeId]);

  const onUpload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
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
      if (
        selectedPackage &&
        cashBalanceMinor < selectedPackage.priceMinor
      ) {
        setError("INSUFFICIENT_BUSINESS_CASH");
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
        insufficient?: { shortageMinor?: number };
      };
      if (!res.ok || !json.ok || !json.item) {
        setError(json.error || "submit_failed");
        return;
      }
      router.push(PLATFORM_POPUP_OWNER_ROUTES.popupRequestDetail(json.item.id));
    } finally {
      setBusy(false);
    }
  };

  const previewUrl = request?.creativeAssetUrl ?? null;
  const financeBase = OwnerRoutes.finance(storeId);
  const financeHref = `${financeBase}${financeBase.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(
    PLATFORM_POPUP_OWNER_ROUTES.createPlatformPopup +
      (storeId ? `?storeId=${encodeURIComponent(storeId)}` : "")
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
    <div className={`${OWNER_STORE_STACK_Y_CLASS} pb-24`} style={formPadStyle} data-owner-platform-popup-apply="1">
      <h1 className="text-lg font-bold text-sam-fg">
        {safeT("owner_platform_popup_apply_title", {
          fallbackKo: "팝업 광고 신청",
          fallbackEn: "Apply for Popup Ad",
        })}
      </h1>
      <p className="text-[13px] text-sam-muted">
        {safeT("owner_platform_popup_payment_note", {
          fallbackKo: "Cash 결제는 검수 신청 시 이루어집니다. 결제만으로 광고가 바로 노출되지 않습니다.",
          fallbackEn: "Cash is charged when you submit for review. Payment alone never activates the ad.",
        })}
      </p>

      {error ? (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error === "INSUFFICIENT_BUSINESS_CASH" ? (
            <>
              <p>
                {safeT("owner_platform_popup_insufficient", {
                  fallbackKo: "Cash가 부족합니다. 충전 후 다시 신청해 주세요.",
                  fallbackEn: "Not enough Cash. Top up and try again.",
                })}
              </p>
              <Link href={financeHref} className="mt-2 inline-flex font-semibold underline">
                {safeT("owner_platform_popup_go_finance", {
                  fallbackKo: "Cash 충전하기",
                  fallbackEn: "Top up Cash",
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
              onChange={(e) => {
                setStoreId(e.target.value);
                setCtaTarget(e.target.value);
              }}
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
          fallbackEn: "Surfaces",
        })}
      >
        <div className="flex flex-wrap gap-2">
          {PLATFORM_POPUP_TARGET_SURFACES.map((s) => {
            const on = surfaces.includes(s);
            return (
              <button
                key={s}
                type="button"
                className={`rounded-ui-rect border px-3 py-2 text-sm ${
                  on ? "border-[#0A823E] bg-[#E6F4ED]" : "border-sam-border bg-white"
                }`}
                onClick={() => {
                  setSurfaces((prev) =>
                    on ? prev.filter((x) => x !== s) : [...prev, s]
                  );
                }}
              >
                {s}
              </button>
            );
          })}
        </div>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_schedule", {
          fallbackKo: "노출 기간",
          fallbackEn: "Schedule",
        })}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
            <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>Start</span>
            <input
              type="datetime-local"
              className={OWNER_STORE_PROFILE_CONTROL_CLASS}
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </label>
          <label className={OWNER_STORE_PROFILE_FIELD_BLOCK_CLASS}>
            <span className={OWNER_STORE_PROFILE_FIELD_LABEL_CLASS}>End</span>
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
        title={safeT("owner_platform_popup_section_cta", {
          fallbackKo: "클릭 시 이동",
          fallbackEn: "Click destination",
        })}
      >
        <p className="text-[13px] text-sam-muted">store → {ctaTarget || storeId || "—"}</p>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_package", {
          fallbackKo: "요금 패키지",
          fallbackEn: "Package",
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
        <p className="mt-3 text-[13px] text-sam-muted">
          {safeT("owner_platform_popup_cash_balance", {
            fallbackKo: "Cash 잔액",
            fallbackEn: "Cash balance",
          })}
          {": "}
          <span className="font-semibold text-sam-fg">
            {formatDeliveryAdPhpMinor(cashBalanceMinor)}
          </span>
        </p>
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_creative", {
          fallbackKo: "크리에이티브 (36:25)",
          fallbackEn: "Creative (36:25)",
        })}
      >
        <p className="mb-2 text-[13px] text-sam-muted">
          {safeT("owner_platform_popup_crop_hint", {
            fallbackKo: "이미지가 36:25가 아니면 중앙 크롭을 적용합니다.",
            fallbackEn: "Non-36:25 images require an explicit center crop.",
          })}
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={applyCrop}
            onChange={(e) => setApplyCrop(e.target.checked)}
          />
          {safeT("owner_platform_popup_apply_crop", {
            fallbackKo: "36:25 중앙 크롭 적용",
            fallbackEn: "Apply 36:25 center crop",
          })}
        </label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy || !storeId}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = "";
          }}
        />
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="mt-3 max-w-full rounded-ui-rect border border-sam-border" />
        ) : null}
      </OwnerStoreAdminDashSection>

      <OwnerStoreAdminDashSection
        title={safeT("owner_platform_popup_section_preview", {
          fallbackKo: "미리보기",
          fallbackEn: "Preview",
        })}
      >
        {previewUrl ? (
          <div className="mx-auto w-full max-w-[360px] rounded-ui-rect border border-sam-border bg-sam-app p-3">
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
              cta={{ type: "store", href: `/stores/${storeId || "preview"}`, label: null }}
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
          </div>
        ) : (
          <p className="text-sm text-sam-muted">—</p>
        )}
      </OwnerStoreAdminDashSection>

      <BodyPortal>
        <footer className={footerFixedClassName || ownerStoreAdminFooterFixedClass({ aboveBottomNav: true })} style={footerPadStyle}>
          <div className={OWNER_STORE_ADMIN_FOOTER_INNER_CLASS}>
            <div className={OWNER_STORE_ADMIN_FOOTER_ACTIONS_ROW_CLASS}>
              <Link
                href={DELIVERY_AD_OWNER_ROUTES.hub}
                className={`${OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS} flex items-center justify-center`}
              >
                {safeT("common_cancel", { fallbackKo: "취소", fallbackEn: "Cancel" })}
              </Link>
              <button
                type="button"
                className={OWNER_STORE_ADMIN_FOOTER_CANCEL_BTN_CLASS}
                disabled={busy || !storeId}
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
                disabled={busy || !storeId || !packageId}
                onClick={() => void onSubmit()}
              >
                {safeT("owner_platform_popup_submit", {
                  fallbackKo: "신청 · Cash 결제",
                  fallbackEn: "Submit · Pay with Cash",
                })}
              </button>
            </div>
          </div>
        </footer>
      </BodyPortal>
    </div>
  );
}
