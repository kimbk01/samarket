"use client";

/**
 * CUT R5 — Placement inventory control board.
 * Feed pool N/3 · Delivery Slide 1–5 · Popup surfaces. No fake slots. No new writers.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ADMIN_DOMAIN_SCOPE_QUERY_KEY,
  normalizeAdminDomainScope,
  placementSectionVisible,
  popupSurfaceInDomainScope,
  writeAdminDomainScope,
  type AdminDomainScope,
} from "@/lib/admin/list-query/admin-domain-scope";
import { AdminDomainScopeSelect } from "@/components/admin/ui/AdminDomainScopeSelect";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
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
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";

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
  return ko ? "알 수 없는 상태" : "Unknown status";
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

      <p className="mt-2 text-[12px] text-sam-muted" data-placement-creative-spec="1">
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
          {pool.campaigns.map((c) => {
            const isEventPromo = c.ownershipKind === "event_promotion";
            const sourceBadge =
              c.ownershipKind === "event_promotion"
                ? ko
                  ? "이벤트 프로모션"
                  : "Event promotion"
                : c.ownershipKind === "admin_direct"
                  ? ko
                    ? "관리자 직접 광고"
                    : "Admin direct ad"
                  : ko
                    ? "유료 광고"
                    : "Paid ad";
            const primaryManageHref = isEventPromo && c.manageHref ? c.manageHref : c.operationsHref;
            const primaryManageLabel = isEventPromo
              ? ko
                ? "이벤트 노출 설정"
                : "Event exposure settings"
              : ko
                ? "노출 관리에서 보기"
                : "View in operations";
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
                data-feed-pool-campaign={c.id}
                data-placement-source={c.ownershipKind}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-sam-fg">{c.title}</p>
                    <span
                      className={
                        isEventPromo
                          ? "rounded-ui-rect bg-sam-primary-soft px-1.5 py-0.5 text-[12px] font-medium text-sam-primary"
                          : "rounded-ui-rect bg-sam-app px-1.5 py-0.5 text-[12px] font-medium text-sam-muted"
                      }
                      data-placement-source-badge="1"
                    >
                      {sourceBadge}
                    </span>
                  </div>
                  <p className="text-[12px] text-sam-muted">
                    {feedOperatingLabel(c.operatingStatus, ko)} ·{" "}
                    {feedExposureLabel(c.exposureHint, ko)}
                    {c.periodLabel ? ` · ${c.periodLabel}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.previewHref ? (
                    <AdminActionLink
                      href={c.previewHref}
                      variant="ghost"
                      size="sm"
                      data-placement-preview="1"
                    >
                      {ko ? "미리보기" : "Preview"}
                    </AdminActionLink>
                  ) : null}
                  <AdminActionLink
                    href={primaryManageHref}
                    variant="ghost"
                    size="sm"
                    data-placement-ops={isEventPromo ? "event-dist" : "1"}
                    data-placement-canonical-edit="1"
                  >
                    {primaryManageLabel}
                  </AdminActionLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {pool.status === "available" ? (
          <AdminActionLink
            href={pool.createHref}
            variant="secondary"
            size="sm"
            data-placement-create={pool.domain}
            data-r2-canonical="1"
          >
            {ko ? pool.createLabelKo : pool.createLabelEn}
          </AdminActionLink>
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
          <p className="text-[12px] font-mono text-sam-muted">{row.surfaceKey}</p>
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

      <p className="mt-2 text-[12px] text-sam-muted" data-placement-creative-spec="1">
        {creativeSpecLine(row.creativeSpec, ko)}
      </p>

      <div className="mt-3 space-y-2 text-[13px]">
        <div>
          <p className="text-[12px] font-semibold text-sam-muted">
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
                  <p className="text-[12px] text-sam-muted">{row.currentWinner.periodLabel}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1">
                {row.currentWinner.previewHref ? (
                  <AdminActionLink
                    href={row.currentWinner.previewHref}
                    variant="ghost"
                    size="sm"
                  >
                    {ko ? "미리보기" : "Preview"}
                  </AdminActionLink>
                ) : null}
                <AdminActionLink
                  href={row.currentWinner.operationsHref}
                  variant="ghost"
                  size="sm"
                >
                  {ko ? "노출 관리에서 보기" : "View in operations"}
                </AdminActionLink>
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
        <AdminActionLink
          href={row.createHref}
          variant="secondary"
          size="sm"
          data-placement-create="popup"
          data-r2-canonical="1"
        >
          {ko ? "Popup 등록" : "Register Popup"}
        </AdminActionLink>
      </div>
    </article>
  );
}

/** `useSearchParams`(G-06 `?domain=`) 때문에 Suspense 안에서 렌더한다. */
export function AdminAdsPlacementManagementView() {
  return (
    <Suspense fallback={<AdminLoadingState ko />}>
      <AdminAdsPlacementManagementViewInner />
    </Suspense>
  );
}

