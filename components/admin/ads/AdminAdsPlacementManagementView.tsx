"use client";

/**
 * CUT R5 — Placement inventory control board.
 * Feed pool N/3 · Delivery Slide 1–5 · Popup surfaces. No fake slots. No new writers.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
import { ADS_FEEDBACK } from "@/lib/admin/ads-exposure/action-feedback";
import { adsPlacementReorderConfirmCopy } from "@/lib/admin/ads-exposure/admin-mutation-confirm-copy";
import {
  ADS_PLACEMENT_OPS_HREF,
  feedPoolCreateBlockedCopy,
  type FeedPoolInventory,
  type PlacementInventoryModel,
  type PopupSurfaceInventory,
} from "@/lib/admin/ads-exposure/placement-inventory";
import type { HeroPlacementSlot } from "@/lib/admin/ads-exposure/hero-placement-slots";
import { Sam } from "@/lib/ui/sam-component-classes";

function creativeSpecLine(
  spec: { aspectLabel: string; pixelLabel: string; maxFileLabel: string | null },
  ko: boolean
): string {
  const parts = [spec.aspectLabel, spec.pixelLabel];
  if (spec.maxFileLabel) parts.push(spec.maxFileLabel);
  return ko ? `소재: ${parts.join(" · ")}` : `Creative: ${parts.join(" · ")}`;
}

function feedOperatingLabel(raw: string, ko: boolean): string {
  const st = raw.toLowerCase();
  if (st === "active") return ko ? "운영 중" : "Active";
  if (st === "scheduled") return ko ? "예약" : "Scheduled";
  if (st === "paused") return ko ? "일시중지" : "Paused";
  if (st === "ended") return ko ? "종료" : "Ended";
  if (st === "draft") return ko ? "초안" : "Draft";
  return raw;
}

function feedExposureLabel(hint: string | null, ko: boolean): string {
  if (hint === "pool_eligible") return ko ? "풀 노출 가능" : "Pool eligible";
  if (hint === "scheduled") return ko ? "예약" : "Scheduled";
  if (hint === "paused") return ko ? "비노출" : "Not exposing";
  return ko ? "—" : "—";
}

function FeedPoolCard({ pool, ko }: { pool: FeedPoolInventory; ko: boolean }) {
  const blocked = feedPoolCreateBlockedCopy(ko);
  const title = ko ? pool.humanTitleKo : pool.humanTitleEn;

  return (
    <article
      className="rounded-ui-rect border border-sam-border bg-sam-app p-3"
      data-feed-pool={pool.placementKey}
      data-feed-pool-status={pool.status}
      data-feed-fake-slot="0"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-sam-fg">{title}</p>
          <p className="text-[11px] font-mono text-sam-muted">{pool.placementKey}</p>
        </div>
        <div className="text-right text-[12px] text-sam-muted">
          <p>
            {ko ? "현재 사용" : "In use"}:{" "}
            <span className="font-semibold text-sam-fg">
              {pool.used} / {pool.capacity}
            </span>
          </p>
          <p>
            {ko ? "추가 가능" : "Available"}: {pool.remaining}
          </p>
          <p>
            {ko ? "상태" : "Status"}:{" "}
            {pool.status === "available"
              ? ko
                ? "등록 가능"
                : "Open"
              : ko
                ? "가득 참"
                : "Full"}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-sam-muted" data-placement-creative-spec="1">
        {creativeSpecLine(pool.creativeSpec, ko)}
      </p>

      {pool.campaigns.length === 0 ? (
        <p className="mt-3 text-[13px] text-sam-muted">
          {ko
            ? `현재 등록된 ${pool.domain === "community" ? "Community" : "거래"} 배너가 없습니다.`
            : `No ${pool.domain} banners registered here.`}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {pool.campaigns.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
              data-feed-pool-campaign={c.id}
            >
              {c.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin inventory thumb
                <img
                  src={c.thumbUrl}
                  alt=""
                  className="h-10 w-[7.5rem] shrink-0 rounded-ui-rect object-cover"
                />
              ) : (
                <span className="h-10 w-[7.5rem] shrink-0 rounded-ui-rect bg-sam-app" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-sam-fg">{c.title}</p>
                <p className="text-[11px] text-sam-muted">
                  {feedOperatingLabel(c.operatingStatus, ko)} ·{" "}
                  {feedExposureLabel(c.exposureHint, ko)}
                  {c.periodLabel ? ` · ${c.periodLabel}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                {c.previewHref ? (
                  <Link
                    href={c.previewHref}
                    className="rounded border border-sam-border px-2 py-1 text-[11px] text-sam-fg"
                    data-placement-preview="1"
                  >
                    {ko ? "미리보기" : "Preview"}
                  </Link>
                ) : null}
                <Link
                  href={c.operationsHref}
                  className="rounded border border-sam-border px-2 py-1 text-[11px] text-sam-fg"
                  data-placement-ops="1"
                >
                  {ko ? "노출 관리에서 보기" : "View in operations"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pool.status === "available" ? (
          <Link
            href={pool.createHref}
            className={Sam.btn.primary}
            data-placement-create={pool.domain}
            data-r2-canonical="1"
          >
            {ko ? pool.createLabelKo : pool.createLabelEn}
          </Link>
        ) : (
          <div
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px]"
            data-placement-create-blocked="1"
          >
            <p className="font-semibold text-sam-fg">{blocked.title}</p>
            <p className="text-sam-muted">{blocked.body}</p>
            {pool.used === pool.capacity ? (
              <p className="mt-1 text-sam-muted">
                {ko
                  ? `현재 ${pool.used} / ${pool.capacity} 사용 중입니다. 새 배너를 등록하려면 기존 캠페인이 종료되어야 합니다.`
                  : `Currently ${pool.used} / ${pool.capacity}. End an existing campaign to register a new one.`}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}

function PopupSurfaceCard({
  row,
  ko,
}: {
  row: PopupSurfaceInventory;
  ko: boolean;
}) {
  const title = ko ? row.humanTitleKo : row.humanTitleEn;
  return (
    <article
      className="rounded-ui-rect border border-sam-border bg-sam-app p-3"
      data-popup-surface={row.surfaceKey}
      data-popup-fake-slot="0"
      data-popup-has-winner={row.hasCurrentWinner ? "1" : "0"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-sam-fg">{title}</p>
          <p className="text-[11px] font-mono text-sam-muted">{row.surfaceKey}</p>
        </div>
        <p className="text-[12px] text-sam-muted">
          {ko ? "상태" : "Status"}:{" "}
          {row.hasCurrentWinner
            ? ko
              ? "현재 노출 있음"
              : "Currently exposing"
            : ko
              ? "현재 노출 없음"
              : "No current exposure"}
        </p>
      </div>

      <p className="mt-2 text-[11px] text-sam-muted" data-placement-creative-spec="1">
        {creativeSpecLine(row.creativeSpec, ko)}
      </p>

      <div className="mt-3 space-y-2 text-[13px]">
        <div>
          <p className="text-[11px] font-semibold text-sam-muted">
            {ko ? "현재 노출" : "Current"}
          </p>
          {row.currentWinner ? (
            <div className="mt-1 flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
              {row.currentWinner.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin inventory thumb
                <img
                  src={row.currentWinner.thumbUrl}
                  alt=""
                  className="h-12 w-[4.32rem] shrink-0 rounded-ui-rect object-cover"
                />
              ) : (
                <span className="h-12 w-[4.32rem] shrink-0 rounded-ui-rect bg-sam-app" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sam-fg">{row.currentWinner.title}</p>
                {row.currentWinner.periodLabel ? (
                  <p className="text-[11px] text-sam-muted">{row.currentWinner.periodLabel}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1">
                {row.currentWinner.previewHref ? (
                  <Link
                    href={row.currentWinner.previewHref}
                    className="rounded border border-sam-border px-2 py-1 text-[11px]"
                  >
                    {ko ? "미리보기" : "Preview"}
                  </Link>
                ) : null}
                <Link
                  href={row.currentWinner.operationsHref}
                  className="rounded border border-sam-border px-2 py-1 text-[11px]"
                >
                  {ko ? "노출 관리에서 보기" : "View in operations"}
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sam-muted">{ko ? "없음" : "None"}</p>
          )}
        </div>
        <p className="text-[12px] text-sam-muted">
          {ko ? "대기" : "Waiting"}:{" "}
          {ko ? row.waitingSummaryKo : row.waitingSummaryEn}
        </p>
      </div>

      <div className="mt-3">
        <Link
          href={row.createHref}
          className={Sam.btn.primary}
          data-placement-create="popup"
          data-r2-canonical="1"
        >
          {ko ? "Popup 등록" : "Register Popup"}
        </Link>
      </div>
    </article>
  );
}

export function AdminAdsPlacementManagementView() {
  const { language } = useI18n();
  const ko = language !== "en";
  const [inventory, setInventory] = useState<PlacementInventoryModel | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const reorderCopy = adsPlacementReorderConfirmCopy(ko);

  const load = useCallback(async () => {
    setErr("");
    const res = await fetch("/api/admin/advertising/placement-inventory", {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      inventory?: PlacementInventoryModel;
    };
    if (!res.ok || !json.ok || !json.inventory) {
      setErr(
        json.error ||
          (ko ? "광고 위치 정보를 불러오지 못했습니다." : "Could not load placement inventory.")
      );
      setInventory(null);
      setOrderedIds([]);
      return;
    }
    setInventory(json.inventory);
    setOrderedIds(
      json.inventory.hero.slots.flatMap((slot) => (slot.campaignId ? [slot.campaignId] : []))
    );
  }, [ko]);

  useEffect(() => {
    void load();
  }, [load]);

  const heroSlotsById = useMemo(() => {
    const map = new Map<string, HeroPlacementSlot>();
    for (const s of inventory?.hero.slots ?? []) {
      if (s.campaignId) map.set(s.campaignId, s);
    }
    return map;
  }, [inventory]);

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
      };
      if (!res.ok || !json.ok) {
        setErr(json.error || (ko ? ADS_FEEDBACK.saveFailed.ko : ADS_FEEDBACK.saveFailed.en));
        return;
      }
      setConfirmOpen(false);
      setMsg(ko ? ADS_FEEDBACK.orderSaved.ko : ADS_FEEDBACK.orderSaved.en);
      await load();
    } catch {
      setErr(ko ? ADS_FEEDBACK.saveFailed.ko : ADS_FEEDBACK.saveFailed.en);
    } finally {
      setBusy(false);
    }
  };

  const communityPools =
    inventory?.feedPools.filter((p) => p.domain === "community") ?? [];
  const tradePools = inventory?.feedPools.filter((p) => p.domain === "trade") ?? [];
  const hero = inventory?.hero;
  const cap = hero?.capacity ?? 5;

  return (
    <div className="space-y-5" data-admin-ads-placements="1" data-admin-ads-r5="1">
      <header className="space-y-1">
        <p className="text-[12px] text-sam-muted">
          <Link href="/admin/advertising" className="underline">
            {ko ? "광고 / 노출" : "Ads / Exposure"}
          </Link>
          {" › "}
          {ko ? "광고 위치" : "Placements"}
        </p>
        <h1 className="text-lg font-semibold text-sam-fg">
          {ko ? "광고 위치" : "Ad placements"}
        </h1>
        <p className="text-[13px] text-sam-muted">
          {ko
            ? "광고가 실제로 노출되는 위치와 현재 사용 상태를 관리합니다."
            : "Manage where ads actually appear and current inventory usage."}
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
        data-placement-domain="community"
      >
        <h2 className="text-[15px] font-bold text-sam-fg">Community</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {communityPools.map((pool) => (
            <FeedPoolCard key={pool.placementKey} pool={pool} ko={ko} />
          ))}
        </div>
      </section>

      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-placement-domain="trade"
      >
        <h2 className="text-[15px] font-bold text-sam-fg">{ko ? "거래" : "Trade"}</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {tradePools.map((pool) => (
            <FeedPoolCard key={pool.placementKey} pool={pool} ko={ko} />
          ))}
        </div>
      </section>

      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-placement-domain="delivery"
      >
        <h2 className="text-[15px] font-bold text-sam-fg">{ko ? "배달" : "Delivery"}</h2>
        {hero ? (
          <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[14px] font-semibold text-sam-fg">
                  {ko ? hero.humanTitleKo : hero.humanTitleEn}
                </p>
                <p className="text-[11px] font-mono text-sam-muted">{hero.placementKey}</p>
              </div>
              <p className="text-[12px] text-sam-muted">
                {ko ? "현재 사용" : "In use"}: {orderedIds.length} / {cap}
              </p>
            </div>
            <p className="mt-2 text-[11px] text-sam-muted" data-placement-creative-spec="1">
              {creativeSpecLine(hero.creativeSpec, ko)}
            </p>

            <ol className="mt-3 space-y-2" data-hero-slides="1" data-hero-slide-count={cap}>
              {Array.from({ length: cap }, (_, i) => {
                const id = orderedIds[i];
                const slot = id ? heroSlotsById.get(id) ?? null : null;
                const empty = !slot;
                return (
                  <li
                    key={`slot-${i}`}
                    className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                    data-hero-slide={i + 1}
                    data-hero-slot-empty={empty ? "1" : "0"}
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
                            className="h-12 w-[7.31rem] rounded-ui-rect object-cover"
                          />
                        ) : (
                          <span className="h-12 w-[7.31rem] rounded-ui-rect bg-sam-app" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-sam-fg">
                            {slot.campaignLabel}
                          </p>
                          <div className="mt-0.5 text-[11px] text-sam-muted">
                            <span>
                              {ko ? "운영" : "Lifecycle"}:{" "}
                              {slot.lifecycleLabel
                                ? ko
                                  ? slot.lifecycleLabel.ko
                                  : slot.lifecycleLabel.en
                                : "—"}
                            </span>
                            {slot.scheduleLabel ? ` · ${slot.scheduleLabel}` : ""}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            className="rounded border border-sam-border px-2 py-1 text-[11px]"
                            disabled={busy || i === 0}
                            onClick={() => move(i, -1)}
                            data-hero-reorder="1"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded border border-sam-border px-2 py-1 text-[11px]"
                            disabled={busy || i >= orderedIds.length - 1}
                            onClick={() => move(i, 1)}
                            data-hero-reorder="1"
                          >
                            ↓
                          </button>
                          <Link
                            href="/stores"
                            className="rounded border border-sam-border px-2 py-1 text-[11px]"
                            data-placement-preview="1"
                          >
                            {ko ? "미리보기" : "Preview"}
                          </Link>
                          <Link
                            href={ADS_PLACEMENT_OPS_HREF}
                            className="rounded border border-sam-border px-2 py-1 text-[11px]"
                            data-placement-ops="1"
                          >
                            {ko ? "노출 관리에서 보기" : "View in operations"}
                          </Link>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] text-sam-muted">
                          {ko ? "비어 있음" : "Empty"}
                        </span>
                        <Link
                          href={`${hero.createBaseHref}?slot=${i + 1}`}
                          className={Sam.btn.primary}
                          data-placement-create="delivery"
                          data-r2-canonical="1"
                          data-hero-empty-create={i + 1}
                        >
                          {ko ? "이 위치에 배너 등록" : "Register banner here"}
                        </Link>
                      </div>
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
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? "…" : ko ? "배너 순서 저장" : "Save banner order"}
            </button>
          </div>
        ) : null}
      </section>

      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-placement-domain="popup"
      >
        <h2 className="text-[15px] font-bold text-sam-fg">Popup</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {(inventory?.popupSurfaces ?? []).map((row) => (
            <PopupSurfaceCard key={row.surfaceKey} row={row} ko={ko} />
          ))}
        </div>
      </section>

      <AdminActionConfirmDialog
        open={confirmOpen}
        title={reorderCopy.title}
        description={reorderCopy.body}
        confirmLabel={reorderCopy.confirmLabel}
        cancelLabel={reorderCopy.cancelLabel}
        tone={reorderCopy.tone}
        pending={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void saveOrder()}
      />
    </div>
  );
}
