"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MyPostAdList } from "@/components/ads/MyPostAdList";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { AdminPostAdRow, MePostAdsMeta } from "@/lib/ads/types";
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
export default function MyAdsPageClient() {
  const { t, safeT, language } = useI18n();
  const en = language === "en";
  const [ads, setAds] = useState<AdminPostAdRow[]>([]);
  const [meta, setMeta] = useState<MePostAdsMeta | null>(null);
  const [feedRequests, setFeedRequests] = useState<FeedRequestRow[]>([]);
  const [canCreateBanner, setCanCreateBanner] = useState(true);
  const [loading, setLoading] = useState(true);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState("");
  const [renewTarget, setRenewTarget] = useState<FeedRequestRow | null>(null);
  const [renewCatalog, setRenewCatalog] = useState<FeedAdProduct[]>([]);
  const [renewProductId, setRenewProductId] = useState("");
  const [renewBusy, setRenewBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
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
        }).catch(() => null),
      ]);

      if (postPack.status === 401) {
        setAuthHint(t("ads_auth_hint"));
        setAds([]);
        setMeta(null);
        setFeedRequests([]);
        setCanCreateBanner(true);
        return;
      }
      if (postPack.body.ok && Array.isArray(postPack.body.ads)) {
        setAds(postPack.body.ads);
        setMeta(postPack.body.meta ?? null);
      } else {
        setAds([]);
        setMeta(null);
      }
      if (feedPack && feedPack.status === 200 && Array.isArray(feedPack.body.requests)) {
        setFeedRequests(feedPack.body.requests);
        if (typeof feedPack.body.canCreateBanner === "boolean") {
          setCanCreateBanner(feedPack.body.canCreateBanner);
        } else {
          const blocked = feedPack.body.requests.some((r) =>
            isFeedAdDisplayStatusBlockingNewCreate(r.displayStatus ?? r.status)
          );
          setCanCreateBanner(!blocked);
        }
      } else {
        setFeedRequests([]);
        setCanCreateBanner(true);
      }
    } catch {
      setAds([]);
      setMeta(null);
      setFeedRequests([]);
      setCanCreateBanner(true);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancelRequest = async (id: string) => {
    if (cancelBusyId) return;
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
        setActionErr(
          j.error === "not_pending"
            ? safeT("feed_ad_cancel_not_pending", {
                fallbackKo: "이미 처리된 신청입니다.",
                fallbackEn: "This request is no longer pending.",
              })
            : j.error ??
                safeT("feed_ad_cancel_failed", {
                  fallbackKo: "신청 취소에 실패했습니다.",
                  fallbackEn: "Could not cancel the request.",
                })
        );
        return;
      }
      await load();
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
            j.error ??
              safeT("feed_ad_renew_failed", {
                fallbackKo: "연장에 실패했습니다.",
                fallbackEn: "Renewal failed.",
              })
          );
        }
        return;
      }
      setRenewTarget(null);
      await load();
    } finally {
      setRenewBusy(false);
    }
  };

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString(en ? "en" : "ko");
    } catch {
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
      />
      <div className="mx-auto max-w-lg px-4 py-4 space-y-4">
        {authHint ? (
          <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
            {t("auth_resource_access_denied")}
          </p>
        ) : null}

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("revenue_hub_promo_title", {
              fallbackKo: "게시물 홍보",
              fallbackEn: "Promote a post",
            })}
          </h2>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {safeT("revenue_hub_promo_desc", {
              fallbackKo: "내 게시물을 목록 위쪽에 더 잘 보이게 합니다. D-Point를 사용합니다.",
              fallbackEn: "Boost your own post in the list with D-Point.",
            })}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/mypage/points/promotions"
              className="flex-1 rounded-ui-rect bg-signature px-4 py-2.5 text-center sam-text-body font-medium text-white"
            >
              {safeT("revenue_hub_promo_cta", {
                fallbackKo: "D-Point로 홍보하기",
                fallbackEn: "Promote with D-Point",
              })}
            </Link>
            <Link
              href="/philife"
              className="flex-1 rounded-ui-rect border border-sam-border px-4 py-2.5 text-center sam-text-body font-medium text-sam-fg"
            >
              {safeT("revenue_hub_promo_community", {
                fallbackKo: "커뮤니티 글로 이동",
                fallbackEn: "Go to community posts",
              })}
            </Link>
          </div>
        </section>

        <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("revenue_hub_banner_title", {
              fallbackKo: "배너 광고",
              fallbackEn: "Banner ads",
            })}
          </h2>
          <p className="mt-1 sam-text-helper text-sam-muted">
            {safeT("revenue_hub_banner_desc", {
              fallbackKo:
                "이미지 광고를 게시글 사이에 노출합니다. 관리자 승인 후 게시되며, 신청 시 D-Point가 보류됩니다.",
              fallbackEn:
                "Show an image ad between posts. D-Point is held until admin approval.",
            })}
          </p>
          {canCreateBanner ? (
            <Link
              href="/mypage/ads/feed-request"
              className="mt-3 block w-full rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-2.5 text-center sam-text-body font-semibold text-amber-900"
              data-testid="revenue-hub-banner-create"
            >
              {safeT("revenue_hub_banner_cta", {
                fallbackKo: "광고 만들기",
                fallbackEn: "Create an ad",
              })}
            </Link>
          ) : (
            <a
              href="#feed-ad-status"
              className="mt-3 block w-full rounded-ui-rect border border-sam-border bg-sam-app px-4 py-2.5 text-center sam-text-body font-semibold text-sam-fg"
              data-testid="revenue-hub-banner-manage"
            >
              {safeT("revenue_hub_banner_manage_cta", {
                fallbackKo: "현재 광고 관리",
                fallbackEn: "Manage current ad",
              })}
            </a>
          )}
        </section>

        <section id="feed-ad-status" className="space-y-2">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("revenue_hub_status_title", {
              fallbackKo: "배너 광고 현황",
              fallbackEn: "Banner ad status",
            })}
          </h2>
          {actionErr ? <p className="sam-text-helper text-sam-warning">{actionErr}</p> : null}
          {loading ? (
            <p className="py-6 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
          ) : (
            <>
              {feedRequests.length > 0 ? (
                <ul className="space-y-2">
                  {feedRequests.map((r) => {
                    const thumb = r.creatives?.[0]?.imageUrl ?? "";
                    const viewHref = feedAdMemberViewHref({
                      placement: r.placement,
                      targetCategoryId: r.targetCategoryId,
                      targetTopicSlug: r.targetTopicSlug,
                    });
                    const display = r.displayStatus ?? r.status;
                    const windowLabel = formatFeedAdWindowLabel(
                      r.startAt,
                      r.endAt,
                      en ? "en" : "ko"
                    );
                    const remaining = formatFeedAdRemaining(
                      r.remainingMs,
                      en ? "en" : "ko"
                    );
                    const canRenew =
                      Boolean(r.campaignId) &&
                      (display === "active" || display === "ended");
                    return (
                      <li
                        key={r.id}
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
                              <span className="sam-text-body font-medium text-sam-fg truncate">
                                {feedAdPlacementHumanLabel(
                                  r.placement as FeedAdPlacement,
                                  en ? "en" : "ko"
                                )}
                              </span>
                              <span
                                data-testid="revenue-hub-feed-ad-status"
                                className="shrink-0 sam-text-helper text-sam-muted"
                              >
                                {statusLabel(display)}
                              </span>
                            </div>
                            <p className="mt-0.5 sam-text-helper text-sam-muted">
                              {r.placement === "COMMUNITY_HOME"
                                ? safeT("revenue_hub_feed_surface_hint", {
                                    fallbackKo: "게재: 커뮤니티 피드 중간 광고",
                                    fallbackEn: "Surface: Community mid-feed ad",
                                  })
                                : r.placement === "COMMUNITY_TOPIC"
                                  ? safeT("revenue_hub_feed_surface_hint", {
                                      fallbackKo: "게재: 해당 주제 피드 중간 광고",
                                      fallbackEn: "Surface: Topic mid-feed ad",
                                    })
                                  : r.placement === "TRADE_HOME"
                                    ? safeT("revenue_hub_feed_surface_hint", {
                                        fallbackKo: "게재: 거래 홈 피드 중간 광고",
                                        fallbackEn: "Surface: Trade home mid-feed ad",
                                      })
                                    : safeT("revenue_hub_feed_surface_hint", {
                                        fallbackKo: "게재: 거래 카테고리 피드 중간 광고",
                                        fallbackEn: "Surface: Trade category mid-feed ad",
                                      })}
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
                              {safeT("revenue_hub_applied_at", {
                                fallbackKo: "신청일",
                                fallbackEn: "Applied",
                              })}
                              {": "}
                              {fmtDate(r.createdAt) ?? "—"}
                              {" · "}
                              {r.pointCost.toLocaleString()}P
                            </p>
                            {(r.startAt || r.endAt) && (
                              <p
                                className="sam-text-helper text-sam-muted"
                                data-testid="revenue-hub-feed-ad-window"
                              >
                                {windowLabel.startLabel} → {windowLabel.endLabel}
                              </p>
                            )}
                            {remaining ? (
                              <p
                                className="sam-text-helper text-sam-muted"
                                data-testid="revenue-hub-feed-ad-remaining"
                              >
                                {remaining}
                              </p>
                            ) : null}
                            {r.status === "rejected" && r.reviewReason ? (
                              <p
                                className="mt-1 sam-text-helper text-sam-warning"
                                data-testid="revenue-hub-feed-ad-reject-reason"
                              >
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
                              className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper disabled:opacity-50"
                              onClick={() => void cancelRequest(r.id)}
                            >
                              {cancelBusyId === r.id
                                ? t("common_loading")
                                : safeT("feed_ad_cancel_cta", {
                                    fallbackKo: "신청 취소",
                                    fallbackEn: "Cancel request",
                                  })}
                            </button>
                          ) : null}
                          {(r.status === "rejected" || display === "ended" || display === "cancelled") &&
                          canCreateBanner ? (
                            <Link
                              href="/mypage/ads/feed-request"
                              className="rounded-ui-rect border border-sam-border px-3 py-1.5 sam-text-helper"
                            >
                              {safeT("feed_ad_recreate_cta", {
                                fallbackKo: "다시 광고 만들기",
                                fallbackEn: "Create again",
                              })}
                            </Link>
                          ) : null}
                          {display === "active" ? (
                            <Link
                              href={viewHref}
                              data-testid={`feed-ad-view-${r.id}`}
                              className="rounded-ui-rect bg-signature px-3 py-1.5 sam-text-helper font-medium text-white"
                            >
                              {safeT("feed_ad_view_cta", {
                                fallbackKo: "광고 보기",
                                fallbackEn: "View ad",
                              })}
                            </Link>
                          ) : null}
                          {canRenew ? (
                            <button
                              type="button"
                              data-testid={`feed-ad-renew-${r.id}`}
                              className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-1.5 sam-text-helper font-medium text-amber-900"
                              onClick={() => void openRenew(r)}
                            >
                              {safeT("feed_ad_renew_cta", {
                                fallbackKo: "연장하기",
                                fallbackEn: "Renew",
                              })}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-4 text-center sam-text-helper text-sam-muted">
                  {safeT("feed_ad_hub_empty", {
                    fallbackKo: "배너 광고 신청이 없습니다.",
                    fallbackEn: "No banner ad requests yet.",
                  })}
                </p>
              )}
              <div className="pt-2">
                <p className="mb-2 sam-text-helper font-medium text-sam-muted">
                  {safeT("revenue_hub_legacy_pin", {
                    fallbackKo: "커뮤니티 상단 고정 (전환 중)",
                    fallbackEn: "Community top pin (migrating)",
                  })}
                </p>
                <MyPostAdList ads={ads} metaSource={meta?.source} onRefresh={() => void load()} />
              </div>
            </>
          )}
        </section>
      </div>

      {renewTarget ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div
            className="w-full max-w-md space-y-3 rounded-ui-rect bg-sam-surface p-4 shadow-lg"
            role="dialog"
            data-testid="feed-ad-renew-sheet"
          >
            <h3 className="sam-text-body font-semibold">
              {safeT("feed_ad_renew_title", {
                fallbackKo: "광고 연장",
                fallbackEn: "Renew ad",
              })}
            </h3>
            <p className="sam-text-helper text-sam-muted">
              {safeT("feed_ad_renew_hint", {
                fallbackKo: "동일 이미지·연결로 기간을 연장합니다. D-Point가 즉시 사용됩니다.",
                fallbackEn: "Extends the same creative and destination. D-Point is charged now.",
              })}
            </p>
            <div className="space-y-2">
              {renewCatalog.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setRenewProductId(p.id)}
                  className={`w-full rounded-ui-rect border px-3 py-2 text-left ${
                    renewProductId === p.id
                      ? "border-sam-primary bg-sam-primary/5"
                      : "border-sam-border"
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{en ? p.titleEn : p.titleKo}</span>
                    <span className="font-semibold">{p.pointCost.toLocaleString()}P</span>
                  </div>
                  <p className="sam-text-helper text-sam-muted">
                    {p.durationDays}
                    {en ? " days" : "일"}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-ui-rect border border-sam-border py-2"
                onClick={() => setRenewTarget(null)}
                disabled={renewBusy}
              >
                {t("common_cancel")}
              </button>
              <button
                type="button"
                data-testid="feed-ad-renew-confirm"
                className="flex-1 rounded-ui-rect bg-signature py-2 font-medium text-white disabled:opacity-50"
                disabled={renewBusy || !renewProductId}
                onClick={() => void submitRenew()}
              >
                {renewBusy ? t("common_loading") : en ? "Pay & renew" : "결제하고 연장"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
