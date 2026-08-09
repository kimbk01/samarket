"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { feedAdPlacementHumanLabel, isFeedAdCampaignEligibleNow, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
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
};

export function AdminFeedAdRequestDetail({ requestId }: { requestId: string }) {
  const { t, safeT, language } = useI18n();
  const en = language === "en";
  const router = useRouter();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [destType, setDestType] = useState("internal_page");
  const [destUrl, setDestUrl] = useState("");
  const [destId, setDestId] = useState("");
  const [durationDays, setDurationDays] = useState(7);
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
      setDestType(j.request.destinationType || "internal_page");
      setDestUrl(j.request.destinationUrl || "");
      setDestId(j.request.destinationId || "");
      setDurationDays(j.request.durationDays || 7);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "approve" | "reject") => {
    let reason = "";
    if (action === "reject") {
      reason =
        window.prompt(
          safeT("admin_feed_req_reject_prompt", {
            fallbackKo: "거절 사유 (필수)",
            fallbackEn: "Reject reason (required)",
          }),
          ""
        ) ?? "";
      if (!reason.trim()) return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/feed-ad-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveFields = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/feed-ad-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          destinationType: destType,
          destinationUrl: destUrl,
          destinationId: destId,
          durationDays,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "update_failed");
        return;
      }
      await load();
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
      const uj = (await up.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!up.ok || !uj.ok || !uj.url) {
        setErr(uj.error ?? "upload_failed");
        return;
      }
      const res = await fetch(`/api/admin/feed-ad-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace_creative",
          sortOrder,
          imageUrl: uj.url,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "replace_failed");
        return;
      }
      await load();
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <AdminPageHeader titleKey="admin_menu_ads_applications" backHref="/admin/ad-applications" />
        <p className="text-sam-muted">{t("common_loading")}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 space-y-3">
        <AdminPageHeader titleKey="admin_menu_ads_applications" backHref="/admin/ad-applications" />
        <p className="text-sam-warning">{err || "not_found"}</p>
        <Link href="/admin/ad-applications" className="text-sam-primary underline">
          Back
        </Link>
      </div>
    );
  }

  const r = data.request;
  const pending = r.status === "pending_review";
  const primary = data.creatives[0];
  const pixelLabel = feedAdStandardPixelLabel();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <AdminPageHeader titleKey="admin_menu_ads_applications" backHref="/admin/ad-applications" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="sam-text-title font-semibold text-sam-fg">
          {safeT("admin_feed_req_detail_title", {
            fallbackKo: "피드 광고 신청 상세",
            fallbackEn: "Feed ad request detail",
          })}
        </h1>
        <button
          type="button"
          className="sam-text-helper text-sam-primary underline"
          onClick={() => void load()}
        >
          {en ? "Refresh" : "새로고침"}
        </button>
      </div>

      {err ? <p className="sam-text-helper text-sam-warning">{err}</p> : null}

      <section className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">
          Request · {r.id}
          {r.campaignId ? ` · Campaign · ${r.campaignId}` : ""}
        </p>
        <p className="sam-text-body font-medium">
          {feedAdPlacementHumanLabel(r.placement as FeedAdPlacement, en ? "en" : "ko")}
          {" · "}
          {r.durationDays}
          {en ? "d" : "일"} · {r.pointCost.toLocaleString()}P · {r.status}
        </p>
        <p className="sam-text-helper text-sam-muted" data-testid="admin-feed-req-target">
          Domain {r.domain}
          {r.targetTopicSlug ? ` · topic ${r.targetTopicSlug}` : ""}
          {r.targetCategoryId ? ` · category ${r.targetCategoryId}` : ""}
          {" · dest "}
          {r.destinationType || "none"}
          {r.destinationId ? ` · ${r.destinationId}` : ""}
          {r.destinationUrl ? ` · ${r.destinationUrl}` : ""}
        </p>
        <p className="sam-text-helper text-sam-muted">
          Member {r.userId.slice(0, 8)}… · {r.source} · {new Date(r.createdAt).toLocaleString()}
        </p>
        <p className="sam-text-helper text-sam-muted">
          Billing:{" "}
          {data.holds[0]
            ? `${data.holds[0].status} (${data.holds[0].amount}P)`
            : en
              ? "none"
              : "없음"}
          {" · Creative authority: "}
          {data.creativeAuthority}
        </p>
        {data.campaign ? (
          <p
            className="sam-text-helper text-sam-muted"
            data-testid="admin-feed-req-eligibility"
          >
            Campaign {data.campaign.status}
            {data.campaign.startAt
              ? ` · ${new Date(data.campaign.startAt).toLocaleString()} → ${
                  data.campaign.endAt
                    ? new Date(data.campaign.endAt).toLocaleString()
                    : "—"
                }`
              : ""}
            {" · "}
            {isFeedAdCampaignEligibleNow({
              status: data.campaign.status as "active",
              startAt: data.campaign.startAt,
              endAt: data.campaign.endAt,
            })
              ? en
                ? "Eligible now"
                : "현재 노출 가능"
              : en
                ? "Not eligible now"
                : "현재 미노출"}
          </p>
        ) : null}
        {r.reviewReason ? (
          <p className="sam-text-helper text-sam-warning">{r.reviewReason}</p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="sam-text-body font-semibold">
          {safeT("admin_feed_req_creative", {
            fallbackKo: "Creative (저장된 이미지)",
            fallbackEn: "Persisted creative",
          })}
        </h2>
        <p className="sam-text-helper text-sam-muted" data-testid="admin-feed-req-pixel">
          {safeT("admin_feed_req_pixel", {
            fallbackKo: `표준 배너 크기: ${pixelLabel}`,
            fallbackEn: `Standard banner size: ${pixelLabel}`,
          })}
          {" · JPG · PNG · WebP · "}
          {en ? "max 2MB" : "최대 2MB"}
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
        <p className="break-all sam-text-helper text-sam-muted" data-testid="admin-feed-req-persisted-url">
          {primary?.imageUrl || "—"}
        </p>
        {data.creatives.map((c) => (
          <div key={c.id || c.sortOrder} className="flex flex-wrap items-center gap-2">
            <span className="sam-text-helper">#{c.sortOrder}</span>
            <label className="cursor-pointer rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper">
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
          </div>
        ))}
      </section>

      {pending ? (
        <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold">
            {safeT("admin_feed_req_edit", {
              fallbackKo: "Destination / 기간 (승인 전)",
              fallbackEn: "Destination / period (pending)",
            })}
          </h2>
          <select
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={destType}
            onChange={(e) => setDestType(e.target.value)}
          >
            <option value="none">{en ? "None" : "연결 없음"}</option>
            <option value="internal_page">{en ? "Internal page" : "내부 경로"}</option>
            <option value="external_url">{en ? "External URL" : "외부 URL"}</option>
            <option value="trade_listing">{en ? "Trade listing" : "거래 글"}</option>
            <option value="community_post">{en ? "Community post" : "커뮤니티 글"}</option>
            <option value="store">{en ? "Store" : "매장"}</option>
          </select>
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={destUrl}
            onChange={(e) => setDestUrl(e.target.value)}
            placeholder={destType === "external_url" ? "https://…" : "/path"}
          />
          <input
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={destId}
            onChange={(e) => setDestId(e.target.value)}
            placeholder="destination id (listing/post/store)"
          />
          <label className="block sam-text-helper text-sam-muted">
            {en ? "Duration days" : "기간(일)"}
            <input
              type="number"
              min={1}
              max={90}
              className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2"
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value) || 1)}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            className="rounded-ui-rect border border-sam-border px-4 py-2 sam-text-body disabled:opacity-50"
            onClick={() => void saveFields()}
          >
            {safeT("common_save", { fallbackKo: "저장", fallbackEn: "Save" })}
          </button>
        </section>
      ) : null}

      {pending ? (
        <div className="flex gap-2">
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
            {safeT("admin_feed_req_reject", { fallbackKo: "거절", fallbackEn: "Reject" })}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className="sam-text-helper text-sam-muted underline"
        onClick={() => router.push("/admin/ad-applications")}
      >
        {en ? "Back to queue" : "큐로 돌아가기"}
      </button>
    </div>
  );
}
