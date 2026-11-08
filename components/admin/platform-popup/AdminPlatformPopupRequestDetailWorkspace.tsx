"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPlatformPopupPreview } from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
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
  adminSurfacesFromDb,
  adminSurfacesSelectionLabel,
  previewSurfaceFromAdminSelection,
} from "@/lib/platform-popup/admin-surface-target-mode";
import { emitAdminQueueChanged } from "@/lib/admin/admin-queue-events";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { translateBy } from "@/lib/i18n/translate-by";

export function AdminPlatformPopupRequestDetailWorkspace() {
  const { safeT, language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const params = useParams();
  const requestId = String(params?.requestId ?? "").trim();
  const [item, setItem] = useState<PlatformPopupOwnerRequestAdminPresentation | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** 사장님 팝업 신청 처리 = business 키 (`platform-popup-requests/[id]/actions` · 광고 워크스페이스 팝업 신청 계열과 같은 키) */
  const adminAction = useAdminRouteAction("/admin/platform-popup/requests");
  const writeBlocked = busy || !adminAction.allowed;
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

  const selectedSurfaces = item ? adminSurfacesFromDb(item.requestedSurfaces) : (["GLOBAL"] as const);

  const act = async (
    action: PlatformPopupOwnerRequestAdminAction,
    opts?: { activate?: boolean; schedule?: boolean }
  ) => {
    if (!item) return;
    // R2 — 승인 = approve(L2) · 승인 후 즉시 노출 = exposeStart(L2) · 반려 = reject(L2). 사유는 API 로 보내 감사에 남긴다.
    let confirmedReason: string | null = null;
    if (action === "approve" || action === "reject") {
      const ko = lang !== "en";
      const target = item.storeName?.trim() || item.id;
      const confirmed = await confirmAdminAction({
        level: adminActionLevel(action === "reject" ? "reject" : opts?.activate ? "exposeStart" : "approve"),
        ko,
        title:
          action === "reject"
            ? t("admin_platform_popup_reject_popup_request")
            : opts?.activate
              ? t("admin_platform_popup_approve_go_live")
              : opts?.schedule
                ? t("admin_platform_popup_request_schedule")
                : t("admin_platform_popup_approve_popup_request"),
        description:
          action === "reject"
            ? t("admin_platform_popup_reject_request_from_target_funding", { target: String(target) })
            : t("admin_platform_popup_approve_request_from_target", { target: String(target) }),
        confirmLabel: adminCta(action === "reject" ? "reject" : opts?.activate ? "exposeStart" : "approve", ko),
        destructive: action === "reject",
      });
      if (!confirmed.ok) return;
      confirmedReason = confirmed.reason;
    }
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
          reason: confirmedReason ?? (reason || undefined),
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
    emitAdminQueueChanged("platform_popup_pending");
    if (action === "approve" && json.campaignId) {
      router.push(`/admin/platform-popup/${json.campaignId}`);
    } else {
      await load();
    }
  };

  if (loading) {
    return (
      <p className="text-sm text-sam-muted">
        {safeT("admin_platform_popup_loading")}
      </p>
    );
  }

  if (!item) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-sam-danger">{error || "not_found"}</p>
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
        title={safeT("admin_platform_popup_request_detail_title")}
        description={`${platformPopupOwnerRequestStatusLabel(status, lang)} · ${
          item.storeName || "—"
        }`}
      />

      {error ? (
        <p className="text-sm text-sam-danger" role="alert">
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
                  surface: previewSurfaceFromAdminSelection(selectedSurfaces),
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
            <dt className="text-sam-muted">{translateBy(lang, "admin_store_2")}</dt>
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
            <dt className="text-sam-muted">{translateBy(lang, "admin_chat_rooms_chip_post")}</dt>
            <dd>
              {safeT("admin_platform_popup_product_name")}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{translateBy(lang, "admin_placement_2")}</dt>
            <dd>{adminSurfacesSelectionLabel(selectedSurfaces, lang)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{translateBy(lang, "admin_schedule_2")}</dt>
            <dd className="text-xs">
              {(item.requestedStartAt || "—").replace("T", " ").slice(0, 16)} →{" "}
              {(item.requestedEndAt || "—").replace("T", " ").slice(0, 16)}
              <span className="mt-1 block text-sam-muted">
                {translateBy(lang, "admin_timezone_philippines_asia_manila")}
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
            <dt className="text-sam-muted">{translateBy(lang, "admin_cat_th_price")}</dt>
            <dd className="tabular-nums">
              {item.priceMinor != null ? formatDeliveryAdPhpMinor(item.priceMinor) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">Cash</dt>
            <dd>{platformPopupOwnerPaymentStatusLabel(item.paymentStatus, lang)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{translateBy(lang, "admin_submitted")}</dt>
            <dd className="text-xs">{item.submittedAt || item.createdAt}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{translateBy(lang, "admin_deploy_col_state")}</dt>
            <dd className="font-semibold">
              {platformPopupOwnerRequestStatusLabel(status, lang)}
            </dd>
          </div>
          {item.revisionReason ? (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">{translateBy(lang, "admin_revision_note")}</dt>
              <dd>{item.revisionReason}</dd>
            </div>
          ) : null}
          {item.rejectionReason ? (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">{translateBy(lang, "admin_rejection_note")}</dt>
              <dd>{item.rejectionReason}</dd>
            </div>
          ) : null}
          {item.adminCampaignId ? (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">{translateBy(lang, "admin_linked_campaign")}</dt>
              <dd>
                <Link
                  href={`/admin/platform-popup/${item.adminCampaignId}`}
                  className="text-sam-primary underline"
                >
                  {translateBy(lang, "admin_open_campaign")}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
        <details className="mt-3 text-xs text-sam-muted">
          <summary>{translateBy(lang, "admin_technical_ids")}</summary>
          <p className="mt-1 break-all">request: {item.id}</p>
          <p className="break-all">store: {item.storeId}</p>
          <p className="break-all">owner: {item.ownerUserId}</p>
        </details>
      </AdminCard>

      {showPendingActions ? (
        <AdminCard>
          <label className="mb-3 block text-sm">
            {safeT("admin_platform_popup_request_reason")}
            <textarea
              className="mt-1 w-full rounded border border-sam-border bg-sam-surface p-2"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {!adminAction.allowed && adminAction.reason ? (
            <p className="text-[12px] text-sam-muted" data-admin-action-denied="1">
              {adminAction.reason}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2" data-admin-popup-request-actions="1">
            {status === "submitted" ? (
              <AdminActionButton
                variant="secondary"
                size="sm"
                disabled={writeBlocked}
                onClick={() => void act("start_review")}
              >
                {safeT("admin_platform_popup_request_start_review")}
              </AdminActionButton>
            ) : null}
            <AdminActionButton
              variant="secondary"
              size="sm"
              disabled={writeBlocked}
              onClick={() => void act("revision_required")}
            >
              {safeT("admin_platform_popup_request_revision")}
            </AdminActionButton>
            <AdminActionButton
              variant="primary"
              size="sm"
              disabled={writeBlocked}
              onClick={() => void act("approve")}
            >
              {safeT("admin_platform_popup_request_approve")}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              size="sm"
              disabled={writeBlocked}
              onClick={() => void act("approve", { activate: true })}
            >
              {safeT("admin_platform_popup_request_activate")}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              size="sm"
              disabled={writeBlocked}
              onClick={() => void act("approve", { schedule: true })}
            >
              {safeT("admin_platform_popup_request_schedule")}
            </AdminActionButton>
            <AdminActionButton
              variant="secondary"
              size="sm"
              disabled={writeBlocked}
              onClick={() => void act("reject")}
            >
              {safeT("admin_platform_popup_request_reject")}
            </AdminActionButton>
          </div>
        </AdminCard>
      ) : null}

      <Link href={PLATFORM_POPUP_ADMIN_REQUEST_ROUTES.queue} className="text-sm text-sam-primary underline">
        {translateBy(lang, "admin_back_to_request_queue")}
      </Link>
    </div>
  );
}
