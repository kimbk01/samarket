"use client";

import Link from "next/link";
import { dibayConfirm, dibayPrompt } from "@/components/ui/dibay-overlay";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import {
  feedAdOpsStatusLabel,
  projectFeedAdOpsProductStatus,
  type FeedAdOpsTimelineEvent,
} from "@/lib/ads/feed-ad-ops-presentation";
import { feedAdPlacementHumanLabel, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import { feedAdStandardPixelLabel } from "@/lib/ads/feed-ad-geometry";
import { adsWorkspaceMutationConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { adsShellKindLabel } from "@/lib/admin/ads-exposure/shell-row";

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
  const ko = !en;
  const router = useRouter();
  const close = onClose ?? (() => router.push("/admin/advertising/applications"));
  const [data, setData] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [pendingReview, setPendingReview] = useState<"approve" | "reject" | null>(null);
  const [successKind, setSuccessKind] = useState<"approve" | "reject" | null>(null);

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
      setPreviewBroken(false);
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

  const runMutation = async (
    action: "approve" | "reject" | "end" | "pause" | "resume" | "extend_compensation",
    reason: string,
    requestedDays?: number
  ) => {
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
          requestedDays,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "action_failed");
        return false;
      }
      if (action === "approve" || action === "reject") {
        setSuccessKind(action);
      }
      await load();
      onChanged?.();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const actOps = async (action: "end" | "pause" | "resume" | "extend_compensation") => {
    let reason = "";
    if (action === "end") {
      const ok = await dibayConfirm({
        title: safeT("admin_feed_req_end_confirm", {
          fallbackKo:
            "광고를 종료할까요? 피드에서 즉시 제외됩니다. 이미 확정된 Point는 자동 환불되지 않습니다.",
          fallbackEn:
            "End this ad? It leaves the feed immediately. Captured Points are not auto-refunded.",
        }),
        confirmTone: "destructive",
      });
      if (!ok) return;
      reason = "admin_ended";
    }
    if (action === "pause") {
      reason =
        (
          await dibayPrompt({
            title: safeT("admin_feed_req_pause_prompt", {
              fallbackKo: "일시중지 사유 (권장)",
              fallbackEn: "Pause reason (recommended)",
            }),
          })
        )?.trim() ?? "admin_paused";
    }
    if (action === "resume") {
      const ok = await dibayConfirm({
        title: safeT("admin_feed_req_resume_confirm", {
          fallbackKo: "광고를 다시 노출할까요?",
          fallbackEn: "Resume this ad in the feed?",
        }),
      });
      if (!ok) return;
      reason = "admin_resumed";
    }
    let requestedDays: number | undefined;
    if (action === "extend_compensation") {
      const daysRaw =
        (
          await dibayPrompt({
            title: safeT("admin_feed_req_extend_days_prompt", {
              fallbackKo: "보상 연장 일수 (1–90)",
              fallbackEn: "Compensation days (1–90)",
            }),
            required: true,
          })
        )?.trim() ?? "";
      const days = Number(daysRaw);
      if (!Number.isInteger(days) || days < 1 || days > 90) return;
      requestedDays = days;
      reason =
        (
          await dibayPrompt({
            title: safeT("admin_feed_req_extend_reason_prompt", {
              fallbackKo: "보상 연장 사유 (필수)",
              fallbackEn: "Compensation reason (required)",
            }),
            required: true,
          })
        )?.trim() ?? "";
      if (!reason) return;
    }
    await runMutation(action, reason, requestedDays);
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
    fallbackKo: "광고 신청 검토",
    fallbackEn: "Ad application review",
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
  const campStatus = String(data.campaign?.status ?? "").toLowerCase();
  const canEnd =
    productStatus === "active" ||
    productStatus === "scheduled" ||
    campStatus === "active" ||
    campStatus === "scheduled" ||
    campStatus === "paused";
  const canPause = campStatus === "active" || campStatus === "scheduled";
  const canResume = campStatus === "paused";
  const primary = data.creatives[0];
  const dest = destinationSummary(r, en);
  const statusLabel = feedAdOpsStatusLabel(productStatus, en ? "en" : "ko");
  const placementLabel = feedAdPlacementHumanLabel(r.placement as FeedAdPlacement, en ? "en" : "ko");
  const pixelLabel = feedAdStandardPixelLabel();
  const productKey = r.domain === "community" ? "feed_banner_community" : "feed_banner_trade";
  const domainProductLabel = adsShellKindLabel("feed", productKey, ko);
  const adTitle =
    String(r.targetTopicSlug ?? "").trim() ||
    String(r.destinationId ?? "").trim() ||
    dest.label ||
    domainProductLabel;
  const creativeMissing = !primary?.imageUrl?.trim();
  const creativeUnreachable =
    Boolean(data.deliveryDiagnose) && data.deliveryDiagnose?.creativeUrlReachable === false;
  const creativeBlocked = creativeMissing || previewBroken || creativeUnreachable;
  const approveBlocked = pending && creativeBlocked;
  const reviewCopy = pendingReview
    ? adsWorkspaceMutationConfirmCopy(pendingReview, ko, { family: "feed_banner" })
    : null;

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

  const runtimeAfterDecision = (() => {
    if (productStatus === "active" && data.deliveryDiagnose?.isCurrentPlacementWinner) {
      return ko ? "현재 노출" : "Live now";
    }
    if (productStatus === "scheduled") return ko ? "예약" : "Scheduled";
    if (productStatus === "active") return ko ? "노출 대기" : "Waiting";
    if (productStatus === "rejected") return ko ? "비노출" : "Not exposing";
    return statusLabel;
  })();

  const footer = (
    <div className="flex flex-wrap gap-2" data-admin-feed-review-actions="1">
      {pending ? (
        <>
          <button
            type="button"
            data-testid="admin-feed-req-detail-reject"
            disabled={busy || pendingReview != null}
            className="rounded-ui-rect border border-sam-danger px-4 py-2 text-sam-danger disabled:opacity-50"
            onClick={() => setPendingReview("reject")}
          >
            {safeT("admin_feed_req_reject", { fallbackKo: "반려", fallbackEn: "Reject" })}
          </button>
          <button
            type="button"
            data-testid="admin-feed-req-detail-approve"
            disabled={busy || pendingReview != null || approveBlocked}
            title={
              approveBlocked
                ? ko
                  ? "광고 이미지를 확인할 수 없어 승인할 수 없습니다"
                  : "Cannot approve without a viewable creative"
                : undefined
            }
            className="rounded-ui-rect bg-signature px-4 py-2 font-medium text-white disabled:opacity-50"
            onClick={() => setPendingReview("approve")}
          >
            {safeT("admin_feed_req_approve", { fallbackKo: "승인", fallbackEn: "Approve" })}
          </button>
        </>
      ) : null}
      {canPause ? (
        <button
          type="button"
          data-testid="admin-feed-req-detail-pause"
          disabled={busy}
          className="rounded-ui-rect border border-sam-border px-4 py-2 disabled:opacity-50"
          onClick={() => void actOps("pause")}
        >
          {safeT("admin_feed_req_pause", { fallbackKo: "일시중지", fallbackEn: "Pause" })}
        </button>
      ) : null}
      {canResume ? (
        <button
          type="button"
          data-testid="admin-feed-req-detail-resume"
          disabled={busy}
          className="rounded-ui-rect border border-sam-border px-4 py-2 disabled:opacity-50"
          onClick={() => void actOps("resume")}
        >
          {safeT("admin_feed_req_resume", { fallbackKo: "재개", fallbackEn: "Resume" })}
        </button>
      ) : null}
      {canEnd && !pending ? (
        <button
          type="button"
          data-testid="admin-feed-req-detail-extend-compensation"
          disabled={busy}
          className="rounded-ui-rect border border-sam-border px-4 py-2 disabled:opacity-50"
          onClick={() => void actOps("extend_compensation")}
        >
          {safeT("admin_feed_req_extend_compensation", {
            fallbackKo: "보상 연장",
            fallbackEn: "Compensation extend",
          })}
        </button>
      ) : null}
      {canEnd && !pending ? (
        <button
          type="button"
          data-testid="admin-feed-req-detail-end"
          disabled={busy}
          className="rounded-ui-rect border border-sam-danger px-4 py-2 text-sam-danger disabled:opacity-50"
          onClick={() => void actOps("end")}
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
      subtitle={`${domainProductLabel} · ${statusLabel}`}
      onClose={close}
      footer={footer}
    >
      {err ? <p className="mb-3 sam-text-helper text-sam-warning">{err}</p> : null}

      {successKind ? (
        <section
          className="mb-4 space-y-2 rounded-ui-rect border border-sam-primary/30 bg-sam-primary/5 p-3"
          data-admin-feed-review-success="1"
          data-success-kind={successKind}
        >
          <p className="sam-text-body font-semibold text-sam-fg">
            {successKind === "approve"
              ? ko
                ? "광고가 승인되었습니다."
                : "Ad approved."
              : ko
                ? "광고가 반려되었습니다."
                : "Ad rejected."}
          </p>
          {successKind === "approve" ? (
            <>
              <p className="sam-text-helper font-semibold text-sam-fg">{ko ? "승인 완료" : "Approved"}</p>
              <dl className="grid gap-1 text-[13px]">
                <div>
                  <dt className="text-sam-muted">{ko ? "노출 위치" : "Placement"}</dt>
                  <dd>{placementLabel}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{ko ? "운영 상태" : "Operating status"}</dt>
                  <dd>{statusLabel}</dd>
                </div>
                <div>
                  <dt className="text-sam-muted">{ko ? "실제 노출 상태" : "Runtime"}</dt>
                  <dd>{runtimeAfterDecision}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  href="/admin/advertising/operations"
                  className="rounded-ui-rect bg-sam-primary px-3 py-1.5 text-[12px] font-semibold text-sam-on-primary"
                  data-admin-feed-ops-link="1"
                >
                  {ko ? "노출 관리에서 보기" : "View in operations"}
                </Link>
                {openHref ? (
                  <a
                    href={openHref}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-[12px]"
                  >
                    {ko ? "미리보기" : "Preview"}
                  </a>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <section className="mb-4 space-y-1" data-admin-feed-review-header="1">
        <p className="sam-text-helper font-semibold text-sam-muted">{domainProductLabel}</p>
        <h2 className="sam-text-body font-semibold text-sam-fg">{adTitle}</h2>
        <p className="sam-text-helper text-sam-fg">
          <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-0.5">{statusLabel}</span>
        </p>
      </section>

      <section className="mb-4 space-y-2" data-admin-feed-review-preview="1">
        <h3 className="sam-text-body font-semibold">
          {ko ? "광고 미리보기" : "Ad preview"}
        </h3>
        <p className="sam-text-helper text-sam-muted">
          {safeT("admin_feed_req_pixel", {
            fallbackKo: `표준 배너 크기: ${pixelLabel}`,
            fallbackEn: `Standard banner size: ${pixelLabel}`,
          })}
        </p>
        {primary?.imageUrl && !previewBroken && !creativeUnreachable ? (
          <FeedAdFramePreview
            density={r.domain === "community" ? "community" : "trade"}
            imageUrl={primary.imageUrl}
            headline={primary.headline}
            alt={primary.altText}
          />
        ) : (
          <p
            className="rounded-ui-rect border border-sam-danger/30 bg-sam-danger/5 px-3 py-4 text-[13px] text-sam-danger"
            data-admin-feed-creative-missing="1"
            role="alert"
          >
            {ko ? "광고 이미지를 확인할 수 없습니다." : "Ad creative cannot be displayed."}
          </p>
        )}
        {/* Hidden probe for broken URL when preview component does not surface onError */}
        {primary?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- creative reachability probe
          <img
            src={primary.imageUrl}
            alt=""
            className="hidden"
            onError={() => setPreviewBroken(true)}
            onLoad={() => setPreviewBroken(false)}
          />
        ) : null}
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

      <section className="mb-4 space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3">
        <dl className="grid gap-2 text-[13px]">
          <div>
            <dt className="text-sam-muted">{ko ? "신청자" : "Applicant"}</dt>
            <dd>{r.memberLabel || `${r.userId.slice(0, 8)}…`}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{ko ? "회원/매장" : "Member"}</dt>
            <dd>{ko ? `회원 ${r.userId.slice(0, 8)}` : `Member ${r.userId.slice(0, 8)}`}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{ko ? "결제" : "Payment"}</dt>
            <dd>
              {r.pointCost.toLocaleString()}P · {r.durationDays}
              {ko ? "일" : "d"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{ko ? "요청 노출 위치" : "Requested placement"}</dt>
            <dd>{placementLabel}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{ko ? "신청 기간" : "Period"}</dt>
            <dd>
              {data.campaign?.startAt || data.campaign?.endAt
                ? `${data.campaign?.startAt?.slice(0, 10) ?? "?"} → ${data.campaign?.endAt?.slice(0, 10) ?? "?"}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{ko ? "신청일" : "Requested at"}</dt>
            <dd>{r.createdAt ? new Date(r.createdAt).toLocaleString(en ? "en" : "ko") : "—"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{ko ? "연결" : "Destination"}</dt>
            <dd>
              {dest.label}
              {dest.host ? ` · ${dest.host}` : ""}
            </dd>
          </div>
        </dl>
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
        <p className="sam-text-helper text-sam-muted">
          ID · {r.id.slice(0, 8)}… · {data.creativeAuthority}
        </p>
      </section>

      {reviewCopy && pendingReview ? (
        <AdminActionConfirmDialog
          open
          title={reviewCopy.title}
          description={reviewCopy.body}
          confirmLabel={reviewCopy.confirmLabel}
          cancelLabel={reviewCopy.cancelLabel}
          tone={reviewCopy.tone}
          reasonRequired={reviewCopy.reasonRequired}
          reasonLabel={reviewCopy.reasonLabel}
          pending={busy}
          onCancel={() => setPendingReview(null)}
          onConfirm={(reason) => {
            const action = pendingReview;
            setPendingReview(null);
            void runMutation(action, reason);
          }}
        />
      ) : null}
    </AdminFormSheet>
  );
}
