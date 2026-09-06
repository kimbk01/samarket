"use client";

/**
 * Canonical placement management — Domain → Screen → Placement.
 * HERO slides + reorder wired to POST /api/admin/advertising/reorder-hero-banners.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminAdvertisingAuthorityNav } from "@/components/admin/ads/AdminAdvertisingAuthorityNav";
import { fetchAdsControlPlane } from "@/lib/admin/ads-control-plane/fetch-ads-control-plane";
import type { AdsControlPlaneModel } from "@/lib/admin/ads-control-plane/types";
import { ADS_FEEDBACK } from "@/lib/admin/ads-exposure/action-feedback";
import { humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";
import { DELIVERY_HERO_CAPACITY } from "@/lib/admin/ads-exposure/capacity-gate";
import type { HeroPlacementSlot } from "@/lib/admin/ads-exposure/hero-placement-slots";
import { Sam } from "@/lib/ui/sam-component-classes";

export function AdminAdsPlacementManagementView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [model, setModel] = useState<AdsControlPlaneModel | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [heroSlots, setHeroSlots] = useState<HeroPlacementSlot[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setErr("");
    const [controlPlane, heroRes] = await Promise.all([
      fetchAdsControlPlane(),
      fetch("/api/admin/advertising/hero-placement-slots", {
        credentials: "include",
        cache: "no-store",
      }),
    ]);
    if (controlPlane.ok) {
      setModel(controlPlane.plane);
    } else {
      setErr(controlPlane.error);
    }
    const heroJson = (await heroRes.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      slots?: HeroPlacementSlot[];
    };
    if (!heroRes.ok || !heroJson.ok || !Array.isArray(heroJson.slots)) {
      setErr(heroJson.error || (ko ? "배너 위치를 불러오지 못했습니다." : "Could not load hero slots."));
      setHeroSlots([]);
      setOrderedIds([]);
      return;
    }
    setHeroSlots(heroJson.slots);
    setOrderedIds(
      heroJson.slots.flatMap((slot) => (slot.campaignId ? [slot.campaignId] : []))
    );
  }, [ko]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...orderedIds];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    setOrderedIds(next);
  };

  const saveOrder = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/admin/advertising/reorder-hero-banners", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderedCampaignIds: orderedIds }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.ok) {
        setErr(json.error || (ko ? ADS_FEEDBACK.saveFailed.ko : ADS_FEEDBACK.saveFailed.en));
        return;
      }
      setMsg(ko ? ADS_FEEDBACK.orderSaved.ko : ADS_FEEDBACK.orderSaved.en);
      await load();
    } catch {
      setErr(ko ? ADS_FEEDBACK.saveFailed.ko : ADS_FEEDBACK.saveFailed.en);
    } finally {
      setBusy(false);
    }
  };

  const occupied = orderedIds.length;
  const cap = DELIVERY_HERO_CAPACITY;

  return (
    <div className="space-y-5" data-admin-ads-placements="1">
      <AdminAdvertisingAuthorityNav />
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            {ko ? "광고 / 노출" : "Ads / Exposure"}
          </Link>
          {" › "}
          {ko ? "광고 위치 관리" : "Placements"}
        </p>
        <h1 className="text-lg font-semibold text-sam-fg">
          {ko ? "광고 위치 관리" : "Ad placement management"}
        </h1>
        <p className="text-[13px] text-sam-muted">
          {ko
            ? "도메인 → 화면 → 위치. 홈 상단 배너 순서는 고객 캐러셀과 동일합니다."
            : "Domain → screen → placement. Hero order matches the customer carousel."}
        </p>
      </header>

      {err ? (
        <p className="text-sm text-sam-danger" role="alert">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="text-sm text-sam-success" role="status">
          {msg}
        </p>
      ) : null}

      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-placement-domain="delivery"
      >
        <h2 className="text-[15px] font-bold text-sam-fg">{ko ? "배달" : "Delivery"}</h2>
        <div className="mt-3 space-y-4">
          <div data-placement-screen="home">
            <h3 className="text-[13px] font-semibold text-sam-fg">{ko ? "홈" : "Home"}</h3>
            <div className="mt-2 rounded-ui-rect border border-sam-border bg-sam-app p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-sam-fg">
                    {humanPlacementLabel("STORES_HOME_HERO", ko)}
                  </p>
                  <p className="text-[12px] text-sam-muted">
                    {ko
                      ? `현재 예약/점유: ${occupied} / ${cap}`
                      : `Booked / occupied: ${occupied} / ${cap}`}
                  </p>
                </div>
                <Link href="/admin/delivery-ads/inventory#placement-map" className="text-[12px] underline">
                  {ko ? "전체 지면 지도" : "Full placement map"}
                </Link>
              </div>

              <ol className="mt-3 space-y-2" data-hero-slides="1">
                {Array.from({ length: cap }, (_, i) => {
                  const id = orderedIds[i];
                  const slot = id ? heroSlots.find((s) => s.campaignId === id) : null;
                  return (
                    <li
                      key={`slot-${i}`}
                      className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                      data-hero-slide={i + 1}
                      data-hero-slot-empty={slot ? "0" : "1"}
                    >
                      <span className="w-16 shrink-0 text-[12px] font-semibold text-sam-muted">
                        Slide {i + 1}
                      </span>
                      {slot ? (
                        <>
                          {slot.creativeThumbUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- admin authority thumbnail
                            <img
                              src={slot.creativeThumbUrl}
                              alt=""
                              className="h-12 w-20 rounded-ui-rect object-cover"
                            />
                          ) : (
                            <span className="h-12 w-20 rounded-ui-rect bg-sam-app" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-sam-fg">
                              {slot.campaignLabel}
                            </p>
                            <div className="mt-0.5 grid gap-x-3 text-[11px] text-sam-muted sm:grid-cols-2">
                              <span>
                                {ko ? "신청/소스" : "Applicant/source"}: {slot.applicantOrSource || "—"}
                              </span>
                              <span>
                                {ko ? "상태" : "Lifecycle"}:{" "}
                                {slot.lifecycleLabel
                                  ? ko
                                    ? slot.lifecycleLabel.ko
                                    : slot.lifecycleLabel.en
                                  : "—"}
                              </span>
                              <span>{slot.scheduleLabel || "—"}</span>
                              <span>sort_order: {slot.sortOrder ?? "—"}</span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="rounded border border-sam-border px-2 py-1 text-[11px]"
                              disabled={busy || i === 0}
                              onClick={() => move(i, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="rounded border border-sam-border px-2 py-1 text-[11px]"
                              disabled={busy || i >= orderedIds.length - 1}
                              onClick={() => move(i, 1)}
                            >
                              ↓
                            </button>
                            {slot.href ? (
                              <Link
                                href={slot.href}
                                className="rounded border border-sam-border px-2 py-1 text-[11px]"
                              >
                                {ko ? "관리" : "Manage"}
                              </Link>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <span className="text-[12px] text-sam-muted">
                          {ko ? "빈 위치" : "Vacant"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>

              <button
                type="button"
                className={`${Sam.btn.primary} mt-3`}
                disabled={busy || orderedIds.length === 0}
                data-hero-reorder-save="1"
                onClick={() => void saveOrder()}
              >
                {busy
                  ? "…"
                  : ko
                    ? "배너 순서 저장"
                    : "Save banner order"}
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2" data-placement-other="1">
            {(
              [
                ["STORES_HOME_INLINE_1", ko ? "홈 · 중간 배너" : "Home · Inline"],
                ["STORES_CATEGORY_TOP", ko ? "업종 · 상단 배너" : "Category · Top"],
                ["STORES_HOME_FEED", ko ? "홈 · 매장 상위홍보" : "Home · Store promote"],
                ["STORES_CATEGORY_FEED", ko ? "업종 · 매장 상위홍보" : "Category · Store promote"],
              ] as const
            ).map(([key, fallback]) => {
              const occ = model?.occupancy?.find((o) => o.placementKey === key);
              return (
                <div
                  key={key}
                  className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2"
                >
                  <p className="text-[13px] font-medium text-sam-fg">
                    {humanPlacementLabel(key, ko) || fallback}
                  </p>
                  <p className="text-[11px] text-sam-muted">
                    {occ
                      ? ko
                        ? `${occ.liveCount} / ${occ.capacity}`
                        : `${occ.liveCount} / ${occ.capacity}`
                      : ko
                        ? "점유 정보 없음"
                        : "No occupancy"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h2 className="text-[15px] font-bold text-sam-fg">{ko ? "거래 · 커뮤니티 · 팝업" : "Trade · Community · Popup"}</h2>
        <p className="mt-1 text-[13px] text-sam-muted">
          {ko
            ? "피드 배너·상위노출·팝업 위치는 각 상품 상세와 지면 지도를 사용합니다."
            : "Feed banners, promote, and popups use product details and the placement map."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/delivery-ads/inventory#placement-map" className={Sam.btn.secondary}>
            {ko ? "지면 지도" : "Placement map"}
          </Link>
          <Link href="/admin/platform-popup" className={Sam.btn.secondary}>
            {ko ? "팝업 운영" : "Popup ops"}
          </Link>
          <Link href="/admin/feed-ads" className={Sam.btn.secondary}>
            {ko ? "피드 배너" : "Feed banners"}
          </Link>
        </div>
      </section>
    </div>
  );
}
