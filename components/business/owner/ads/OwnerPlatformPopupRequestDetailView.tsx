"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OwnerStoreAdminDashSection } from "@/components/business/owner/OwnerStoreAdminDashSection";
import { OWNER_STORE_STACK_Y_CLASS } from "@/lib/business/owner-store-stack";
import { DibayPopupAd } from "@/components/platform-popup/DibayPopupAd";
import { resolvePlatformPopupPresentationSuppressionOptions } from "@/lib/platform-popup/popup-suppression-ui";
import type { PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";
import { PLATFORM_POPUP_OWNER_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { isOwnerEditablePlatformPopupRequest } from "@/lib/platform-popup/owner-request-lifecycle";
import type { PlatformPopupOwnerRequestStatus } from "@/lib/platform-popup/owner-request-types";

function ownerRequestStatusLabel(
  safeT: ReturnType<typeof useI18n>["safeT"],
  status: PlatformPopupOwnerRequestStatus
): string {
  switch (status) {
    case "draft":
      return safeT("owner_platform_popup_status_draft", {
        fallbackKo: "작성 중",
        fallbackEn: "Draft",
      });
    case "submitted":
      return safeT("owner_platform_popup_status_submitted", {
        fallbackKo: "제출됨",
        fallbackEn: "Submitted",
      });
    case "under_review":
      return safeT("owner_platform_popup_status_under_review", {
        fallbackKo: "검수 중",
        fallbackEn: "Under review",
      });
    case "revision_required":
      return safeT("owner_platform_popup_status_revision_required", {
        fallbackKo: "수정 요청",
        fallbackEn: "Revision required",
      });
    case "approved":
      return safeT("owner_platform_popup_status_approved", {
        fallbackKo: "승인됨",
        fallbackEn: "Approved",
      });
    case "rejected":
      return safeT("owner_platform_popup_status_rejected", {
        fallbackKo: "거절됨",
        fallbackEn: "Rejected",
      });
    case "cancelled":
      return safeT("owner_platform_popup_status_cancelled", {
        fallbackKo: "취소됨",
        fallbackEn: "Cancelled",
      });
    default:
      return status;
  }
}

export function OwnerPlatformPopupRequestDetailView() {
  const { safeT } = useI18n();
  const router = useRouter();
  const params = useParams();
  const requestId = String(params?.requestId ?? "").trim();
  const [item, setItem] = useState<PlatformPopupOwnerRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/me/platform-popup-requests/${encodeURIComponent(requestId)}`, {
      credentials: "include",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      item?: PlatformPopupOwnerRequestRow;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.item) {
      setError(json.error || "load_failed");
      setItem(null);
    } else {
      setItem(json.item);
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCancel = async () => {
    if (!item) return;
    setBusy(true);
    const res = await fetch(`/api/me/platform-popup-requests/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    setBusy(false);
    if (res.ok) {
      router.push(DELIVERY_AD_OWNER_ROUTES.hub);
      return;
    }
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setError(json.error || "cancel_failed");
  };

  if (loading) {
    return (
      <p className="p-4 text-sm text-sam-muted">
        {safeT("owner_platform_popup_loading", {
          fallbackKo: "불러오는 중…",
          fallbackEn: "Loading…",
        })}
      </p>
    );
  }

  if (!item) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-red-600">{error || "not_found"}</p>
        <Link href={DELIVERY_AD_OWNER_ROUTES.hub} className="text-sm underline">
          Hub
        </Link>
      </div>
    );
  }

  const editable = isOwnerEditablePlatformPopupRequest(item.requestStatus);

  return (
    <div className={`${OWNER_STORE_STACK_Y_CLASS}`} data-owner-platform-popup-detail="1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-sam-fg">
            {safeT("owner_platform_popup_detail_title", {
              fallbackKo: "팝업 광고 신청 상세",
              fallbackEn: "Popup Ad Request",
            })}
          </h1>
          <p className="mt-1 text-sm text-sam-muted uppercase">
            {ownerRequestStatusLabel(safeT, item.requestStatus)} · {item.paymentStatus}
          </p>
        </div>
        <Link href={DELIVERY_AD_OWNER_ROUTES.hub} className="text-sm underline">
          Hub
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {item.revisionReason ? (
        <OwnerStoreAdminDashSection
          title={safeT("owner_platform_popup_revision_reason", {
            fallbackKo: "수정 요청 사유",
            fallbackEn: "Revision reason",
          })}
        >
          <p className="text-sm text-sam-fg">{item.revisionReason}</p>
        </OwnerStoreAdminDashSection>
      ) : null}

      {item.rejectionReason ? (
        <OwnerStoreAdminDashSection
          title={safeT("owner_platform_popup_rejection_reason", {
            fallbackKo: "거절 사유",
            fallbackEn: "Rejection reason",
          })}
        >
          <p className="text-sm text-sam-fg">{item.rejectionReason}</p>
        </OwnerStoreAdminDashSection>
      ) : null}

      <OwnerStoreAdminDashSection title="Summary">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-sam-muted">Store</dt>
            <dd className="font-medium">{item.storeId}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-sam-muted">Surfaces</dt>
            <dd>{item.requestedSurfaces.join(", ") || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-sam-muted">Price</dt>
            <dd>
              {item.priceMinor != null ? formatDeliveryAdPhpMinor(item.priceMinor) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-sam-muted">CTA</dt>
            <dd>
              {item.ctaType} · {item.ctaTarget}
            </dd>
          </div>
          {item.adminCampaignId ? (
            <div className="flex justify-between gap-2">
              <dt className="text-sam-muted">Campaign</dt>
              <dd className="font-mono text-xs">{item.adminCampaignId}</dd>
            </div>
          ) : null}
        </dl>
      </OwnerStoreAdminDashSection>

      {item.creativeAssetUrl ? (
        <OwnerStoreAdminDashSection
          title={safeT("owner_platform_popup_section_preview", {
            fallbackKo: "미리보기",
            fallbackEn: "Preview",
          })}
        >
          <div className="mx-auto w-full max-w-[360px] rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <DibayPopupAd
              campaignId={item.id}
              surface="TRADE"
              creative={{
                id: "detail-preview",
                imageUrl: item.creativeAssetUrl,
                altText: item.creativeAltText || "Advertisement",
                aspectW: 36,
                aspectH: 25,
              }}
              cta={{
                type: item.ctaType,
                href: item.externalUrl || `/stores/${item.storeId}`,
                label: null,
              }}
              suppressionOptions={resolvePlatformPopupPresentationSuppressionOptions({
                suppressionMode: item.suppressionMode,
                suppressionDurationSeconds: item.suppressionDurationSeconds,
              })}
              exposureId="owner-detail-preview"
              embedded
              onClose={() => {}}
              onSuppress={() => {}}
              onCta={() => {}}
              onRenderComplete={() => {}}
              onImageError={() => {}}
            />
          </div>
        </OwnerStoreAdminDashSection>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editable ? (
          <Link
            href={`${PLATFORM_POPUP_OWNER_ROUTES.createPlatformPopup}?requestId=${encodeURIComponent(item.id)}&storeId=${encodeURIComponent(item.storeId)}`}
            className="rounded-ui-rect bg-[#0A823E] px-4 py-2 text-sm font-semibold text-white"
          >
            {safeT("owner_platform_popup_resubmit", {
              fallbackKo: "수정 후 재신청",
              fallbackEn: "Resubmit after edits",
            })}
          </Link>
        ) : null}
        {item.requestStatus === "draft" ||
        item.requestStatus === "submitted" ||
        item.requestStatus === "under_review" ||
        item.requestStatus === "revision_required" ? (
          <button
            type="button"
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-sm"
            disabled={busy}
            onClick={() => void onCancel()}
          >
            {safeT("owner_platform_popup_cancel", {
              fallbackKo: "신청 취소",
              fallbackEn: "Cancel request",
            })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
