"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { FeedAdDomain, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import {
  OWNER_BANNER_INVENTORY_KEYS,
  type OwnerBannerInventoryKey,
} from "@/lib/stores/advertising/owner-banner-contract";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { Sam } from "@/lib/ui/sam-component-classes";

type DirectProduct = "delivery" | "feed" | "popup";
type PublishMode = "live" | "scheduled";

const FEED_PLACEMENTS: Record<FeedAdDomain, FeedAdPlacement[]> = {
  trade: ["TRADE_HOME", "TRADE_CATEGORY"],
  community: ["COMMUNITY_HOME", "COMMUNITY_TOPIC"],
};

export function AdminAdsDirectRegisterHub() {
  const { language } = useI18n();
  const ko = language !== "en";
  const router = useRouter();
  const [product, setProduct] = useState<DirectProduct>("delivery");
  const [feedDomain, setFeedDomain] = useState<FeedAdDomain>("trade");
  const [deliveryPlacement, setDeliveryPlacement] =
    useState<OwnerBannerInventoryKey>("STORES_HOME_HERO");
  const [feedPlacement, setFeedPlacement] = useState<FeedAdPlacement>("TRADE_HOME");
  const [popupSurface, setPopupSurface] = useState("GLOBAL");
  const [targetId, setTargetId] = useState("");
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [subcopy, setSubcopy] = useState("");
  const [cta, setCta] = useState("/stores");
  const [imageUrl, setImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [popupFile, setPopupFile] = useState<File | null>(null);
  const [sourceWidth, setSourceWidth] = useState(0);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [publishMode, setPublishMode] = useState<PublishMode>("scheduled");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const domainLabel =
    product === "delivery" ? "delivery" : product === "feed" ? feedDomain : "popup";
  const placementLabel =
    product === "delivery"
      ? deliveryPlacement
      : product === "feed"
        ? feedPlacement
        : popupSurface;
  const needsTarget =
    product === "feed" &&
    (feedPlacement === "TRADE_CATEGORY" || feedPlacement === "COMMUNITY_TOPIC");

  const schedule = useMemo(() => {
    const start = publishMode === "live" ? new Date() : startAt ? new Date(startAt) : null;
    const end = endAt ? new Date(endAt) : null;
    return {
      start,
      end,
      valid:
        start !== null &&
        end !== null &&
        Number.isFinite(start.getTime()) &&
        Number.isFinite(end.getTime()) &&
        end.getTime() > start.getTime(),
    };
  }, [endAt, publishMode, startAt]);

  const resetCreative = () => {
    setImageUrl("");
    setPreviewUrl("");
    setPopupFile(null);
    setSourceWidth(0);
    setSourceHeight(0);
  };

  const uploadCreative = async (file: File) => {
    setError("");
    if (product === "popup") {
      setPopupFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      return;
    }
    const endpoint =
      product === "delivery"
        ? "/api/admin/delivery-ads/upload-banner-image"
        : "/api/admin/feed-ads/upload";
    const fd = new FormData();
    fd.set("file", file);
    if (product === "delivery") fd.set("inventoryKey", deliveryPlacement);
    const res = await fetch(endpoint, { method: "POST", credentials: "include", body: fd });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      url?: string;
      width?: number;
      height?: number;
      error?: string;
    };
    if (!res.ok || !json.ok || !json.url) {
      setError(json.error || (ko ? "이미지를 업로드하지 못했습니다." : "Image upload failed."));
      return;
    }
    setImageUrl(json.url);
    setPreviewUrl(URL.createObjectURL(file));
    setSourceWidth(Number(json.width ?? 0));
    setSourceHeight(Number(json.height ?? 0));
  };

  const submit = async () => {
    setError("");
    if (!name.trim() || !headline.trim()) {
      setError(ko ? "광고 이름과 헤드라인을 입력하세요." : "Enter a name and headline.");
      return;
    }
    if (!schedule.valid) {
      setError(ko ? "시작·종료 기간을 확인하세요." : "Check the start and end schedule.");
      return;
    }
    if ((product === "popup" && !popupFile) || (product !== "popup" && !imageUrl)) {
      setError(ko ? "이미지를 업로드하세요." : "Upload an image.");
      return;
    }
    if (needsTarget && !targetId.trim()) {
      setError(ko ? "대상 식별자를 입력하세요." : "Enter the target identifier.");
      return;
    }

    setBusy(true);
    try {
      const startIso = schedule.start!.toISOString();
      const endIso = schedule.end!.toISOString();
      if (product === "delivery") {
        const res = await fetch("/api/admin/delivery-ads/first-party", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product: "banner",
            inventoryKey: deliveryPlacement,
            startAt: startIso,
            endAt: endIso,
            assetPath: imageUrl,
            sourceWidth,
            sourceHeight,
            title: name,
            headline,
            subcopy,
            ctaHref: cta,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          campaignId?: string;
          detailHref?: string;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.campaignId) throw new Error(json.error || "create_failed");
        router.push(json.detailHref || DELIVERY_AD_ADMIN_ROUTES.detail(json.campaignId));
        return;
      }

      if (product === "feed") {
        const res = await fetch("/api/admin/feed-ads", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            domain: feedDomain,
            placement: feedPlacement,
            targetCategoryId: feedPlacement === "TRADE_CATEGORY" ? targetId : undefined,
            targetTopicSlug: feedPlacement === "COMMUNITY_TOPIC" ? targetId : undefined,
            status: publishMode === "live" ? "active" : "draft",
            startAt: startIso,
            endAt: endIso,
            destinationType: "internal_page",
            destinationUrl: cta,
            slides: [{ sortOrder: 1, imageUrl, altText: headline, headline }],
          }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error || "create_failed");
        router.push("/admin/feed-ads");
        return;
      }

      const createRes = await fetch("/api/admin/platform-popup-campaigns", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, surfaces: [popupSurface], priority: 100 }),
      });
      const created = (await createRes.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        error?: string;
      };
      if (!createRes.ok || !created.ok || !created.id) {
        throw new Error(created.error || "create_failed");
      }
      const patchRes = await fetch(`/api/admin/platform-popup-campaigns/${created.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: startIso,
          endAt: endIso,
          ctaType: "internal_page",
          ctaTarget: cta,
          surfaces: [popupSurface],
          materialTouched: ["schedule", "cta", "surfaces"],
        }),
      });
      if (!patchRes.ok) {
        const json = (await patchRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "schedule_update_failed");
      }
      const fd = new FormData();
      fd.set("file", popupFile!);
      fd.set("altText", headline);
      fd.set("applyCrop", "center");
      const creativeRes = await fetch(
        `/api/admin/platform-popup-campaigns/${created.id}/creative`,
        { method: "POST", credentials: "include", body: fd }
      );
      if (!creativeRes.ok) {
        const json = (await creativeRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "creative_upload_failed");
      }
      router.push(`/admin/platform-popup/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "create_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-admin-ads-direct-flow="UNIFIED_7_STEP">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            {ko ? "광고 / 노출" : "Ads / Exposure"}
          </Link>
          {" › "}
          {ko ? "관리자 직접 등록" : "Admin direct"}
        </p>
        <h1 className="text-lg font-semibold text-sam-fg">
          {ko ? "광고 통합 등록" : "Unified ad registration"}
        </h1>
      </header>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-direct-step="1">
        <h2 className="font-semibold">{ko ? "1. 상품" : "1. Product"}</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          {(["delivery", "feed", "popup"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`rounded-ui-rect border px-3 py-2 ${product === value ? "border-sam-primary bg-sam-primary/5" : "border-sam-border"}`}
              onClick={() => {
                setProduct(value);
                resetCreative();
              }}
            >
              {value === "delivery" ? (ko ? "배달 배너" : "Delivery banner") : value === "feed" ? (ko ? "피드 배너" : "Feed banner") : ko ? "팝업" : "Popup"}
            </button>
          ))}
          <button type="button" disabled className="rounded-ui-rect border border-sam-border px-3 py-2 opacity-50" data-admin-direct-store-promote-blocked="1">
            {ko ? "매장 상위홍보 · 차단" : "Store promote · BLOCKED"}
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-direct-step="2">
        <h2 className="font-semibold">{ko ? "2. 도메인" : "2. Domain"}</h2>
        {product === "feed" ? (
          <select
            className="w-full rounded-ui-rect border border-sam-border px-3 py-2"
            value={feedDomain}
            onChange={(event) => {
              const next = event.target.value as FeedAdDomain;
              setFeedDomain(next);
              setFeedPlacement(FEED_PLACEMENTS[next][0]);
            }}
          >
            <option value="trade">trade</option>
            <option value="community">community</option>
          </select>
        ) : (
          <p className="text-sm text-sam-muted">{domainLabel}</p>
        )}
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-direct-step="3">
        <h2 className="font-semibold">{ko ? "3. 화면 / 위치" : "3. Screen / placement"}</h2>
        {product === "delivery" ? (
          <select className="w-full rounded-ui-rect border border-sam-border px-3 py-2" value={deliveryPlacement} onChange={(event) => { setDeliveryPlacement(event.target.value as OwnerBannerInventoryKey); resetCreative(); }}>
            {OWNER_BANNER_INVENTORY_KEYS.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        ) : product === "feed" ? (
          <div className="space-y-2">
            <select className="w-full rounded-ui-rect border border-sam-border px-3 py-2" value={feedPlacement} onChange={(event) => setFeedPlacement(event.target.value as FeedAdPlacement)}>
              {FEED_PLACEMENTS[feedDomain].map((key) => <option key={key} value={key}>{key}</option>)}
            </select>
            {needsTarget ? <input className="w-full rounded-ui-rect border border-sam-border px-3 py-2" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder={feedPlacement === "TRADE_CATEGORY" ? "category id" : "topic slug"} /> : null}
          </div>
        ) : (
          <select className="w-full rounded-ui-rect border border-sam-border px-3 py-2" value={popupSurface} onChange={(event) => setPopupSurface(event.target.value)}>
            {["GLOBAL", "DELIVERY", "TRADE", "COMMUNITY", "MYPAGE"].map((surface) => <option key={surface} value={surface}>{surface}</option>)}
          </select>
        )}
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-direct-step="4">
        <h2 className="font-semibold">{ko ? "4. 소재" : "4. Creative"}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded-ui-rect border border-sam-border px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} placeholder={ko ? "광고 이름" : "Campaign name"} />
          <input className="rounded-ui-rect border border-sam-border px-3 py-2" value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder={ko ? "헤드라인" : "Headline"} />
          <input className="rounded-ui-rect border border-sam-border px-3 py-2" value={subcopy} onChange={(event) => setSubcopy(event.target.value)} placeholder={ko ? "서브카피" : "Subcopy"} />
          <input className="rounded-ui-rect border border-sam-border px-3 py-2" value={cta} onChange={(event) => setCta(event.target.value)} placeholder="/path" />
        </div>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCreative(file); event.target.value = ""; }} />
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-direct-step="5">
        <h2 className="font-semibold">{ko ? "5. 기간" : "5. Period"}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input type="datetime-local" disabled={publishMode === "live"} className="rounded-ui-rect border border-sam-border px-3 py-2 disabled:opacity-50" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
          <input type="datetime-local" className="rounded-ui-rect border border-sam-border px-3 py-2" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
        </div>
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-direct-step="6">
        <h2 className="font-semibold">{ko ? "6. 미리보기" : "6. Preview"}</h2>
        <p className="text-sm text-sam-muted">{name || "—"} · {domainLabel} · {placementLabel} · {headline || "—"}</p>
        {previewUrl || imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin upload preview
          <img src={previewUrl || imageUrl} alt="" className="max-h-52 w-full rounded-ui-rect object-cover" />
        ) : null}
      </section>

      <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4" data-admin-direct-step="7">
        <h2 className="font-semibold">{ko ? "7. 등록 방식" : "7. Action"}</h2>
        <div className="flex gap-2">
          <button type="button" className={`${publishMode === "live" ? Sam.btn.primary : Sam.btn.secondary}`} onClick={() => setPublishMode("live")}>{ko ? "즉시 노출" : "Go live"}</button>
          <button type="button" className={`${publishMode === "scheduled" ? Sam.btn.primary : Sam.btn.secondary}`} onClick={() => setPublishMode("scheduled")}>{ko ? "예약 등록" : "Schedule"}</button>
        </div>
        {product === "popup" ? <p className="text-xs text-sam-muted">{ko ? "팝업은 초안·소재·일정을 여기서 저장한 뒤 상세에서 승인/게시를 완료합니다." : "Popup saves draft, creative, and schedule here; approve/publish from detail."}</p> : null}
        {error ? <p role="alert" className="text-sm text-sam-danger">{error}</p> : null}
        <button type="button" disabled={busy} className={Sam.btn.primary} onClick={() => void submit()}>{busy ? "…" : ko ? "등록 완료" : "Complete registration"}</button>
      </section>
    </div>
  );
}
