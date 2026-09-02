"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPlatformPopupPreview } from "@/components/admin/platform-popup/AdminPlatformPopupPreview";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";
import type { PlatformPopupOwnerRequestAdminAction } from "@/lib/platform-popup/owner-request-types";
import { PLATFORM_POPUP_ADMIN_REQUEST_ROUTES } from "@/lib/platform-popup/platform-popup-owner-routes";
import { formatDeliveryAdPhpMinor } from "@/lib/stores/advertising/delivery-ad-commercial-labels";

export function AdminPlatformPopupRequestDetailWorkspace() {
  const { safeT } = useI18n();
  const router = useRouter();
  const params = useParams();
  const requestId = String(params?.requestId ?? "").trim();
  const [item, setItem] = useState<PlatformPopupOwnerRequestRow | null>(null);
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
      item?: PlatformPopupOwnerRequestRow;
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
      item?: PlatformPopupOwnerRequestRow;
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

  return (
    <div className="space-y-4" data-admin-platform-popup-request-detail="1">
      <AdminPageHeader
        title={`Owner request · ${item.requestStatus}`}
        description={`${item.paymentStatus} · ${item.storeId}`}
      />

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <AdminCard>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-sam-muted">Surfaces</dt>
            <dd>{item.requestedSurfaces.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">Price</dt>
            <dd>{item.priceMinor != null ? formatDeliveryAdPhpMinor(item.priceMinor) : "—"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">CTA</dt>
            <dd>
              {item.ctaType} · {item.ctaTarget}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">Schedule</dt>
            <dd className="text-xs">
              {item.requestedStartAt || "—"} → {item.requestedEndAt || "—"}
            </dd>
          </div>
          {item.adminCampaignId ? (
            <div className="sm:col-span-2">
              <dt className="text-sam-muted">Campaign</dt>
              <dd>
                <Link
                  href={`/admin/platform-popup/${item.adminCampaignId}`}
                  className="text-sam-brand underline"
                >
                  {item.adminCampaignId}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </AdminCard>

      <AdminCard>
        <AdminPlatformPopupPreview
          source={
            item.creativeAssetUrl
              ? {
                  campaignId: item.id,
                  creativeId: "owner-request",
                  imageUrl: item.creativeAssetUrl,
                  altText: item.creativeAltText || "Advertisement",
                  ctaHref: item.externalUrl || `/stores/${item.storeId}`,
                  ctaType: item.ctaType,
                  surface: item.requestedSurfaces[0] || "GLOBAL",
                  suppressionMode: item.suppressionMode,
                  suppressionDurationSeconds: item.suppressionDurationSeconds,
                  timezone: item.timezone,
                }
              : null
          }
        />
      </AdminCard>

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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-sam-border px-3 py-1.5 text-sm"
            disabled={busy}
            onClick={() => void act("start_review")}
          >
            {safeT("admin_platform_popup_request_start_review", {
              fallbackKo: "검수 시작",
              fallbackEn: "Start review",
            })}
          </button>
          <button
            type="button"
            className="rounded bg-sam-brand px-3 py-1.5 text-sm font-semibold text-white"
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
              fallbackKo: "승인 후 즉시 활성",
              fallbackEn: "Approve & activate",
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
            className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-700"
            disabled={busy}
            onClick={() => void act("reject")}
          >
            {safeT("admin_platform_popup_request_reject", {
              fallbackKo: "거절",
              fallbackEn: "Reject",
            })}
          </button>
        </div>
      </AdminCard>
    </div>
  );
}
