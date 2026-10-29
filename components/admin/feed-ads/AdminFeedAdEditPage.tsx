"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  adminIsoToManilaInput,
  adminManilaInputToIso,
} from "@/lib/admin/operator-ux/admin-manila-datetime-input";
import type { FeedAdCampaignView, FeedAdDestinationType } from "@/lib/ads/feed-ad-placement";

type SlideDraft = { sortOrder: number; imageUrl: string; altText: string; headline: string };

const INPUT = "w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg disabled:bg-sam-app disabled:text-sam-muted";
const LABEL = "mb-1 block sam-text-body font-medium text-sam-fg";
const DEST_TYPES: Array<FeedAdDestinationType | "none"> = [
  "none",
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
  const { language } = useI18n();
  const ko = language !== "en";
  const [campaign, setCampaign] = useState<FeedAdCampaignView | null>(null);
  const [loadError, setLoadError] = useState<{ code: string; status?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [priority, setPriority] = useState(100);
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [destinationType, setDestinationType] = useState<FeedAdDestinationType | "none">("none");
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
      const hasDest = Boolean(c.destinationId || c.destinationUrl);
      setDestinationType(hasDest ? c.destinationType : "none");
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
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !j.ok || !j.url) {
        setSaveError(j.error ?? "upload_failed");
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
      title: ko ? "피드 배너 수정 저장" : "Save feed banner",
      description: ko ? "저장하면 고객 화면에 바로 반영됩니다." : "Changes apply to the customer app right away.",
      confirmLabel: ko ? "저장" : "Save",
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
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setSaveError(j.error ?? "save_failed");
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
        title={ko ? "피드 배너 수정" : "Edit feed banner"}
        description={
          ended
            ? ko
              ? "종료된 배너는 수정할 수 없습니다 (게시 이력 보존)."
              : "Ended banners cannot be edited (history preserved)."
            : memberRequested
              ? ko
                ? "회원이 신청한 유료 배너는 소재만 고칠 수 있습니다. 기간은 보상 연장으로 바꿉니다."
                : "Member-requested paid banners: creative only. Change the period via compensation extension."
              : undefined
        }
        backHref="/admin/advertising/banners"
      />
      {saveError ? (
        <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 sam-text-body text-sam-danger" role="alert">
          {ko ? "저장하지 못했습니다" : "Could not save"} ({saveError})
        </p>
      ) : null}
      <AdminCard title={ko ? "기본 정보" : "Basics"}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL}>{ko ? "이름" : "Name"}</label>
            <input className={INPUT} value={name} disabled={campaignLocked} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>{ko ? "우선순위 (작을수록 먼저)" : "Priority (lower first)"}</label>
            <input
              type="number"
              className={INPUT}
              value={priority}
              disabled={campaignLocked}
              onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div />
          <div>
            <label className={LABEL}>{ko ? "시작 (PHT)" : "Start (PHT)"}</label>
            <input type="datetime-local" className={INPUT} value={startLocal} disabled={campaignLocked} onChange={(e) => setStartLocal(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>{ko ? "종료 (PHT)" : "End (PHT)"}</label>
            <input type="datetime-local" className={INPUT} value={endLocal} disabled={campaignLocked} onChange={(e) => setEndLocal(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>{ko ? "목적지 유형" : "Destination type"}</label>
            <select
              className={INPUT}
              value={destinationType}
              disabled={campaignLocked}
              onChange={(e) => setDestinationType(e.target.value as FeedAdDestinationType | "none")}
            >
              {DEST_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d === "none" ? (ko ? "없음" : "None") : d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>{ko ? "목적지 ID" : "Destination ID"}</label>
            <input className={INPUT} value={destinationId} disabled={campaignLocked} onChange={(e) => setDestinationId(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>{ko ? "목적지 URL" : "Destination URL"}</label>
            <input className={INPUT} value={destinationUrl} disabled={campaignLocked} onChange={(e) => setDestinationUrl(e.target.value)} />
          </div>
        </div>
      </AdminCard>
      <AdminCard title={ko ? "소재 (최대 3장)" : "Creatives (up to 3)"}>
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
                  placeholder={ko ? `이미지 URL (${s.sortOrder}번)` : `Image URL (#${s.sortOrder})`}
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
                    {uploading === s.sortOrder ? (ko ? "올리는 중…" : "Uploading…") : ko ? "이미지 파일 올리기" : "Upload image"}
                  </span>
                </label>
                <input
                  className={INPUT}
                  value={s.headline}
                  disabled={ended}
                  placeholder={ko ? "제목" : "Headline"}
                  onChange={(e) =>
                    setSlides((list) => list.map((x) => (x.sortOrder === s.sortOrder ? { ...x, headline: e.target.value } : x)))
                  }
                />
                <input
                  className={INPUT}
                  value={s.altText}
                  disabled={ended}
                  placeholder={ko ? "대체 텍스트" : "Alt text"}
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
          {ko ? "취소" : "Cancel"}
        </AdminActionButton>
        <AdminActionButton variant="primary" disabled={ended || saving} onClick={() => void save()}>
          {saving ? (ko ? "저장 중…" : "Saving…") : ko ? "저장" : "Save"}
        </AdminActionButton>
      </div>
    </div>
  );
}