function AdminAdsPlacementManagementViewInner() {
  const { language, t } = useI18n();
  const ko = language !== "en";
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  /** G-06 — `?domain=delivery|trade|community` 이면 그 도메인 섹션 + 그 도메인 팝업 위치(+전체 노출)만. 기본 전체. */
  const domainScope = normalizeAdminDomainScope(searchParams?.get(ADMIN_DOMAIN_SCOPE_QUERY_KEY));
  const setDomainScope = useCallback(
    (next: AdminDomainScope | "") => {
      const qs = writeAdminDomainScope(searchParams?.toString() ?? "", next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );
  const [inventory, setInventory] = useState<PlacementInventoryModel | null>(null);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<
    { ok: true; message: string } | { ok: false; code: string } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const reorderCopy = adsPlacementReorderConfirmCopy(ko);

  const load = useCallback(async () => {
    setErr("");
    let res: Response;
    try {
      res = await fetch("/api/admin/advertising/placement-inventory", {
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // v4 UI-15 — 네트워크 예외도 오류 상태 + 다시 불러오기 (예전: 처리 안 된 예외로 빈 화면)
      setErr("network_error");
      setInventory(null);
      setOrderedIds([]);
      return;
    }
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      inventory?: PlacementInventoryModel;
    };
    if (!res.ok || !json.ok || !json.inventory) {
      setErr(json.error || "load_failed");
      setInventory(null);
      setOrderedIds([]);
      return;
    }
    setInventory(json.inventory);
    setOrderedIds(
      json.inventory.hero.slots.flatMap((slot) => (slot.campaignId ? [slot.campaignId] : []))
    );
  }, []);

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
    setResult(null);
    const restoreOrder = () =>
      setOrderedIds(
        inventory?.hero.slots.flatMap((slot) => (slot.campaignId ? [slot.campaignId] : [])) ?? []
      );
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
        setResult({ ok: false, code: json.error || "save_failed" });
        restoreOrder();
        return;
      }
      setResult({ ok: true, message: ko ? ADS_FEEDBACK.orderSaved.ko : ADS_FEEDBACK.orderSaved.en });
      await load();
    } catch {
      setResult({ ok: false, code: "save_failed" });
      restoreOrder();
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
          {t("admin_menu_ads_authority_placements_inventory")}
        </p>
        <h1 className="text-[20px] font-semibold text-sam-fg" data-admin-placements-title="1">
          {t("admin_menu_ads_authority_placements_inventory")}
        </h1>
        <p className="text-[13px] text-sam-muted" data-admin-placements-purpose="1">
          {ko
            ? "광고와 인라인 프로모션이 실제로 사용하는 노출 위치와 현재 사용 현황을 확인합니다. 이벤트 배너 편집은 프로모션 / 이벤트에서 합니다."
            : "Inspect placements and current usage for paid ads and inline promotions. Edit event banners under Promotion / Events."}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3" role="search" data-admin-placements-domain-filter="1">
        <AdminDomainScopeSelect ko={ko} value={domainScope} onChange={setDomainScope} />
      </div>

      <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
      {err ? (
        <AdminErrorState ko={ko} code={err} onRetry={() => void load()} />
      ) : !inventory ? (
        <AdminLoadingState ko={ko} />
      ) : null}

      {placementSectionVisible("community", domainScope) ? (
      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-placement-domain="community"
      >
        <h2 className="text-[16px] font-bold text-sam-fg">Community</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {communityPools.map((pool) => (
            <FeedPoolCard key={pool.placementKey} pool={pool} ko={ko} />
          ))}
        </div>
      </section>

      ) : null}

      {placementSectionVisible("trade", domainScope) ? (
      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-placement-domain="trade"
      >
        <h2 className="text-[16px] font-bold text-sam-fg">{ko ? "거래" : "Trade"}</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {tradePools.map((pool) => (
            <FeedPoolCard key={pool.placementKey} pool={pool} ko={ko} />
          ))}
        </div>
      </section>

      ) : null}

      {placementSectionVisible("delivery", domainScope) ? (
      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-placement-domain="delivery"
      >
        <h2 className="text-[16px] font-bold text-sam-fg">{ko ? "배달" : "Delivery"}</h2>
        {hero ? (
          <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-app p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[14px] font-semibold text-sam-fg">
                  {ko ? hero.humanTitleKo : hero.humanTitleEn}
                </p>
                <p className="text-[12px] font-mono text-sam-muted">{hero.placementKey}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12px] text-sam-muted">
                  {ko ? "현재 사용" : "In use"}: {orderedIds.length} / {cap}
                </p>
                {/* 슬라이드 행마다 같던 링크 — 행 버튼은 순서 이동 2개만 두고 카드에 한 번만 (R7 버튼 배치). */}
                <AdminActionLink href="/stores" variant="secondary" size="sm" data-placement-preview="1">
                  {ko ? "미리보기" : "Preview"}
                </AdminActionLink>
                <AdminActionLink href={ADS_PLACEMENT_OPS_HREF} variant="secondary" size="sm" data-placement-ops="1">
                  {ko ? "노출 관리에서 보기" : "View in operations"}
                </AdminActionLink>
                {/* G-16 — 자사(DIBAY) 배너 생성 화면 진입 (빈 슬라이드가 없어도 보이는 카드 단위 진입점) */}
                <AdminActionLink
                  href={DELIVERY_AD_ADMIN_ROUTES.firstPartyNew}
                  variant="primary"
                  size="sm"
                  data-placement-first-party-create="1"
                >
                  {ko ? "자사 배너 등록" : "Register DIBAY banner"}
                </AdminActionLink>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-sam-muted" data-placement-creative-spec="1">
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
                      {ko ? `슬라이드 ${i + 1}` : `Slide ${i + 1}`}
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
                          <div className="mt-0.5 text-[12px] text-sam-muted">
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
                          <AdminActionButton
                            variant="ghost"
                            size="sm"
                            aria-label={ko ? "위로 이동" : "Move up"}
                            disabled={busy || i === 0}
                            onClick={() => move(i, -1)}
                            data-hero-reorder="1"
                          >
                            ↑
                          </AdminActionButton>
                          <AdminActionButton
                            variant="ghost"
                            size="sm"
                            aria-label={ko ? "아래로 이동" : "Move down"}
                            disabled={busy || i >= orderedIds.length - 1}
                            onClick={() => move(i, 1)}
                            data-hero-reorder="1"
                          >
                            ↓
                          </AdminActionButton>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] text-sam-muted">
                          {ko ? "비어 있음" : "Empty"}
                        </span>
                        <AdminActionLink
                          href={`${hero.createBaseHref}?slot=${i + 1}`}
                          variant="secondary"
                          size="sm"
                          data-placement-create="delivery"
                          data-r2-canonical="1"
                          data-hero-empty-create={i + 1}
                        >
                          {ko ? "이 위치에 배너 등록" : "Register banner here"}
                        </AdminActionLink>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            <AdminActionButton
              variant="primary"
              className="mt-3"
              disabled={busy || orderedIds.length === 0}
              data-hero-reorder-save="1"
              onClick={async () => {
                // 순서 저장 확인 — 단계는 동작 표(reorderCopy.level = save)
                const confirmed = await confirmAdminAction({
                  level: reorderCopy.level,
                  ko,
                  title: reorderCopy.title,
                  description: reorderCopy.body,
                  confirmLabel: reorderCopy.confirmLabel,
                  destructive: reorderCopy.tone === "danger",
                });
                if (confirmed.ok) void saveOrder();
              }}
            >
              {ko ? "배너 순서 저장" : "Save banner order"}
            </AdminActionButton>
          </div>
        ) : null}
      </section>
      ) : null}

      <section
        className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
        data-placement-domain="popup"
      >
        <h2 className="text-[16px] font-bold text-sam-fg">Popup</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {(inventory?.popupSurfaces ?? [])
            .filter((row) => popupSurfaceInDomainScope(row.surfaceKey, domainScope))
            .map((row) => (
            <PopupSurfaceCard key={row.surfaceKey} row={row} ko={ko} />
          ))}
        </div>
      </section>

    </div>
  );
}
