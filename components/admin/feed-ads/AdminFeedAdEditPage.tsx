"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  adminIsoToManilaInput,
  adminManilaInputToIso,
} from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import type { FeedAdCampaignView, FeedAdDestinationType } from "@/lib/ads/feed-ad-placement";
import { feedAdErrorMessageKo } from "@/lib/ads/feed-ad-error-copy";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { FeedAdStoreDestinationPicker } from "@/components/admin/feed-ads/FeedAdStoreDestinationPicker";

const DEST_TYPE_LABEL_KO: Record<FeedAdDestinationType, string> = {
  internal_page: "앱 화면",
  trade_listing: "거래 글",
  community_post: "커뮤니티 글",
  store: "매장",
  external_url: "외부 주소",
};

type SlideDraft = { sortOrder: number; imageUrl: string; altText: string; headline: string };

const INPUT = "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg disabled:bg-sam-app disabled:text-sam-muted";
const LABEL = "mb-1 block sam-text-body font-medium text-sam-fg";
/** DS-3 · C-1: 「없음」 선택지 없음 — 목적지 필수 */
const DEST_TYPES: FeedAdDestinationType[] = [
  "internal_page",
  "trade_listing",
  "community_post",
  "store",
  "external_url",
];

/**
 * 피드 배너 수정 (감사 AD-10 · Owner J-8) — `PATCH /api/admin/feed-ads/[campaignId]`.
 * 회원 신청(유료) 배너는 소재만 고칠 수 있고, 기간은 보상 연장으로만 바꾼다. 종료된 배너는 수정하지 않는다.
 */
