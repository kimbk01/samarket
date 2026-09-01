"use client";

import { dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import {
  feedAdOpsStatusLabel,
  projectFeedAdOpsProductStatus,
  type FeedAdOpsTimelineEvent,
} from "@/lib/ads/feed-ad-ops-presentation";
import { feedAdPlacementHumanLabel, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import { feedAdStandardPixelLabel } from "@/lib/ads/feed-ad-geometry";

type DetailCreative = {
  id: string;
  sortOrder: number;
  imageUrl: string;
  altText: string;
  headline: string;
};

type DetailPayload = {
  request: {
    id: string;
    userId: string;
    memberLabel?: string;
    status: string;
    domain: string;
    placement: string;
    productId: string;
    pointCost: number;
    durationDays: number;
    targetCategoryId?: string | null;
    targetTopicSlug?: string | null;
    destinationType: string;
    destinationId: string;
    destinationUrl: string;
    reviewReason: string | null;
    campaignId: string | null;
    createdAt: string;
    source: string;
  };
  creativeAuthority: "request" | "campaign";
  creatives: DetailCreative[];
  campaign: {
    id: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
    source: string;
  } | null;
  holds: { id: string; amount: number; status: string; createdAt: string }[];
  deliveryDiagnose?: {
    campaignEligibleNow: boolean;
    creativeUrlReachable: boolean;
    creativeUrlRejectReason: string | null;
    placementWinnerCampaignId: string | null;
    isCurrentPlacementWinner: boolean;
  };
  timeline?: FeedAdOpsTimelineEvent[];
};

function destinationSummary(
  r: DetailPayload["request"],
  en: boolean
): { label: string; host?: string } {
  const t = String(r.destinationType || "none").toLowerCase();
  if (t === "none" || !t) {
    return { label: en ? "No link" : "연결 없음" };
  }
  if (t === "external_url") {
    try {
      const host = new URL(r.destinationUrl).hostname;
      return { label: en ? "External link" : "외부 링크", host };
    } catch {
      return { label: en ? "External link" : "외부 링크" };
    }
  }
  if (t === "community_post") {
    return { label: en ? "My post" : "내 게시물" };
  }
  if (t === "trade_listing") {
    return { label: en ? "Trade listing" : "거래 상품" };
  }
  if (t === "store") {
    return { label: en ? "Store" : "매장" };
  }
  return { label: en ? "Internal link" : "내부 연결" };
}

export function AdminFeedAdRequestDetail({
  requestId,
  onClose,
  onChanged,
}: {
  requestId: string;
  /** When set, render as AdminFormSheet (queue). Page route may omit and use router.back. */
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const { t, safeT, language } = useI18n();
  const en = language === "en";
  const router = useRouter();
  const close = onClose ?? (() => router.push("/admin/ad-applications"));
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/feed-ad-requests/${requestId}`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as DetailPayload & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !j.ok || !j.request) {
        setErr(j.error ?? "load_failed");
        setData(null);
        return;
      }
      setData(j as DetailPayload);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const productStatus = useMemo(() => {
    if (!data) return "pending_review" as const;
    return projectFeedAdOpsProductStatus({
      requestStatus: data.request.status,
      campaignStatus: data.campaign?.status ?? null,
      campaignStartAt: data.campaign?.startAt ?? null,
      campaignEndAt: data.campaign?.endAt ?? null,
    });
  }, [data]);

  const act = async (action: "approve" | "reject" | "end") => {
    let reason = "";
    if (action === "reject") {
      reason =
        (
          await dibayPrompt({
            title: safeT("admin_feed_req_reject_prompt", {
              fallbackKo: "거절 사유 (필수)",
              fallbackEn: "Rejection reason (required)",
            }),
            required: true,
          })
        )?.trim() ?? "";
      if (!reason) return;
    }
    if (action === "end") {
      const ok = await dibayConfirm({ title: safeT("admin_feed_req_end_confirm", {
          fallbackKo:
            "광고를 종료할까요? 피드에서 즉시 제외됩니다. 이미 확정된 Point는 자동 환불되지 않습니다.",
          fallbackEn:
            "End this ad? It leaves the feed immediately. Captured Points are not auto-refunded.",
        }), confirmTone: "destructive" });
      if (!ok) return;
      reason = "admin_ended";
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/feed-ad-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason || undefined,
          campaignId: data?.campaign?.id ?? data?.request.campaignId ?? undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "action_failed");
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const replaceImage = async (file: File, sortOrder: number) => {
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const up = await fetch("/api/admin/feed-ads/upload", { method: "POST", body: fd });
      const uj = (await up.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!up.ok || !uj.url) {
        setErr(uj.error ?? "upload_failed");
        return;
      }
      const res = await fetch(`/api/admin/feed-ad-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "replace_creative", imageUrl: uj.url, sortOrder }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "replace_failed");
        return;
      }
      await load();
      onChanged?.();
    } finally {
      setUploading(false);
    }
  };

  const title = safeT("admin_feed_req_detail_title", {
    fallbackKo: "피드 광고 신청 상세",
    fallbackEn: "Feed ad request detail",
  });

  if (loading) {
    return (
      <AdminFormSheet title={title} onClose={close}>
        <p className="text-sam-muted">{t("common_loading")}</p>
      </AdminFormSheet>
    );
  }

  if (!data) {
    return (
      <AdminFormSheet title={title} onClose={close}>
        <p className="text-sam-warning">{err || "not_found"}</p>
      </AdminFormSheet>
    );
  }

  const r = data.request;
  const pending = r.status === "pending_review";
  const canEnd =
    productStatus === "active" ||
    productStatus === "scheduled" ||
    String(data.campaign?.status ?? "").toLowerCase() === "active" ||
    String(data.campaign?.status ?? "").toLowerCase() === "scheduled";
  const primary = data.creatives[0];
  const dest = destinationSummary(r, en);
  const statusLabel = feedAdOpsStatusLabel(productStatus, en ? "en" : "ko");
  const placementLabel = feedAdPlacementHumanLabel(r.placement as FeedAdPlacement, en ? "en" : "ko");
  const pixelLabel = feedAdStandardPixelLabel();
  const openHref = (() => {
    const dt = String(r.destinationType || "").toLowerCase();
    if (dt === "external_url" && /^https?:\/\//i.test(r.destinationUrl)) {
      return r.destinationUrl;
    }
    if (dt === "community_post" && r.destinationId) {
      return `/philife/post/${encodeURIComponent(r.destinationId)}`;
    }
    if (dt === "trade_listing" && r.destinationId) {
      return `/post/${encodeURIComponent(r.destinationId)}`;
    }
    if (r.destinationUrl.startsWith("/")) return r.destinationUrl;
    return null;
  })();


  const footer = (
    <div className="flex flex-wrap gap-2">
      {pending ? (
        <>
          <button
            type="button"
            data-testid="admin-feed-req-detail-approve"
            disabled={busy}
            className="rounded-ui-rect bg-signature px-4 py-2 font-medium text-white disabled:opacity-50"
            onClick={() => void act("approve")}
          >
            {safeT("admin_feed_req_approve", { fallbackKo: "승인", fallbackEn: "Approve" })}
          </button>
          <button
            type="button"
            data-testid="admin-feed-req-detail-reject"
            disabled={busy}
            className="rounded-ui-rect border border-sam-border px-4 py-2 disabled:opacity-50"
            onClick={() => void act("reject")}
          >
            {safeT("admin_feed_req_reject", { fallbackKo: "반려", fallbackEn: "Reject" })}
          </button>
        </>
      ) : null}
      {canEnd && !pending ? (
        <button
          type="button"
          data-testid="admin-feed-req-detail-end"
          disabled={busy}
          className="rounded-ui-rect border border-sam-danger px-4 py-2 text-sam-danger disabled:opacity-50"
          onClick={() => void act("end")}
        >
          {safeT("admin_feed_req_end", { fallbackKo: "광고 종료", fallbackEn: "End ad" })}
        </button>
      ) : null}
      <button
        type="button"
        className="rounded-ui-rect border border-sam-border px-4 py-2"
        onClick={close}
      >
        {en ? "Close" : "닫기"}
      </button>
    </div>
  );

  return (
    <AdminFormSheet
      title={title}
      subtitle={`${statusLabel} · ${r.domain === "trade" ? "Trade" : "Community"} · ${placementLabel}`}
      onClose={close}
      footer={footer}
    >
      {err ? <p className="mb-3 sam-text-helper text-sam-warning">{err}</p> : null}

      <section className="mb-4 space-y-1 rounded-ui-rect border border-sam-border bg-sam-app p-3">
        <p className="sam-text-body font-semibold text-sam-fg">
          <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 sam-text-helper">
            {statusLabel}
          </span>
          {" · "}
          {r.durationDays}
          {en ? "d" : "일"} · {r.pointCost.toLocaleString()}P
        </p>
        <p className="sam-text-helper text-sam-muted">
          {en ? "Member" : "회원"} · {r.memberLabel || `${r.userId.slice(0, 8)}…`}
        </p>
        {r.targetTopicSlug ? (
          <p className="sam-text-helper text-sam-muted">
            Topic · {r.targetTopicSlug}
          </p>
        ) : null}
        {r.targetCategoryId ? (
          <p className="sam-text-helper text-sam-muted">
            Category · {r.targetCategoryId.slice(0, 8)}…
          </p>
        ) : null}
        {data.deliveryDiagnose ? (
          <p className="sam-text-helper text-sam-muted" data-testid="admin-feed-req-delivery-diagnose">
            Delivery · reachable=
            {data.deliveryDiagnose.creativeUrlReachable ? "yes" : "no"}
            {" · "}
            {data.deliveryDiagnose.isCurrentPlacementWinner
              ? en
                ? "today’s winner"
                : "오늘 승자"
              : en
                ? "not today’s winner"
                : "오늘 승자 아님"}
          </p>
        ) : null}
      </section>

      <section className="mb-4 space-y-2">
        <h3 className="sam-text-body font-semibold">
          {safeT("admin_feed_req_creative", {
            fallbackKo: "Creative",
            fallbackEn: "Creative",
          })}
        </h3>
        <p className="sam-text-helper text-sam-muted">
          {safeT("admin_feed_req_pixel", {
            fallbackKo: `표준 배너 크기: ${pixelLabel}`,
            fallbackEn: `Standard banner size: ${pixelLabel}`,
          })}
        </p>
        {primary?.imageUrl ? (
          <FeedAdFramePreview
            density={r.domain === "community" ? "community" : "trade"}
            imageUrl={primary.imageUrl}
            headline={primary.headline}
            alt={primary.altText}
          />
        ) : (
          <p className="sam-text-helper text-sam-muted">No creative</p>
        )}
        {pending
          ? data.creatives.map((c) => (
              <label
                key={c.id || c.sortOrder}
                className="inline-flex cursor-pointer rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper"
              >
                {uploading
                  ? t("common_loading")
                  : safeT("admin_feed_req_replace_image", {
                      fallbackKo: "PC에서 이미지 불러오기",
                      fallbackEn: "Load image from PC",
                    })}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploading || busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void replaceImage(f, c.sortOrder);
                    e.target.value = "";
                  }}
                />
              </label>
            ))
          : null}
      </section>

      <section className="mb-4 space-y-1">
        <h3 className="sam-text-body font-semibold">
          {en ? "Destination" : "연결"}
        </h3>
        <p className="sam-text-helper text-sam-fg">
          {dest.label}
          {dest.host ? ` · ${dest.host}` : ""}
        </p>
        {openHref ? (
          <a
            href={openHref}
            target="_blank"
            rel="noreferrer"
            className="sam-text-helper text-sam-primary underline"
          >
            {en ? "Open link" : "연결 확인"}
          </a>
        ) : null}
        {r.reviewReason && productStatus === "rejected" ? (
          <p className="sam-text-helper text-sam-warning">
            {en ? "Reason" : "사유"}: {r.reviewReason}
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="sam-text-body font-semibold">
          {en ? "History" : "이력"}
        </h3>
        <ul className="space-y-1">
          {(data.timeline ?? []).map((ev) => (
            <li key={ev.id} className="sam-text-helper text-sam-muted">
              {new Date(ev.at).toLocaleString()} · {en ? ev.labelEn : ev.labelKo}
              {ev.detail ? ` · ${ev.detail}` : ""}
            </li>
          ))}
          {(data.timeline ?? []).length === 0 ? (
            <li className="sam-text-helper text-sam-muted">—</li>
          ) : null}
        </ul>
      </section>
    </AdminFormSheet>
  );
}
