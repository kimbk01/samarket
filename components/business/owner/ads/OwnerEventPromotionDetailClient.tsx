"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformEventOwnerRequestRow } from "@/lib/platform-event-owner-requests/types";
import { isOwnerEditableEventPromoRequest } from "@/lib/platform-event-owner-requests/lifecycle";
import { ownerRequestStatusLabelKey } from "@/lib/platform-event-owner-requests/types";

type Props = { requestId: string };

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function fromDateInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  return `${v}T00:00:00.000Z`;
}

export function OwnerEventPromotionDetailClient({ requestId }: Props) {
  const { safeT } = useI18n();
  const [request, setRequest] = useState<PlatformEventOwnerRequestRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/me/event-promotion-requests/${encodeURIComponent(requestId)}`, {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        request?: PlatformEventOwnerRequestRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.request) {
        setError(json.error || "load_failed");
        return;
      }
      setRequest(json.request);
    } catch {
      setError("load_failed");
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!request || !isOwnerEditableEventPromoRequest(request.requestStatus)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/event-promotion-requests/${encodeURIComponent(requestId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: request.title,
          body: request.body,
          benefitTitle: request.benefitTitle,
          benefitBody: request.benefitBody,
          heroImageUrl: request.heroImageUrl,
          heroImagePath: request.heroImagePath,
          requestedStartsAt: request.requestedStartsAt,
          requestedEndsAt: request.requestedEndsAt,
          destinationType: request.destinationType,
          destinationTarget: request.destinationTarget,
          requestedChannels: request.requestedChannels,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        request?: PlatformEventOwnerRequestRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.request) {
        setError(json.error || "save_failed");
        return;
      }
      setRequest(json.request);
    } catch {
      setError("save_failed");
    } finally {
      setBusy(false);
    }
  }, [request, requestId]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/me/event-promotion-requests/${encodeURIComponent(requestId)}/submit`,
        { method: "POST", credentials: "same-origin" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        request?: PlatformEventOwnerRequestRow;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.request) {
        setError(json.error || "submit_failed");
        return;
      }
      setRequest(json.request);
    } catch {
      setError("submit_failed");
    } finally {
      setBusy(false);
    }
  }, [requestId]);

  const uploadHero = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(
          `/api/me/event-promotion-requests/${encodeURIComponent(requestId)}/upload-image`,
          { method: "POST", credentials: "same-origin", body: form }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          request?: PlatformEventOwnerRequestRow;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.request) {
          setError(json.error || "upload_failed");
          return;
        }
        setRequest(json.request);
      } catch {
        setError("upload_failed");
      } finally {
        setBusy(false);
      }
    },
    [requestId]
  );

  if (!request) {
    return <p className="p-4 text-sm text-sam-muted">{error || "…"}</p>;
  }

  const editable = isOwnerEditableEventPromoRequest(request.requestStatus);

  return (
    <div className="space-y-4 p-4" data-owner-event-promo-detail="1">
      <h1 className="text-lg font-semibold">
        {safeT(ownerRequestStatusLabelKey(request.requestStatus) as never, {
          fallbackKo: "프로모션 신청",
          fallbackEn: "Promotion request",
        })}
      </h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {request.rejectionReason ? (
        <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm">
          {safeT("owner_event_promo_reject_reason", {
            fallbackKo: "반려 사유",
            fallbackEn: "Rejection reason",
          })}
          : {request.rejectionReason}
        </p>
      ) : null}

      <label className="block text-sm">
        {safeT("owner_event_promo_field_title", { fallbackKo: "제목", fallbackEn: "Title" })}
        <input
          className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
          disabled={!editable || busy}
          value={request.title}
          onChange={(e) => setRequest({ ...request, title: e.target.value })}
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium">
          {safeT("owner_event_promo_field_image", {
            fallbackKo: "대표 이미지",
            fallbackEn: "Hero image",
          })}
        </p>
        {request.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- owner draft preview URL
          <img
            src={request.heroImageUrl}
            alt=""
            className="max-h-40 w-auto rounded-ui-rect border border-sam-border object-cover"
          />
        ) : null}
        {editable ? (
          <label className="inline-flex cursor-pointer items-center rounded-ui-rect border border-sam-border px-3 py-2 text-sm">
            {safeT("owner_event_promo_upload", {
              fallbackKo: "이미지 업로드",
              fallbackEn: "Upload image",
            })}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void uploadHero(file);
              }}
            />
          </label>
        ) : null}
      </div>

      <label className="block text-sm">
        {safeT("owner_event_promo_field_body", { fallbackKo: "설명", fallbackEn: "Description" })}
        <textarea
          className="mt-1 h-28 w-full rounded border border-sam-border px-2 py-1.5"
          disabled={!editable || busy}
          value={request.body ?? ""}
          onChange={(e) => setRequest({ ...request, body: e.target.value })}
        />
      </label>

      <label className="block text-sm">
        {safeT("owner_event_promo_field_benefit", {
          fallbackKo: "혜택 (선택)",
          fallbackEn: "Benefit (optional)",
        })}
        <input
          className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
          disabled={!editable || busy}
          value={request.benefitTitle ?? ""}
          onChange={(e) => setRequest({ ...request, benefitTitle: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        {safeT("owner_event_promo_field_benefit_body", {
          fallbackKo: "혜택 설명 (선택)",
          fallbackEn: "Benefit details (optional)",
        })}
        <textarea
          className="mt-1 h-20 w-full rounded border border-sam-border px-2 py-1.5"
          disabled={!editable || busy}
          value={request.benefitBody ?? ""}
          onChange={(e) => setRequest({ ...request, benefitBody: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          {safeT("owner_event_promo_field_period_start", {
            fallbackKo: "희망 시작",
            fallbackEn: "Requested start",
          })}
          <input
            type="date"
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            disabled={!editable || busy}
            value={toDateInput(request.requestedStartsAt)}
            onChange={(e) =>
              setRequest({ ...request, requestedStartsAt: fromDateInput(e.target.value) })
            }
          />
        </label>
        <label className="block text-sm">
          {safeT("owner_event_promo_field_period_end", {
            fallbackKo: "희망 종료",
            fallbackEn: "Requested end",
          })}
          <input
            type="date"
            className="mt-1 w-full rounded border border-sam-border px-2 py-1.5"
            disabled={!editable || busy}
            value={toDateInput(request.requestedEndsAt)}
            onChange={(e) =>
              setRequest({ ...request, requestedEndsAt: fromDateInput(e.target.value) })
            }
          />
        </label>
      </div>

      <p className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-sm text-sam-muted">
        {safeT("owner_event_promo_field_destination", {
          fallbackKo: "연결 대상 (내 매장)",
          fallbackEn: "Destination (my store)",
        })}
        : {request.storeId}
      </p>

      <fieldset className="space-y-2 rounded-ui-rect border border-sam-border p-3">
        <legend className="px-1 text-sm font-medium">
          {safeT("owner_event_promo_requested_channels", {
            fallbackKo: "희망 노출 (요청)",
            fallbackEn: "Requested channels",
          })}
        </legend>
        <p className="text-xs text-sam-muted">
          {safeT("owner_event_promo_requested_channels_hint", {
            fallbackKo: "요청일 뿐이며, 최종 배포·푸시 발송은 관리자 권한입니다.",
            fallbackEn: "Suggestions only. Admin owns final distribution and push send.",
          })}
        </p>
        {(
          [
            ["popup", "팝업", "Popup"],
            ["banner", "배너", "Banner"],
            ["push", "푸시 요청", "Push request"],
            ["bell", "알림함 요청", "Inbox request"],
          ] as const
        ).map(([key, ko, en]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!editable || busy}
              checked={request.requestedChannels[key]}
              onChange={(e) =>
                setRequest({
                  ...request,
                  requestedChannels: {
                    ...request.requestedChannels,
                    [key]: e.target.checked,
                  },
                })
              }
            />
            {safeT(`owner_event_promo_ch_${key}`, { fallbackKo: ko, fallbackEn: en })}
          </label>
        ))}
      </fieldset>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
            onClick={() => void save()}
          >
            {safeT("owner_event_promo_save", { fallbackKo: "저장", fallbackEn: "Save" })}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-ui-rect bg-sam-fg px-3 py-2 text-sm font-semibold text-sam-app"
            onClick={() => void submit()}
          >
            {safeT("owner_event_promo_submit", {
              fallbackKo: "검토 요청",
              fallbackEn: "Submit for review",
            })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
