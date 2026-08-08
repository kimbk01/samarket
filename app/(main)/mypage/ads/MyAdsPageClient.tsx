"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { MyPostAdList } from "@/components/ads/MyPostAdList";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import type { AdminPostAdRow, MePostAdsMeta } from "@/lib/ads/types";
import { feedAdPlacementHumanLabel, type FeedAdPlacement } from "@/lib/ads/feed-ad-placement";

type FeedRequestRow = {
  id: string;
  status: string;
  domain: string;
  placement: string;
  pointCost: number;
  durationDays: number;
  reviewReason?: string | null;
  createdAt: string;
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
  const [loading, setLoading] = useState(true);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAuthHint(null);
    try {
      // Parse JSON inside each flight — sharing a raw Response breaks under React Strict Mode
      // (second mount consumes an already-read body and used to wipe feedRequests).
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
          };
          return { status: res.status, body };
        }).catch(() => null),
      ]);

      if (postPack.status === 401) {
        setAuthHint(t("ads_auth_hint"));
        setAds([]);
        setMeta(null);
        setFeedRequests([]);
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
      } else {
        setFeedRequests([]);
      }
    } catch {
      setAds([]);
      setMeta(null);
      setFeedRequests([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel = (status: string) => {
    const s = status.trim().toLowerCase();
    if (s === "pending_review" || s === "held" || s === "pending") {
      return safeT("revenue_hub_status_pending", {
        fallbackKo: "심사 중",
        fallbackEn: "In review",
      });
    }
    if (s === "active" || s === "approved" || s === "captured") {
      return safeT("revenue_hub_status_active", {
        fallbackKo: "광고 중",
        fallbackEn: "Running",
      });
    }
    if (s === "rejected") {
      return safeT("revenue_hub_status_rejected", {
        fallbackKo: "거절",
        fallbackEn: "Rejected",
      });
    }
    if (s === "expired" || s === "ended" || s === "cancelled") {
      return safeT("revenue_hub_status_ended", {
        fallbackKo: "종료",
        fallbackEn: "Ended",
      });
    }
    return status;
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
        section="store"
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
              fallbackKo: "피드 광고",
              fallbackEn: "Feed advertisement",
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
          <Link
            href="/mypage/ads/feed-request"
            className="mt-3 block w-full rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-2.5 text-center sam-text-body font-semibold text-amber-900"
          >
            {safeT("revenue_hub_banner_cta", {
              fallbackKo: "광고 신청하기",
              fallbackEn: "Request a feed ad",
            })}
          </Link>
        </section>

        <section className="space-y-2">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            {safeT("revenue_hub_status_title", {
              fallbackKo: "신청 · 진행 현황",
              fallbackEn: "Status",
            })}
          </h2>
          {loading ? (
            <p className="py-6 text-center sam-text-body text-sam-muted">{t("common_loading")}</p>
          ) : (
            <>
              {feedRequests.length > 0 ? (
                <ul className="space-y-2">
                  {feedRequests.map((r) => (
                    <li
                      key={r.id}
                      data-testid="revenue-hub-feed-ad-request"
                      data-status={r.status}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="sam-text-body font-medium text-sam-fg">
                          {safeT("revenue_hub_banner_title", {
                            fallbackKo: "피드 광고",
                            fallbackEn: "Feed ad",
                          })}
                        </span>
                        <span
                          data-testid="revenue-hub-feed-ad-status"
                          className="sam-text-helper text-sam-muted"
                        >
                          {statusLabel(r.status)}
                        </span>
                      </div>
                      <p className="mt-1 sam-text-helper text-sam-muted">
                        {r.domain === "community"
                          ? safeT("revenue_hub_domain_community", {
                              fallbackKo: "커뮤니티",
                              fallbackEn: "Community",
                            })
                          : safeT("revenue_hub_domain_trade", {
                              fallbackKo: "거래",
                              fallbackEn: "Trade",
                            })}
                        {" · "}
                        {r.durationDays}
                        {en ? "d" : "일"}
                        {" · "}
                        {safeT("revenue_hub_reserved_points", {
                          fallbackKo: `예약 ${r.pointCost.toLocaleString()}P`,
                          fallbackEn: `Reserved ${r.pointCost.toLocaleString()}P`,
                        })}
                      </p>
                      {r.placement ? (
                        <p className="mt-0.5 sam-text-helper text-sam-muted">
                          {feedAdPlacementHumanLabel(r.placement as FeedAdPlacement, en ? "en" : "ko")}
                        </p>
                      ) : null}
                      {r.status === "rejected" && r.reviewReason ? (
                        <p className="mt-1 sam-text-helper text-sam-warning">
                          {r.reviewReason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
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
    </div>
  );
}
