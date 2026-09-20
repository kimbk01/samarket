"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PlatformEventDetailContent } from "@/components/platform-events/PlatformEventDetailContent";
import type { PlatformEventOwnerRequestRow } from "@/lib/platform-event-owner-requests/types";
import type { PlatformEventRow } from "@/lib/platform-events/types";

type Props = { requestId: string };

function previewFromRequest(req: PlatformEventOwnerRequestRow): PlatformEventRow {
  const now = new Date().toISOString();
  const sections = [];
  if (req.body?.trim()) sections.push({ type: "text" as const, body: req.body.trim() });
  if (req.benefitTitle?.trim()) {
    sections.push({
      type: "benefit" as const,
      title: req.benefitTitle.trim(),
      body: req.benefitBody?.trim() || undefined,
    });
  }
  return {
    id: "preview",
    title: req.title,
    subtitle: req.subtitle,
    heroImageUrl: req.heroImageUrl,
    heroImagePath: req.heroImagePath,
    sections,
    terms: null,
    status: "draft",
    startsAt: req.requestedStartsAt,
    endsAt: req.requestedEndsAt,
    timezone: req.timezone,
    ctaLabel: "자세히 보기",
    ctaType: req.destinationType === "store" ? "store" : "internal_page",
    ctaTarget: req.destinationTarget || req.storeId,
    ctaExternalUrl: null,
    publishedAt: null,
    sourceOwnerRequestId: req.id,
    sourceStoreId: req.storeId,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function AdminPlatformEventOwnerRequestDetailClient({ requestId }: Props) {
  const { safeT, language } = useI18n();
  const [request, setRequest] = useState<PlatformEventOwnerRequestRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/platform-event-owner-requests/${encodeURIComponent(requestId)}`,
        { credentials: "same-origin" }
      );
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

  const act = useCallback(
    async (action: "approve" | "reject" | "start_review" | "revision_required") => {
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const res = await fetch(
          `/api/admin/platform-event-owner-requests/${encodeURIComponent(requestId)}/actions`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              reason: action === "reject" || action === "revision_required" ? rejectReason : undefined,
            }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          platformEventId?: string;
          pushDispatchCount?: number;
          distributionHandoffPath?: string;
          request?: PlatformEventOwnerRequestRow;
        };
        if (!res.ok || !json.ok) {
          setError(json.error || "action_failed");
          return;
        }
        if (json.request) setRequest(json.request);
        if (typeof json.pushDispatchCount === "number" && json.pushDispatchCount !== 0) {
          setError("push_dispatch_on_approve_forbidden");
          return;
        }
        if (json.distributionHandoffPath) {
          setInfo(
            safeT("admin_event_owner_approve_handoff", {
              fallbackKo: "승인됨 · 이벤트 초안 연결. 배포/푸시는 별도 설정.",
              fallbackEn: "Approved · Event draft linked. Configure distribution separately.",
            })
          );
        }
      } catch {
        setError("action_failed");
      } finally {
        setBusy(false);
      }
    },
    [requestId, rejectReason, safeT]
  );

  if (!request) {
    return <p className="p-4 text-sm text-sam-muted">{error || "…"}</p>;
  }

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-2" data-admin-event-owner-request-detail="1">
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">{request.title}</h1>
        <p className="text-sm text-sam-muted">
          {request.requestStatus} · store {request.storeId}
        </p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {info ? <p className="text-sm text-sam-muted">{info}</p> : null}
        <p className="text-sm">
          {safeT("admin_event_owner_requested_channels", {
            fallbackKo: "희망 채널",
            fallbackEn: "Requested channels",
          })}
          : popup={String(request.requestedChannels.popup)} banner=
          {String(request.requestedChannels.banner)} push=
          {String(request.requestedChannels.push)} bell=
          {String(request.requestedChannels.bell)}
        </p>
        <label className="block text-sm">
          {safeT("admin_event_owner_reject_reason", {
            fallbackKo: "반려/수정 사유",
            fallbackEn: "Reject / revision reason",
          })}
          <textarea
            className="mt-1 h-20 w-full rounded border border-sam-border px-2 py-1.5"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
            onClick={() => void act("start_review")}
          >
            Review
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-ui-rect bg-sam-fg px-3 py-2 text-sm font-semibold text-sam-app"
            onClick={() => void act("approve")}
          >
            {safeT("admin_event_owner_approve", { fallbackKo: "승인", fallbackEn: "Approve" })}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-ui-rect border border-sam-border px-3 py-2 text-sm"
            onClick={() => void act("reject")}
          >
            {safeT("admin_event_owner_reject", { fallbackKo: "반려", fallbackEn: "Reject" })}
          </button>
        </div>
        {request.platformEventId ? (
          <Link
            href={`/admin/platform-events/${encodeURIComponent(request.platformEventId)}`}
            className="inline-block text-sm font-semibold underline"
          >
            {safeT("admin_event_owner_open_event", {
              fallbackKo: "연결된 이벤트 · 배포 설정으로",
              fallbackEn: "Open linked Event · Distribution",
            })}
          </Link>
        ) : null}
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-app">
        <div className="border-b border-sam-border px-3 py-2 text-xs font-semibold text-sam-muted">
          {safeT("admin_event_owner_preview", {
            fallbackKo: "Event Detail 미리보기",
            fallbackEn: "Event Detail preview",
          })}
        </div>
        <PlatformEventDetailContent
          event={previewFromRequest(request)}
          language={language === "en" ? "en" : "ko"}
        />
      </div>
    </div>
  );
}
