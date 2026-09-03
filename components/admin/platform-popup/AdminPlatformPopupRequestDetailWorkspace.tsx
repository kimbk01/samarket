"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPlatformPopupPreview } from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformPopupOwnerRequestAdminPresentation } from "@/lib/platform-popup/enrich-admin-request-presentation";
import type { PlatformPopupOwnerRequestAdminAction } from "@/lib/platform-popup/owner-request-types";
import { PLATFORM_POPUP_ADMIN_REQUEST_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { describePlatformPopupCtaDestination } from "@/lib/platform-popup/popup-cta-destination-ux";
import {
  platformPopupOwnerPaymentStatusLabel,
  platformPopupOwnerRequestStatusLabel,
} from "@/lib/platform-popup/popup-product-labels";
import {
  adminSurfaceModeLabel,
  adminTargetModeFromSurfaces,
} from "@/lib/platform-popup/admin-surface-target-mode";

export function AdminPlatformPopupRequestDetailWorkspace() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const params = useParams();
  const requestId = String(params?.requestId ?? "").trim();
  const [item, setItem] = useState<PlatformPopupOwnerRequestAdminPresentation | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    const res = await fetch(`/api/admin/platform-popup-requests/${encodeURIComponent(requestId)}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      item?: PlatformPopupOwnerRequestAdminPresentation;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.item) {
      setError(json.error || "load_failed");
      setItem(null);
    } else {
      setItem(json.item);
      setError(null);
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const cta = useMemo(() => {
    if (!item) return null;
    return describePlatformPopupCtaDestination({
      ctaType: item.ctaType,
      ctaTarget: item.ctaTarget,
      storeId: item.storeId,
      storeName: item.storeName,
      lang,
    });
  }, [item, lang]);

  const surfaceMode = item ? adminTargetModeFromSurfaces(item.requestedSurfaces) : "GLOBAL";

  const act = async (
    action: PlatformPopupOwnerRequestAdminAction,
    opts?: { activate?: boolean; schedule?: boolean }
  ) => {
    if (!item) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/platform-popup-requests/${encodeURIComponent(item.id)}/actions`,
      {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason || undefined,
          activate: opts?.activate,
          schedule: opts?.schedule,
        }),
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      item?: PlatformPopupOwnerRequestAdminPresentation;
      campaignId?: string;
      error?: string;
    };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(json.error || "action_failed");
      return;
    }
    if (json.item) setItem(json.item);
    if (action === "approve" && json.campaignId) {
      router.push(`/admin/platform-popup/${json.campaignId}`);
    } else {
      await load();
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-sam-muted">
        {safeT("admin_platform_popup_loading", {
          fallbackKo: "불러오는 중…",
          fallbackEn: "Loading…",
        })}
      </p>
    );
  }

  if (!item) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-600">{error || "not_found"}</p>
        <Link href={PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.queue} className="text-sm underline">
          Back
        </Link>
      </div>
    );
  }

  const status = item.requestStatus;
  const showPendingActions =
    status === "submitted" || status === "under_review" || status === "revision_required";

  return (
    <div className="space-y-4" data-admin-platform-popup-request-detail="1">
      <AdminPageHeader
        title={safeT("admin_platform_popup_request_detail_title", {
          fallbackKo: "팝업 광고 신청 검토",
          fallbackEn: "Popup ad request review",
        })}
        description={`${platformPopupOwnerRequestStatusLabel(status, lang)} · ${
          item.storeName || "—"
        }`}
      />

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <AdminCard>
        <AdminPlatformPopupPreview
          source={
            item.creativeAssetUrl
              ? {
                  campaignId: item.id,
                  creativeId: "owner-request",
                  imageUrl: item.creativeAssetUrl,
                  altText: item.creativeAltText || "Advertisement",
                  ctaHref: cta?.href || `/stores/${item.storeId}`,
                  ctaType: item.ctaType,
                  surface: surfaceMode === "GLOBAL" ? "TRADE" : surfaceMode,
                  suppressionMode: item.suppressionMode,
                  suppressionDurationSeconds: item.suppressionDurationSeconds,
                  timezone: item.timezone,
                }
              : null
          }
        />
      </AdminCard>

      <AdminCard>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">{lang === "en" ? "Store" : "신청 매장"}</dt>
            <dd className="font-semibold">{item.storeName || "—"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">Owner</dt>
            <dd className="font-semibold">
              {item.ownerLabel || "—"}
              {item.ownerUsername ? (
                <span className="ml-1 text-sam-muted">@{item.ownerUsername}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{lang === "en" ? "Product" : "상품"}</dt>
            <dd>
              {safeT("admin_platform_popup_product_name", {
                fallbackKo: "팝업 광고",
                fallbackEn: "Popup Advertisement",
              })}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{lang === "en" ? "Placement" : "노출 영역"}</dt>
            <dd>{adminSurfaceModeLabel(surfaceMode, lang)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{lang === "en" ? "Schedule" : "노출 기간"}</dt>
            <dd className="text-xs">
              {(item.requestedStartAt || "—").replace("T", " ").slice(0, 16)} →{" "}
              {(item.requestedEndAt || "—").replace("T", " ").slice(0, 16)}
              <span className="mt-1 block text-sam-muted">
                {lang === "en" ? "Timezone: Philippines (Asia/Manila)" : "기준 시역: 필리핀 (Asia/Manila)"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">CTA</dt>
            <dd>
              <div className="font-medium">{cta?.readable}</div>
              <div className="text-xs text-sam-muted">{cta?.href}</div>
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{lang === "en" ? "Price" : "가격"}</dt>
            <dd className="tabular-nums">
              {item.priceMinor != null ? formatDeliveryAdPhpMinor(item.priceMinor) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">Business Cash</dt>
            <dd>{platformPopupOwnerPaymentStatusLabel(item.paymentStatus, lang)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{lang === "en" ? "Submitted" : "신청 일시"}</dt>
            <dd className="text-xs">{item.submittedAt || item.createdAt}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{lang === "en" ? "Status" : "현재 상태"}</dt>
            <dd className="font-semibold">
              {platformPopupOwnerRequestStatusLabel(status, lang)}
            </dd>
          </div>
          {item.revisionReason ? (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">{lang === "en" ? "Revision note" : "수정 요청 사유"}</dt>
              <dd>{item.revisionReason}</dd>
            </div>
          ) : null}
          {item.rejectionReason ? (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">{lang === "en" ? "Rejection note" : "반려 사유"}</dt>
              <dd>{item.rejectionReason}</dd>
            </div>
          ) : null}
          {item.adminCampaignId ? (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">{lang === "en" ? "Linked campaign" : "연결 캠페인"}</dt>
              <dd>
                <Link
                  href={`/admin/platform-popup/${item.adminCampaignId}`}
                  className="text-sam-primary underline"
                >
                  {lang === "en" ? "Open campaign" : "캠페인 열기"}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
        <details className="mt-3 text-xs text-sam-muted">
          <summary>{lang === "en" ? "Technical ids" : "기술 ID (참고)"}</summary>
          <p className="mt-1 break-all">request: {item.id}</p>
          <p className="break-all">store: {item.storeId}</p>
          <p className="break-all">owner: {item.ownerUserId}</p>
        </details>
      </AdminCard>

      {showPendingActions ? (
        <AdminCard>
          <label className="mb-3 block text-sm">
            {safeT("admin_platform_popup_request_reason", {
              fallbackKo: "사유",
              fallbackEn: "Reason",
            })}
            <textarea
              className="mt-1 w-full rounded border border-sam-border bg-sam-surface p-2"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2" data-admin-popup-request-actions="1">
            {status === "submitted" ? (
              <button
                type="button"
                className="rounded border border-sam-border px-3 py-1.5 text-sm"
                disabled={busy}
                onClick={() => void act("start_review")}
              >
                {safeT("admin_platform_popup_request_start_review", {
                  fallbackKo: "검토 시작",
                  fallbackEn: "Start review",
                })}
              </button>
            ) : null}
            <button
              type="button"
              className="rounded border border-amber-500 px-3 py-1.5 text-sm text-amber-800"
              disabled={busy}
              onClick={() => void act("revision_required")}
            >
              {safeT("admin_platform_popup_request_revision", {
                fallbackKo: "수정 요청",
                fallbackEn: "Request revision",
              })}
            </button>
            <button
              type="button"
              className="rounded bg-sam-primary px-3 py-1.5 text-sm font-semibold text-sam-on-primary"
              disabled={busy}
              onClick={() => void act("approve")}
            >
              {safeT("admin_platform_popup_request_approve", {
                fallbackKo: "승인",
                fallbackEn: "Approve",
              })}
            </button>
            <button
              type="button"
              className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white"
              disabled={busy}
              onClick={() => void act("approve", { activate: true })}
            >
              {safeT("admin_platform_popup_request_activate", {
                fallbackKo: "승인 후 즉시 노출",
                fallbackEn: "Approve & go live",
              })}
            </button>
            <button
              type="button"
              className="rounded bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
              disabled={busy}
              onClick={() => void act("approve", { schedule: true })}
            >
              {safeT("admin_platform_popup_request_schedule", {
                fallbackKo: "승인 후 예약",
                fallbackEn: "Approve & schedule",
              })}
            </button>
            <button
              type="button"
              className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-700"
              disabled={busy}
              onClick={() => void act("reject")}
            >
              {safeT("admin_platform_popup_request_reject", {
                fallbackKo: "반려",
                fallbackEn: "Reject",
              })}
            </button>
          </div>
        </AdminCard>
      ) : null}

      <Link href="/admin/platform-popup?tab=requests" className="text-sm text-sam-primary underline">
        {lang === "en" ? "Back to request queue" : "신청 관리로"}
      </Link>
    </div>
  );
}