export function AdminFeedAdEditPage({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const { language, t } = useI18n();
  const ko = language !== "en";
  const [campaign, setCampaign] = useState<FeedAdCampaignView | null>(null);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** IA-04 (K-2): 피드 배너 수정(PATCH·업로드) = ads 키 (접근표 action — API 403 과 같은 판정) */
  const feedAdAction = useAdminRouteAction("/admin/feed-ads");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [destinationType, setDestinationType] = useState<FeedAdDestinationType>("internal_page");
  const [destinationId, setDestinationId] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [slides, setSlides] = useState<SlideDraft[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/feed-ads/${encodeURIComponent(campaignId)}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; campaign?: FeedAdCampaignView; error?: string };
      if (!res.ok || !j.ok || !j.campaign) {
        setLoadError({ code: j.error ?? "load_failed", status: res.status });
        return;
      }
      const c = j.campaign;
      setCampaign(c);
      setName(c.name);
      setPriority(c.priority);
      setStartLocal(adminIsoToManilaInput(c.startAt));
      setEndLocal(adminIsoToManilaInput(c.endAt));
      setDestinationType(c.destinationType);
      setDestinationId(c.destinationId);
      setDestinationUrl(c.destinationUrl);
      setSlides(
        [1, 2, 3].map((n) => {
          const s = c.slides.find((x) => x.sortOrder === n);
          return { sortOrder: n, imageUrl: s?.imageUrl ?? "", altText: s?.altText ?? "", headline: s?.headline ?? "" };
        })
      );
    } catch {
      setLoadError({ code: "network_error" });
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadSlideImage = async (sortOrder: number, file: File | undefined) => {
    if (!file) return;
    setUploading(sortOrder);
    setSaveError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/feed-ads/upload", { method: "POST", body: fd, credentials: "include" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok || !j.ok || !j.url) {
        // FA-3: 비율·최소 크기 거부는 서버의 한국어 문구로 (코드값 노출 없음)
        setSaveError(j.message ?? (ko ? feedAdErrorMessageKo(j.error ?? "upload_failed") : "Could not upload the image."));
        return;
      }
      setSlides((list) => list.map((s) => (s.sortOrder === sortOrder ? { ...s, imageUrl: j.url as string } : s)));
    } finally {
      setUploading(null);
    }
  };

  if (loading) return <AdminLoadingState ko={ko} />;
  if (loadError || !campaign) {
    return <AdminErrorState ko={ko} code={loadError?.code ?? "not_found"} httpStatus={loadError?.status} onRetry={() => void load()} />;
  }

  const memberRequested = campaign.source === "MEMBER_REQUESTED";
  const ended = campaign.status === "ended";
  const campaignLocked = memberRequested || ended;

  const save = async () => {
    const c = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_feed_ads_save_feed_banner"),
      description: t("admin_feed_ads_changes_apply_customer_app_right"),
      confirmLabel: t("common_save"),
    });
    if (!c.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = { slides };
      if (!campaignLocked) {
        body.name = name;
        body.priority = priority;
        body.startAt = adminManilaInputToIso(startLocal, campaign.startAt) ?? null;
        body.endAt = adminManilaInputToIso(endLocal, campaign.endAt) ?? null;
        body.destinationType = destinationType;
        body.destinationId = destinationId;
        body.destinationUrl = destinationUrl;
      }
      const res = await fetch(`/api/admin/feed-ads/${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !j.ok) {
        // FB-A10 · DS-2 · DS-3: 한국어 안내 (영어 코드값을 화면에 보이지 않음)
        setSaveError(j.message ?? (ko ? feedAdErrorMessageKo(j.error) : "Could not save."));
        return;
      }
      router.push("/admin/advertising/banners");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title={t("admin_feed_ads_edit_feed_banner")}
        description={
          ended
            ? t("admin_feed_ads_ended_banners_cannot_edited_history")
            : memberRequested
              ? t("admin_feed_ads_member_requested_paid_banners_creative")
              : undefined
        }
        backHref="/admin/advertising/banners"
      />
      {saveError ? (
        <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-body text-sam-danger" role="alert">
          {t("admin_feed_ads_could_not_save_save_error", { saveError })}
        </p>
      ) : null}
      {/* D-25 (2026-11-04): 노출 숫자 = 소재별 노출 합 (이미지를 바꿔 새 소재가 생겨도 합계는 이어진다 · FB-A15) */}
      <AdminCard title={t("admin_feed_ads_performance")}>
        <p className="sam-text-body text-sam-fg" data-feed-ad-performance="">
          {t("admin_feed_ads_impressions")}{" "}
          <span className="font-semibold tabular-nums">{formatAdminNumber(campaign.impressionCount ?? 0)}</span>
          {" · "}
          {t("admin_feed_ads_clicks")}{" "}
          <span className="font-semibold tabular-nums">{formatAdminNumber(campaign.clickCount ?? 0)}</span>
        </p>
        <p className="mt-1 sam-text-helper text-sam-muted" data-feed-ad-impression-note="">
          {t("admin_feed_ads_sum_across_creatives_includes_earlier")}
        </p>
      </AdminCard>
      <AdminCard title={t("admin_feed_ads_basics")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL}>{t("admin_feed_ads_col_name")}</label>
            <input className={INPUT} value={name} disabled={campaignLocked} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>{t("admin_feed_ads_candidate_priority")}</label>
            <input
              type="number"
              className={INPUT}
              value={priority}
              disabled={campaignLocked}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
            />
            {/* 재감사 S-1 (F-2): 실제 동작 그대로 — 노출 순서는 잠금 계약대로 공정 회전(해시·1시간 단위·반복 방지).
                이 값은 진행 중 후보가 50개를 넘을 때 먼저 남길 순서에만 쓰인다(`listEligibleFeedAdCampaigns`). */}
            <p className="mt-1 sam-text-helper text-sam-muted">
              {t("admin_feed_ads_display_order_rotates_fairly_among")}
            </p>
          </div>
          <div />
          <div>
            <label className={LABEL}>{t("admin_ads_start_pht")}</label>
            <input type="datetime-local" className={INPUT} value={startLocal} disabled={campaignLocked} onChange={(e) => setStartLocal(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>{t("admin_ads_end_pht")}</label>
            <input type="datetime-local" className={INPUT} value={endLocal} disabled={campaignLocked} onChange={(e) => setEndLocal(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>{t("admin_feed_ads_destination_type")}</label>
            <select
              className={INPUT}
              value={destinationType}
              disabled={campaignLocked}
              onChange={(e) => setDestinationType(e.target.value as FeedAdDestinationType)}
            >
              {DEST_TYPES.map((d) => (
                <option key={d} value={d}>
                  {ko ? DEST_TYPE_LABEL_KO[d] : d}
                </option>
              ))}
            </select>
            <p className="mt-1 sam-text-helper text-sam-muted">
              {t("admin_feed_ads_destination_required")}
            </p>
          </div>
          <div>
            <label className={LABEL}>{destinationType === "store" ? (t("common_store")) : t("admin_feed_ads_destination_id")}</label>
            {destinationType === "store" ? (
              /* DS-2: 매장은 선택기로 고르고 slug 로 저장 */
              <FeedAdStoreDestinationPicker value={destinationId} onChange={setDestinationId} disabled={campaignLocked} />
            ) : (
              <input className={INPUT} value={destinationId} disabled={campaignLocked} onChange={(e) => setDestinationId(e.target.value)} />
            )}
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>{t("admin_feed_ads_destination_url")}</label>
            <input className={INPUT} value={destinationUrl} disabled={campaignLocked} onChange={(e) => setDestinationUrl(e.target.value)} />
          </div>
        </div>
      </AdminCard>
      <AdminCard title={t("admin_feed_ads_creatives_up_3")}>
        <div className="space-y-4">
          {slides.map((s) => (
            <div key={s.sortOrder} className="grid gap-3 border-b border-sam-border pb-4 last:border-b-0 sm:grid-cols-[120px_1fr]">
              <div className="aspect-[2/1] w-full overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin creative preview
                  <img src={s.imageUrl} alt={s.altText} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="space-y-2">
                <input
                  className={INPUT}
                  value={s.imageUrl}
                  disabled={ended}
                  placeholder={t("admin_feed_ads_image_url_sort_order", { sortOrder: s.sortOrder })}
                  onChange={(e) =>
                    setSlides((list) => list.map((x) => (x.sortOrder === s.sortOrder ? { ...x, imageUrl: e.target.value } : x)))
                  }
                />
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    disabled={ended || uploading != null}
                    onChange={(e) => {
                      void uploadSlideImage(s.sortOrder, e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-flex h-8 items-center rounded-ui-rect border border-[var(--admin-console-border)] px-2.5 text-[13px] font-semibold text-[var(--admin-console-fg)] hover:bg-[var(--admin-console-hover)]">
                    {uploading === s.sortOrder ? (t("admin_feed_ads_uploading")) : t("admin_feed_ads_upload_image")}
                  </span>
                </label>
                <input
                  className={INPUT}
                  value={s.headline}
                  disabled={ended}
                  placeholder={t("admin_feed_ads_headline")}
                  onChange={(e) =>
                    setSlides((list) => list.map((x) => (x.sortOrder === s.sortOrder ? { ...x, headline: e.target.value } : x)))
                  }
                />
                <input
                  className={INPUT}
                  value={s.altText}
                  disabled={ended}
                  placeholder={t("admin_feed_ads_alt_text")}
                  onChange={(e) =>
                    setSlides((list) => list.map((x) => (x.sortOrder === s.sortOrder ? { ...x, altText: e.target.value } : x)))
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </AdminCard>
      <div className="flex justify-end gap-2">
        <AdminActionButton variant="secondary" onClick={() => router.push("/admin/advertising/banners")}>
          {t("common_cancel")}
        </AdminActionButton>
        {!feedAdAction.allowed && feedAdAction.reason ? (
          <span className="self-center text-[12px] text-sam-muted" data-admin-action-denied="1">
            {feedAdAction.reason}
          </span>
        ) : null}
        <AdminActionButton
          variant="primary"
          disabled={ended || saving || !feedAdAction.allowed}
          title={feedAdAction.reason ?? undefined}
          onClick={() => void save()}
        >
          {saving ? (t("common_saving")) : t("common_save")}
        </AdminActionButton>
      </div>
    </div>
  );
}
