"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Plus } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { AdminPostAdRow, MePostAdsMeta } from "@/lib/ads/types";
import { postAdStatusLabel, postAdTypeLabel } from "@/lib/ads/post-ad-label-keys";
import {
  classifyMyAdTab,
  classifyMyPostAdTab,
  consumeMyAdsReturnToPending,
  markMyAdsReturnToPending,
  MY_AD_TAB_VALUES,
  type MyAdTab,
} from "@/lib/ads/my-ad-tab";
import { CurrencyAmount } from "@/components/currency";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { MobileConfirmBottomSheet } from "@/components/ui/MobileConfirmBottomSheet";
import { useMypageTabParam } from "@/lib/mypage/use-mypage-tab-param";
import { useMypageSubmitGuard } from "@/lib/mypage/use-mypage-submit-guard";
import { showMypageToast } from "@/lib/mypage/mypage-toast";
import { formatMypageDate } from "@/lib/mypage/format-mypage-date";
import { invalidateMypageSummary } from "@/lib/mypage/mypage-home-summary-client";
import { feedAdMemberViewHref } from "@/lib/ads/feed-ad-destination";
import {
  formatFeedAdRemaining,
  formatFeedAdWindowLabel,
  type FeedAdMemberDisplayStatus,
} from "@/lib/ads/feed-ad-member-presentation";
import { feedAdOpsStatusLabel } from "@/lib/ads/feed-ad-ops-presentation";
import { isFeedAdDisplayStatusBlockingNewCreate } from "@/lib/ads/feed-ad-member-limit";
import { feedAdPlacementHumanLabel, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import type { FeedAdProduct } from "@/lib/ads/feed-ad-products";
import { DibayActionSheet, DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

type FeedRequestRow = {
  id: string;
  status: string;
  displayStatus?: FeedAdMemberDisplayStatus;
  eligible?: boolean;
  remainingMs?: number | null;
  domain: string;
  placement: string;
  pointCost: number;
  durationDays: number;
  productId?: string;
  targetCategoryId?: string | null;
  targetTopicSlug?: string | null;
  reviewReason?: string | null;
  campaignId?: string | null;
  createdAt: string;
  startAt?: string | null;
  endAt?: string | null;
  creatives?: { sortOrder: number; imageUrl: string; headline: string }[];
};

/**
 * Member Revenue Hub — Paid Exposure + Feed Ad Request.
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md §4
 */
/** 행 공통 — 종류 뱃지 */
function AdKindBadge({ kind, label }: { kind: "promo" | "banner"; label: string }) {
  return (
    <span
      data-my-ad-kind={kind}
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 sam-text-xxs font-bold ${
        kind === "banner" ? "bg-sam-info-soft text-sam-info" : "bg-sam-pressed-surface text-sam-primary"
      }`}
    >
      {label}
    </span>
  );
}

/** S46 스켈레톤 — 탭 + 행 4(종류 뱃지 + 2줄 + 우측 상태) */
function MyAdsSkeleton() {
  const bone = "rounded-ui-rect bg-sam-border-soft/70 motion-safe:animate-pulse";
  return (
    <ul aria-busy="true" data-testid="my-ads-skeleton" className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          data-skeleton-row=""
          className="flex items-center gap-3 rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-3"
        >
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="h-4 w-14 rounded-full bg-sam-border-soft/70 motion-safe:animate-pulse" />
            <span className={`h-3.5 w-[60%] ${bone}`} />
            <span className={`h-3 w-[40%] ${bone}`} />
          </span>
          <span className={`h-3.5 w-12 shrink-0 ${bone}`} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Member Revenue Hub — 내 광고 (S46).
 * 헤더 [광고 신청] → 종류 시트 · 탭 [진행중·대기·종료](개수) · 행(종류 뱃지 · 제목/대상 · 기간 · 상태).
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md §4 (1회원 1배너 규칙·심사 흐름 불변)
 */
export default function MyAdsPageClient() {
  const { t, safeT, language } = useI18n();
  const en = language === "en";
  const router = useRouter();
  const [ads, setAds] = useState<AdminPostAdRow[]>([]);
  const [meta, setMeta] = useState<MePostAdsMeta | null>(null);
  const [feedRequests, setFeedRequests] = useState<FeedRequestRow[]>([]);
  const [canCreateBanner, setCanCreateBanner] = useState(true);
  const [loading, setLoading] = useState(true);
  /** 401 외 실패 — 빈 목록으로 표시하지 않는다(오류+재시도) */
  const [loadFailed, setLoadFailed] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [renewTarget, setRenewTarget] = useState<FeedRequestRow | null>(null);
  const [renewCatalog, setRenewCatalog] = useState<FeedAdProduct[]>([]);
  const [renewProductId, setRenewProductId] = useState("");
  const [renewBusy, setRenewBusy] = useState(false);
  const [kindSheetOpen, setKindSheetOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ kind: "banner" | "promo"; id: string } | null>(null);
  const cancelGuard = useMypageSubmitGuard();
  const [tab, setTab] = useMypageTabParam<MyAdTab>({ values: MY_AD_TAB_VALUES, defaultValue: "active" });

  /** 신청 화면 다녀오면 [대기] 탭 선택 */
  useEffect(() => {
    if (consumeMyAdsReturnToPending()) setTab("pending");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 1회
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setAuthHint(null);
    try {
      const [postPack, feedPack] = await Promise.all([
        runSingleFlight("me:post-ads:get", async () => {
          const res = await fetch("/api/me/post-ads", {
            credentials: "include",
            cache: "no-store",
          });
          const body = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            ads?: AdminPostAdRow[];
            meta?: MePostAdsMeta;
          };
          return { status: res.status, body };
        }),
        runSingleFlight("me:feed-ad-requests:get", async () => {
          const res = await fetch("/api/me/feed-ad-requests", {
            credentials: "include",
            cache: "no-store",
          });
          const body = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            requests?: FeedRequestRow[];
            canCreateBanner?: boolean;
            currentBanner?: { requestId?: string; displayStatus?: string } | null;
          };
          return { status: res.status, body };
        }),
      ]);

      if (postPack.status === 401 || feedPack.status === 401) {
        setAuthHint(t("ads_auth_hint"));
        setAds([]);
        setMeta(null);
        setFeedRequests([]);
        setCanCreateBanner(true);
        setLoadFailed(false);
        return;
      }
      const postOk = postPack.body.ok === true && Array.isArray(postPack.body.ads);
      const feedOk = feedPack.status === 200 && Array.isArray(feedPack.body.requests);
      if (!postOk || !feedOk) {
        if (!opts?.silent) setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      setAds(postPack.body.ads!);
      setMeta(postPack.body.meta ?? null);
      const requests = feedPack.body.requests!;
      setFeedRequests(requests);
      if (typeof feedPack.body.canCreateBanner === "boolean") {
        setCanCreateBanner(feedPack.body.canCreateBanner);
      } else {
        const blocked = requests.some((r) =>
          isFeedAdDisplayStatusBlockingNewCreate(r.displayStatus ?? r.status)
        );
        setCanCreateBanner(!blocked);
      }
    } catch {
      if (!opts?.silent) setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 대기 배너 신청 취소 — 확인 시트(danger)에서 확인한 뒤에만 PATCH */
  const cancelRequest = async (id: string) => {
    setCancelBusyId(id);
    setActionErr("");
    try {
      const res = await fetch(`/api/me/feed-ad-requests/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        const msg =
          j.error === "not_pending"
            ? safeT("feed_ad_cancel_not_pending", {
                fallbackKo: "이미 처리된 신청입니다.",
                fallbackEn: "This request is no longer pending.",
              })
            : safeT("feed_ad_cancel_failed", {
                fallbackKo: "신청 취소에 실패했습니다.",
                fallbackEn: "Could not cancel the request.",
              });
        setActionErr(msg);
        showMypageToast(msg, "error");
        return;
      }
      showMypageToast(t("mypage_oa_ad_cancelled"), "success");
      invalidateMypageSummary();
      await load({ silent: true });
    } catch {
      showMypageToast(t("mypage_comp_network_error"), "error");
    } finally {
      setCancelBusyId(null);
    }
  };

  /** 포인트 홍보 신청 취소(대기 단계) — 확인 시트 뒤에만 */
  const cancelPostAd = async (id: string) => {
    setCancelBusyId(id);
    setActionErr("");
    try {
      const res = await fetch(`/api/me/post-ads/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        const msg =
          j.error === "not_cancellable" ? t("mypage_oa_ad_not_cancellable") : t("mypage_oa_ad_cancel_failed");
        setActionErr(msg);
        showMypageToast(msg, "error");
        return;
      }
      showMypageToast(t("mypage_oa_ad_cancelled"), "success");
      invalidateMypageSummary();
      await load({ silent: true });
    } catch {
      showMypageToast(t("mypage_comp_network_error"), "error");
    } finally {
      setCancelBusyId(null);
    }
  };
  const statusLabel = (displayOrRaw: string) =>
    feedAdOpsStatusLabel(displayOrRaw, language === "en" ? "en" : "ko");

  const openRenew = async (row: FeedRequestRow) => {
    setActionErr("");
    setRenewTarget(row);
    const res = await fetch(`/api/me/feed-ad-requests?domain=${row.domain}`, {
      credentials: "include",
    });
    const j = (await res.json().catch(() => ({}))) as { catalog?: FeedAdProduct[] };
    const items = (j.catalog ?? []).filter((p) => p.domain === row.domain);
    setRenewCatalog(items);
    setRenewProductId(items[0]?.id ?? "");
  };

  const submitRenew = async () => {
    if (!renewTarget?.campaignId || !renewProductId || renewBusy) return;
    setRenewBusy(true);
    setActionErr("");
    try {
      const idem =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `renew-${Date.now()}`;
      const res = await fetch(`/api/me/feed-ad-campaigns/${renewTarget.campaignId}/renew`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify({
          productId: renewProductId,
          idempotencyKey: idem,
          creativeOrDestinationChanged: false,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        if (j.error === "insufficient_balance") {
          setActionErr(t("points_ui_insufficient"));
        } else if (j.error === "re_review_required") {
          setActionErr(
            safeT("feed_ad_renew_rereview", {
              fallbackKo: "이미지·연결을 바꾸려면 새 광고 신청이 필요합니다.",
              fallbackEn: "To change creative or destination, submit a new ad request.",
            })
          );
        } else {
          setActionErr(
            safeT("feed_ad_renew_failed", {
              fallbackKo: "연장에 실패했습니다.",
              fallbackEn: "Renewal failed.",
            })
          );
        }
        return;
      }
      setRenewTarget(null);
      showMypageToast(t("mypage_oa_ad_renewed"), "success");
      await load({ silent: true });
    } finally {
      setRenewBusy(false);
    }
  };

  const fmtDate = (iso: string | null | undefined) => formatMypageDate(iso, { lang: language }) || null;

  type AdRow =
    | { kind: "banner"; id: string; createdAt: string; tab: MyAdTab; row: FeedRequestRow }
    | { kind: "promo"; id: string; createdAt: string; tab: MyAdTab; row: AdminPostAdRow };

  /** 두 목록을 같은 3분류로 묶고 최신순 */
  const allRows = useMemo<AdRow[]>(() => {
    const out: AdRow[] = [
      ...feedRequests.map((r) => ({
        kind: "banner" as const,
        id: r.id,
        createdAt: r.createdAt,
        tab: classifyMyAdTab(r.displayStatus ?? r.status),
        row: r,
      })),
      ...ads.map((a) => ({
        kind: "promo" as const,
        id: a.id,
        createdAt: a.createdAt,
        tab: classifyMyPostAdTab(a.applyStatus),
        row: a,
      })),
    ];
    return out.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime());
  }, [ads, feedRequests]);

  const tabCounts = useMemo(() => {
    const c: Record<MyAdTab, number> = { active: 0, pending: 0, ended: 0 };
    for (const r of allRows) c[r.tab] += 1;
    return c;
  }, [allRows]);
  const visibleRows = allRows.filter((r) => r.tab === tab);

  const tabLabel = (id: MyAdTab) =>
    id === "active" ? t("mypage_oa_ads_tab_active") : id === "pending" ? t("mypage_oa_ads_tab_pending") : t("mypage_oa_ads_tab_ended");

  const openApply = (href: string) => {
    markMyAdsReturnToPending();
    router.push(href);
  };

  const applyButton = (
    <button
      type="button"
      data-testid="my-ads-apply-open"
      onClick={() => setKindSheetOpen(true)}
      className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-3 sam-text-body-secondary font-semibold text-sam-primary active:bg-sam-pressed-surface"
    >
      <Plus className="h-4 w-4" aria-hidden />
      {t("mypage_oa_ads_apply_cta")}
    </button>
  );


  return (
    <div className="flex-1 bg-sam-app">
      <MySubpageHeader
        title={safeT("revenue_hub_title", {
          fallbackKo: "내 홍보 / 광고",
          fallbackEn: "My promotions / ads",
        })}
        subtitle={safeT("revenue_hub_subtitle", {
          fallbackKo: "게시물 상위 노출과 피드 배너 광고를 관리합니다.",
          fallbackEn: "Manage post exposure and feed banner ads.",
        })}
        backHref="/mypage"
        rightSlot={applyButton}
      />
      <div className={`${MYPAGE_BODY_COLUMN_CLASS} space-y-3 py-4`}>
        {authHint ? (
          <p className="rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-3 py-2 sam-text-body-secondary text-sam-fg">
            {t("auth_resource_access_denied")}
          </p>
        ) : null}

        <div className="flex border-b border-sam-border" role="tablist" data-testid="my-ads-tabs">
          {MY_AD_TAB_VALUES.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              data-my-ads-tab={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-3 sam-text-body-secondary font-semibold transition-colors ${
                tab === id ? "border-b-[3px] border-sam-primary text-sam-primary" : "text-sam-muted hover:text-sam-fg"
              }`}
            >
              {tabLabel(id)}
              {!loading && !loadFailed ? <span className="ml-1 tabular-nums">{tabCounts[id]}</span> : null}
            </button>
          ))}
        </div>

        {meta?.source === "missing_table" || meta?.source === "unavailable" ? (
          <p className="rounded-ui-rect border border-sam-warning-soft bg-sam-warning-soft px-3 py-2 sam-text-xxs text-sam-fg">
            {t("ui_ad_post_db_unavailable")}
          </p>
        ) : null}
        {actionErr ? <p className="sam-text-helper text-sam-warning">{actionErr}</p> : null}

        <section id="feed-ad-status" className="space-y-2">
          {loading ? (
            <MyAdsSkeleton />
          ) : loadFailed ? (
            <MyStateView
              kind="error"
              error={{ message: t("mypage_oa_ads_load_failed"), onRetry: () => void load() }}
            />
          ) : visibleRows.length === 0 ? (
            <MyStateView
              kind="empty"
              empty={{
                icon: <Megaphone className="h-6 w-6" aria-hidden />,
                title: t(
                  tab === "active"
                    ? "mypage_oa_ads_empty_active"
                    : tab === "pending"
                      ? "mypage_oa_ads_empty_pending"
                      : "mypage_oa_ads_empty_ended"
                ),
                cta: (
                  <button
                    type="button"
                    className="sam-btn sam-btn--primary sam-btn--sm"
                    onClick={() => setKindSheetOpen(true)}
                  >
                    {t("mypage_oa_ads_apply_cta")}
                  </button>
                ),
              }}
            />
          ) : (
            <ul className="space-y-2">
              {visibleRows.map((item) => {
                if (item.kind === "promo") {
                  const a = item.row;
                  const cancellable = ["draft", "pending_payment", "pending_review"].includes(a.applyStatus);
                  return (
                    <li
                      key={`promo-${a.id}`}
                      data-testid="revenue-hub-post-ad"
                      data-status={a.applyStatus}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <AdKindBadge kind="promo" label={t("mypage_oa_ads_kind_promo")} />
                          <p className="mt-1 truncate sam-text-body font-medium text-sam-fg">{a.postTitle}</p>
                          <p className="mt-0.5 sam-text-helper text-sam-muted">
                            {a.adProductName} · {postAdTypeLabel(t, a.adType)} ·{" "}
                            <CurrencyAmount currency="point" amount={a.pointCost} compactPoint className="font-medium" />
                          </p>
                          {a.startAt || a.endAt ? (
                            <p className="sam-text-helper text-sam-muted">
                              {fmtDate(a.startAt) ?? "—"} → {fmtDate(a.endAt) ?? "—"}
                            </p>
                          ) : (
                            <p className="sam-text-helper text-sam-muted">
                              {safeT("revenue_hub_applied_at", { fallbackKo: "신청일", fallbackEn: "Applied" })}
                              {": "}
                              {fmtDate(a.createdAt) ?? "—"}
                            </p>
                          )}
                          {a.adminNote ? (
                            <p className="mt-1 rounded-ui-rect bg-sam-app px-2 py-1.5 sam-text-helper text-sam-muted">
                              {a.adminNote}
                            </p>
                          ) : null}
                        </div>
                        <span className="shrink-0 sam-text-helper text-sam-muted" data-testid="revenue-hub-post-ad-status">
                          {postAdStatusLabel(t, a.applyStatus)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Link
                          href={`/community/post/${encodeURIComponent(a.postId)}`}
                          className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border px-3 sam-text-helper"
                        >
                          {t("mypage_oa_ads_view_post")}
                        </Link>
                        {cancellable ? (
                          <button
                            type="button"
                            data-testid={`post-ad-cancel-${a.id}`}
                            disabled={cancelBusyId === a.id}
                            className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border px-3 sam-text-helper text-sam-danger disabled:opacity-50"
                            onClick={() => setCancelTarget({ kind: "promo", id: a.id })}
                          >
                            {cancelBusyId === a.id ? t("common_loading") : t("points_ui_cancel_request")}
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                }
                const r = item.row;
                const thumb = r.creatives?.[0]?.imageUrl ?? "";
                const viewHref = feedAdMemberViewHref({
                  placement: r.placement,
                  targetCategoryId: r.targetCategoryId,
                  targetTopicSlug: r.targetTopicSlug,
                });
                const display = r.displayStatus ?? r.status;
                const windowLabel = formatFeedAdWindowLabel(r.startAt, r.endAt, en ? "en" : "ko");
                const remaining = formatFeedAdRemaining(r.remainingMs, en ? "en" : "ko");
                const canRenew = Boolean(r.campaignId) && (display === "active" || display === "ended");
                return (
                  <li
                    key={`banner-${r.id}`}
                    data-testid="revenue-hub-feed-ad-request"
                    data-status={display}
                    data-eligible={r.eligible ? "1" : "0"}
                    className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5"
                  >
                    <div className="flex gap-3">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element -- persisted storage URL
                        <img
                          src={thumb}
                          alt=""
                          className="h-14 w-24 shrink-0 rounded-ui-rect object-cover"
                          data-testid="revenue-hub-feed-ad-thumb"
                        />
                      ) : (
                        <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-ui-rect bg-sam-app sam-text-helper text-sam-muted">
                          —
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <AdKindBadge kind="banner" label={t("mypage_oa_ads_kind_banner")} />
                          <span data-testid="revenue-hub-feed-ad-status" className="shrink-0 sam-text-helper text-sam-muted">
                            {statusLabel(display)}
                          </span>
                        </div>
                        <p className="mt-1 truncate sam-text-body font-medium text-sam-fg">
                          {feedAdPlacementHumanLabel(r.placement as FeedAdPlacement, en ? "en" : "ko")}
                        </p>
                        {(display === "active" || display === "scheduled") && (
                          <a
                            href={
                              r.placement === "COMMUNITY_TOPIC" && r.targetTopicSlug
                                ? `/philife?category=${encodeURIComponent(r.targetTopicSlug)}`
                                : r.domain === "trade"
                                  ? "/market"
                                  : "/philife"
                            }
                            className="mt-1 inline-block sam-text-helper font-medium text-sam-primary underline"
                            data-testid="revenue-hub-feed-ad-surface-link"
                          >
                            {safeT("revenue_hub_feed_surface_cta", {
                              fallbackKo: "게재 위치 보기",
                              fallbackEn: "View placement",
                            })}
                          </a>
                        )}
                        <p className="mt-0.5 sam-text-helper text-sam-muted">
                          {safeT("revenue_hub_applied_at", { fallbackKo: "신청일", fallbackEn: "Applied" })}
                          {": "}
                          {fmtDate(r.createdAt) ?? "—"}
                          {" · "}
                          <CurrencyAmount currency="point" amount={r.pointCost} compactPoint className="font-medium" />
                        </p>
                        {(r.startAt || r.endAt) && (
                          <p className="sam-text-helper text-sam-muted" data-testid="revenue-hub-feed-ad-window">
                            {windowLabel.startLabel} → {windowLabel.endLabel}
                          </p>
                        )}
                        {remaining ? (
                          <p className="sam-text-helper text-sam-muted" data-testid="revenue-hub-feed-ad-remaining">
                            {remaining}
                          </p>
                        ) : null}
                        {r.status === "rejected" && r.reviewReason ? (
                          <p className="mt-1 sam-text-helper text-sam-warning" data-testid="revenue-hub-feed-ad-reject-reason">
                            {r.reviewReason}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.status === "pending_review" ? (
                        <button
                          type="button"
                          data-testid={`feed-ad-cancel-${r.id}`}
                          disabled={cancelBusyId === r.id}
                          className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border px-3 sam-text-helper text-sam-danger disabled:opacity-50"
                          onClick={() => setCancelTarget({ kind: "banner", id: r.id })}
                        >
                          {cancelBusyId === r.id
                            ? t("common_loading")
                            : safeT("feed_ad_cancel_cta", { fallbackKo: "신청 취소", fallbackEn: "Cancel request" })}
                        </button>
                      ) : null}
                      {(r.status === "rejected" || display === "ended" || display === "cancelled") && canCreateBanner ? (
                        <button
                          type="button"
                          onClick={() => openApply("/mypage/ads/feed-request")}
                          className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-border px-3 sam-text-helper"
                        >
                          {safeT("feed_ad_recreate_cta", { fallbackKo: "다시 광고 만들기", fallbackEn: "Create again" })}
                        </button>
                      ) : null}
                      {display === "active" ? (
                        <Link
                          href={viewHref}
                          data-testid={`feed-ad-view-${r.id}`}
                          className="inline-flex min-h-[36px] items-center rounded-ui-rect bg-signature px-3 sam-text-helper font-medium text-sam-on-primary"
                        >
                          {safeT("feed_ad_view_cta", { fallbackKo: "광고 보기", fallbackEn: "View ad" })}
                        </Link>
                      ) : null}
                      {canRenew ? (
                        <button
                          type="button"
                          data-testid={`feed-ad-renew-${r.id}`}
                          className="inline-flex min-h-[36px] items-center rounded-ui-rect border border-sam-primary bg-sam-pressed-surface px-3 sam-text-helper font-medium text-sam-primary"
                          onClick={() => void openRenew(r)}
                        >
                          {safeT("feed_ad_renew_cta", { fallbackKo: "연장하기", fallbackEn: "Renew" })}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* 헤더 [광고 신청] → 종류 선택 시트 */}
      <DibayActionSheet
        open={kindSheetOpen}
        onClose={() => setKindSheetOpen(false)}
        title={t("mypage_oa_ads_kind_sheet_title")}
        cancelLabel={t("common_cancel")}
        items={[
          {
            key: "promo",
            label: t("mypage_oa_ads_kind_promo_cta"),
            onClick: () => openApply("/mypage/ads/apply"),
          },
          {
            key: "banner",
            disabled: !canCreateBanner,
            label: canCreateBanner ? (
              t("mypage_oa_ads_kind_banner_cta")
            ) : (
              <span className="flex flex-col items-center gap-0.5" data-testid="my-ads-banner-blocked">
                <span>{t("mypage_oa_ads_kind_banner_cta")}</span>
                <span className="sam-text-xxs font-normal text-sam-muted">
                  {safeT("feed_ad_req_current_exists", {
                    fallbackKo: "현재 진행 중인 배너 광고가 있습니다. 내 광고에서 관리하세요.",
                    fallbackEn: "You already have a current banner ad. Manage it from My ads.",
                  })}
                </span>
              </span>
            ),
            onClick: () => openApply("/mypage/ads/feed-request"),
          },
        ]}
      />

      <MobileConfirmBottomSheet
        open={cancelTarget != null}
        onCancel={() => setCancelTarget(null)}
        title={t("mypage_oa_ad_cancel_confirm_title")}
        description={t("mypage_oa_ad_cancel_confirm_body")}
        cancelLabel={t("common_cancel")}
        confirmLabel={safeT("feed_ad_cancel_cta", { fallbackKo: "신청 취소", fallbackEn: "Cancel request" })}
        confirmTone="danger"
        onConfirm={() => {
          const target = cancelTarget;
          setCancelTarget(null);
          if (!target) return;
          void cancelGuard.run(() => (target.kind === "banner" ? cancelRequest(target.id) : cancelPostAd(target.id)));
        }}
      />

      <DibayBottomSheet
        open={Boolean(renewTarget)}
        onClose={() => setRenewTarget(null)}
        title={safeT("feed_ad_renew_title", {
          fallbackKo: "광고 연장",
          fallbackEn: "Renew ad",
        })}
        anchor="above-bottom-nav"
        ariaLabel={safeT("feed_ad_renew_title", {
          fallbackKo: "광고 연장",
          fallbackEn: "Renew ad",
        })}
      >
        <div data-testid="feed-ad-renew-sheet">
          <p className={`mb-3 ${OverlayUi.bodySecondary}`}>
            {safeT("feed_ad_renew_hint", {
              fallbackKo: "동일 이미지·연결로 기간을 연장합니다. 포인트가 즉시 사용됩니다.",
              fallbackEn: "Extends the same creative and destination. Point is charged now.",
            })}
          </p>
          <div className="space-y-2">
            {renewCatalog.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setRenewProductId(p.id)}
                className={`w-full rounded-[length:var(--overlay-radius-md)] border px-3 py-2 text-left ${
                  renewProductId === p.id
                    ? "border-[color:var(--overlay-primary)] bg-[color:var(--overlay-secondary)]"
                    : "border-[color:var(--overlay-border)]"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{en ? p.titleEn : p.titleKo}</span>
                  <CurrencyAmount currency="point" amount={p.pointCost} compactPoint className="font-semibold" />
                </div>
                <p className={OverlayUi.caption}>
                  {p.durationDays}
                  {en ? " days" : "일"}
                </p>
              </button>
            ))}
          </div>
          <div className={`${OverlayUi.actionsRow} mt-3`}>
            <DibayOverlayButton
              roleTone="secondary"
              type="button"
              onClick={() => setRenewTarget(null)}
              disabled={renewBusy}
            >
              {t("common_cancel")}
            </DibayOverlayButton>
            <DibayOverlayButton
              roleTone="primary"
              type="button"
              data-testid="feed-ad-renew-confirm"
              disabled={renewBusy || !renewProductId}
              loading={renewBusy}
              onClick={() => void submitRenew()}
            >
              {renewBusy ? t("common_loading") : en ? "Pay & renew" : "결제하고 연장"}
            </DibayOverlayButton>
          </div>
        </div>
      </DibayBottomSheet>
    </div>
  );
}
