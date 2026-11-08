"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { FeedAdFramePreview } from "@/components/ads/FeedAdBannerCarousel";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import {
  feedAdOpsStatusLabel,
  projectFeedAdOpsProductStatus,
  type FeedAdOpsTimelineEvent,
} from "@/lib/ads/feed-ad-ops-presentation";
import { feedAdPlacementHumanLabel, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import { feedAdStandardPixelLabel } from "@/lib/ads/feed-ad-geometry";
import { adsWorkspaceMutationConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import { adsShellKindLabel } from "@/lib/admin/ads-exposure/shell-row";
import { AdminTechInfo, formatAdminShortId, formatAdminShortIdEllipsis } from "@/components/admin/ui/AdminTechId";
import { useAdminWriteGuard } from "@/components/admin/access/use-admin-route-access";
import { AdminFeedAdAuditHistory, type AdminFeedAdAuditRow } from "@/components/admin/ads/AdminFeedAdAuditHistory";

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
    memberNickname?: string;
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
    impressionCount?: number;
    clickCount?: number;
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
  /** 보상 연장 입력 폼 (일수) — 입력 후 실행 확인은 confirmAdminAction(payout L2). */
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("");
  /** 종료 = L3 (설계 §6 · D-5): 귀책 선택 → 환급 미리보기(preview) → 사유 + 신청 번호 재입력 */
  const [endOpen, setEndOpen] = useState(false);
  const [endFault, setEndFault] = useState<"operator" | "member" | "none" | null>(null);
  const [endPreview, setEndPreview] = useState<
    { fault: string; refundPoints: number; paidPoints: number } | { fault: string; error: string } | null
  >(null);
  /** 감사 이력 블록 (보완 §7 — 팝업 상세 /audit 와 같은 모양) */
  const [auditItems, setAuditItems] = useState<AdminFeedAdAuditRow[]>([]);

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

  const loadAudit = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/feed-ad-requests/${requestId}/audit`, { cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: AdminFeedAdAuditRow[] };
      setAuditItems(res.ok && j.ok && Array.isArray(j.items) ? j.items : []);
    } catch {
      setAuditItems([]);
    }
  }, [requestId]);

  useEffect(() => {
    void load();
    void loadAudit();
  }, [load, loadAudit]);

  const productStatus = useMemo(() => {
    if (!data) return "pending_review" as const;
    return projectFeedAdOpsProductStatus({
      requestStatus: data.request.status,
      campaignStatus: data.campaign?.status ?? null,
      campaignStartAt: data.campaign?.startAt ?? null,
      campaignEndAt: data.campaign?.endAt ?? null,
    });
  }, [data]);

  /** 재감사 S-2 (H-4): 승인·반려·종료·정지·재개·보상 연장·이미지 교체 = ads 키 (서버 PATCH 와 같음) */
  const writeGuard = useAdminWriteGuard("/admin/feed-ad-requests");
  const runMutation = async (
    action: "approve" | "reject" | "end" | "pause" | "resume" | "extend_compensation",
    reason: string,
    requestedDays?: number,
    extra?: { internalReason?: string | null; fault?: "operator" | "member" | "none" | null }
  ) => {
    if (!writeGuard.guard()) return;
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
          // D-6: 공개 사유(reason · 회원에게 보임)와 내부 메모를 따로 보낸다
          internalReason: extra?.internalReason || undefined,
          fault: extra?.fault ?? undefined,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "action_failed");
        return false;
      }
      void loadAudit();
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

  /** 승인(L2)·반려(L2) — 확인 단계는 동작 표(copy.level), 사유는 API 로 보내 감사에 남긴다. */
  const requestReview = async (action: "approve" | "reject") => {
    if (pendingReview) return;
    // AL-14: 권한이 없으면 사유 창 전에 막는다
    if (!writeGuard.guard()) return;
    setPendingReview(action);
    try {
      const copy = adsWorkspaceMutationConfirmCopy(action, ko, { family: "feed_banner" });
      const confirmed = await confirmAdminAction({
        level: copy.level,
        ko,
        title: copy.title,
        description: copy.body,
        confirmLabel: copy.confirmLabel,
        destructive: copy.tone === "danger",
        reasonPlaceholder: copy.reasonLabel,
      });
      if (!confirmed.ok) return;
      await runMutation(action, confirmed.reason ?? "");
    } finally {
      setPendingReview(null);
    }
  };

  /**
   * 설계 §6 · FB-A05 · AD-103 (2026-11-04): 정지·재개 = L2(공개 사유 + 내부 메모) · 종료 = L3(귀책 + 환급 미리보기 + 사유 + 재입력) ·
   * 보상 연장 = L2. 같은 동작 표(`adsWorkspaceMutationConfirmCopy`)를 공통 광고 화면과 같이 쓴다.
   */
  const actOps = async (action: "end" | "pause" | "resume" | "extend_compensation") => {
    // AL-14: 권한이 없으면 사유 창 전에 막는다
    if (!writeGuard.guard()) return;
    if (action === "end") {
      setEndFault(null);
      setEndPreview(null);
      setEndOpen(true);
      return;
    }
    if (action === "extend_compensation") {
      // 보상 연장 = extend(L2) — 일수는 아래 입력 폼에서 받고, 실행 확인·사유는 submitExtendCompensation.
      setExtendDays("");
      setExtendOpen(true);
      return;
    }
    const copy = adsWorkspaceMutationConfirmCopy(action, ko, { family: "feed_banner" });
    const confirmed = await confirmAdminAction({
      level: copy.level,
      ko,
      title:
        action === "pause"
          ? ko
            ? "광고 노출을 일시중지할까요? 피드에서 곧바로 빠집니다."
            : "Pause this ad? It leaves the feed shortly."
          : safeT("admin_feed_req_resume_confirm"),
      description: copy.body,
      confirmLabel: copy.confirmLabel,
      splitReason: copy.splitReason,
    });
    if (!confirmed.ok) return;
    await runMutation(action, confirmed.reason ?? "", undefined, { internalReason: confirmed.internalMemo ?? null });
  };

  // 귀책을 고르면 서버 계산으로 환급 예정 포인트를 먼저 보여 준다 (preview: 기록·변경 없음).
  useEffect(() => {
    if (!endOpen || !endFault) return;
    let alive = true;
    setEndPreview(null);
    void (async () => {
      try {
        const res = await fetch(`/api/admin/feed-ad-requests/${requestId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "end", preview: true, fault: endFault }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          preview?: { refundPoints?: number; paidPoints?: number };
        };
        if (!alive) return;
        if (!res.ok || !j.ok) {
          setEndPreview({ fault: endFault, error: j.error || "action_failed" });
          return;
        }
        setEndPreview({
          fault: endFault,
          refundPoints: Number(j.preview?.refundPoints ?? 0),
          paidPoints: Number(j.preview?.paidPoints ?? 0),
        });
      } catch {
        if (alive) setEndPreview({ fault: endFault, error: "network_error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [endOpen, endFault, requestId]);

  const submitEnd = async () => {
    if (!endFault || !endPreview || "error" in endPreview || endPreview.fault !== endFault) return;
    const fault = endFault;
    const copy = adsWorkspaceMutationConfirmCopy("end", ko, { family: "feed_banner" });
    const confirmed = await confirmAdminAction({
      level: copy.level,
      ko,
      title: copy.title,
      description: copy.body,
      confirmLabel: copy.confirmLabel,
      destructive: true,
      retypeValue: formatAdminShortId(requestId),
      splitReason: copy.splitReason,
    });
    if (!confirmed.ok) return;
    setEndOpen(false);
    await runMutation("end", confirmed.reason ?? "", undefined, {
      internalReason: confirmed.internalMemo ?? null,
      fault,
    });
  };

  const extendDaysValue = Number(extendDays.trim());
  const extendDaysValid = Number.isInteger(extendDaysValue) && extendDaysValue >= 1 && extendDaysValue <= 90;

  const submitExtendCompensation = async () => {
    if (!extendDaysValid) return;
    const days = extendDaysValue;
    if (!writeGuard.guard()) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("extend"),
      ko,
      title: ko ? `보상 연장 ${days}일을 적용할까요?` : `Apply a ${days}-day compensation extension?`,
      confirmLabel: ko ? "연장" : "Extend",
      splitReason: true,
    });
    if (!confirmed.ok) return;
    setExtendOpen(false);
    await runMutation("extend_compensation", confirmed.reason ?? "", days, {
      internalReason: confirmed.internalMemo ?? null,
    });
  };

  const replaceImage = async (file: File, sortOrder: number) => {
    if (!writeGuard.guard()) return;
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const up = await fetch("/api/admin/feed-ads/upload", { method: "POST", body: fd });
      const uj = (await up.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string; message?: string };
      if (!up.ok || !uj.url) {
        // FA-3 (2026-11-04): 서버가 준 한국어 사유를 보인다 — 코드값(aspect_mismatch 등)은 화면에 보이지 않게
        setErr(
          uj.message?.trim() ||
            safeT("ads_f_upload_failed_generic")
        );
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

  const title = safeT("admin_feed_req_detail_title");

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

  /** AL-14: 버튼 권한 = 서버 PATCH 와 같은 ads 키 — 권한이 없으면 사유 창 전에 버튼이 꺼진다 */
  const writeDenied = !writeGuard.loading && !writeGuard.allowed;
  const writeDeniedTitle = writeDenied ? writeGuard.reason ?? (ko ? "이 작업을 할 권한이 없습니다." : "No permission.") : undefined;
  const endPreviewReady =
    endFault != null && endPreview != null && !("error" in endPreview) && endPreview.fault === endFault;

  const footer = (
    <div className="flex flex-wrap gap-2" data-admin-feed-review-actions="1">
      {pending ? (
        <>
          <AdminActionButton
            variant="secondary"
            data-testid="admin-feed-req-detail-reject"
            disabled={busy || pendingReview != null || writeDenied}
            title={writeDeniedTitle}
            onClick={() => void requestReview("reject")}
          >
            {safeT("admin_feed_req_reject")}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            data-testid="admin-feed-req-detail-approve"
            disabled={busy || pendingReview != null || approveBlocked || writeDenied}
            title={
              approveBlocked
                ? ko
                  ? "광고 이미지를 확인할 수 없어 승인할 수 없습니다"
                  : "Cannot approve without a viewable creative"
                : writeDeniedTitle
            }
            onClick={() => void requestReview("approve")}
          >
            {safeT("admin_feed_req_approve")}
          </AdminActionButton>
        </>
      ) : null}
      {canPause ? (
        <AdminActionButton
          variant="secondary"
          data-testid="admin-feed-req-detail-pause"
          disabled={busy || extendOpen || endOpen || writeDenied}
          title={writeDeniedTitle}
          onClick={() => void actOps("pause")}
        >
          {safeT("admin_feed_req_pause")}
        </AdminActionButton>
      ) : null}
      {canResume ? (
        <AdminActionButton
          variant="secondary"
          data-testid="admin-feed-req-detail-resume"
          disabled={busy || extendOpen || endOpen || writeDenied}
          title={writeDeniedTitle}
          onClick={() => void actOps("resume")}
        >
          {safeT("admin_feed_req_resume")}
        </AdminActionButton>
      ) : null}
      {canEnd && !pending ? (
        <AdminActionButton
          variant="secondary"
          data-testid="admin-feed-req-detail-extend-compensation"
          disabled={busy || extendOpen || endOpen || writeDenied}
          title={writeDeniedTitle}
          onClick={() => void actOps("extend_compensation")}
        >
          {safeT("admin_feed_req_extend_compensation")}
        </AdminActionButton>
      ) : null}
      {canEnd && !pending ? (
        <AdminActionButton
          variant="danger"
          data-testid="admin-feed-req-detail-end"
          disabled={busy || extendOpen || endOpen || writeDenied}
          title={writeDeniedTitle}
          onClick={() => void actOps("end")}
        >
          {safeT("admin_feed_req_end")}
        </AdminActionButton>
      ) : null}
      {extendOpen ? (
        <div
          className="flex w-full flex-wrap items-end gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-3"
          data-admin-feed-extend-form="1"
        >
          <label className="block text-[13px] text-sam-muted">
            {safeT("admin_feed_req_extend_days_prompt")}
            <input
              type="number"
              min={1}
              max={90}
              step={1}
              inputMode="numeric"
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              className="mt-1 block w-28 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg"
            />
          </label>
          <AdminActionButton
            variant="secondary"
            disabled={busy || !extendDaysValid}
            onClick={() => void submitExtendCompensation()}
          >
            {ko ? "연장" : "Extend"}
          </AdminActionButton>
          <AdminActionButton variant="quiet" disabled={busy} onClick={() => setExtendOpen(false)}>
            {ko ? "취소" : "Cancel"}
          </AdminActionButton>
        </div>
      ) : null}
      {endOpen ? (
        <div
          className="w-full space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-[13px]"
          data-admin-feed-end-form="1"
        >
          <p className="font-semibold">{ko ? "귀책 (필수)" : "Fault (required)"}</p>
          {(
            [
              ["operator", ko ? "운영 사유 — 남은 노출 기간만큼 포인트 비례 환급" : "Operator — prorated refund"],
              ["member", ko ? "회원 사유 — 환급 없음" : "Member — no refund"],
              ["none", ko ? "해당 없음 — 환급 없음" : "None — no refund"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-start gap-2">
              <input
                type="radio"
                name="feed-end-fault"
                checked={endFault === value}
                disabled={busy}
                onChange={() => setEndFault(value)}
                className="mt-0.5"
              />
              <span>{label}</span>
            </label>
          ))}
          {endFault && !endPreview ? (
            <p className="text-sam-muted">{ko ? "환급 예정 포인트를 계산하는 중…" : "Calculating refund…"}</p>
          ) : null}
          {endPreviewReady && endPreview && !("error" in endPreview) ? (
            <p className="font-semibold" data-admin-feed-end-preview="1">
              {ko ? "환급 예정" : "Refund"} {formatAdminNumber(endPreview.refundPoints)} P
            </p>
          ) : null}
          {endPreview && "error" in endPreview ? (
            <p className="text-sam-danger">{adminOperatorErrorMessage(endPreview.error, ko)}</p>
          ) : null}
          <div className="flex gap-2">
            <AdminActionButton
              variant="danger"
              data-testid="admin-feed-req-detail-end-submit"
              disabled={busy || !endPreviewReady}
              onClick={() => void submitEnd()}
            >
              {ko ? "종료 진행" : "Continue"}
            </AdminActionButton>
            <AdminActionButton variant="quiet" disabled={busy} onClick={() => setEndOpen(false)}>
              {ko ? "취소" : "Cancel"}
            </AdminActionButton>
          </div>
        </div>
      ) : null}
      <AdminActionButton variant="secondary" onClick={close}>
        {en ? "Close" : "닫기"}
      </AdminActionButton>
    </div>
  );

  return (
    <AdminFormSheet
      title={title}
      subtitle={`${domainProductLabel} · ${statusLabel}`}
      onClose={close}
      footer={footer}
    >
      {/* 재감사 S-1: 원문 코드 대신 한국어 안내 (수용량 가득 등) */}
      {err ? <p className="mb-3 sam-text-helper text-sam-warning">{adminOperatorErrorMessage(err, ko)}</p> : null}

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
          {safeT("admin_feed_req_pixel")}
        </p>
        {primary?.imageUrl && !previewBroken && !creativeUnreachable ? (
          <FeedAdFramePreview
            density={r.domain === "community" ? "community" : "trade"}
            imageUrl={primary.imageUrl}
            headline={primary.headline}
            alt={primary.altText}
            advertiserName={r.memberNickname || undefined}
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
                  : safeT("admin_feed_req_replace_image")}
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
            <dd>{r.memberLabel || formatAdminShortIdEllipsis(r.userId)}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{ko ? "회원/매장" : "Member"}</dt>
            <dd>{ko ? `회원 ${formatAdminShortId(r.userId)}` : `Member ${formatAdminShortId(r.userId)}`}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{ko ? "결제" : "Payment"}</dt>
            <dd>
              {formatAdminNumber(r.pointCost)}P · {r.durationDays}
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
          {data.campaign ? (
            <div>
              <dt className="text-sam-muted">{ko ? "노출 · 클릭" : "Views · clicks"}</dt>
              <dd className="tabular-nums" data-feed-ad-request-counts="1">
                {formatAdminNumber(data.campaign.impressionCount ?? 0)} · {formatAdminNumber(data.campaign.clickCount ?? 0)}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-sam-muted">{ko ? "신청일" : "Requested at"}</dt>
            <dd>{formatAdminManilaDateTime(r.createdAt)}</dd>
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
        <AdminTechInfo
          rows={[
            { label: "ID", id: r.id },
            { label: "creativeAuthority", value: data.creativeAuthority },
          ]}
        />
      </section>

      {/* 보완 §7: 피드 신청 상세 감사 이력 — 조치마다 1행(공개 사유·귀책·환급) */}
      <AdminFeedAdAuditHistory items={auditItems} lang={en ? "en" : "ko"} />
    </AdminFormSheet>
  );
}
