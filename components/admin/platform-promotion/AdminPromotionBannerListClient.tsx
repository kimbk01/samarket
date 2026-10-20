"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import {
  AdminErrorState,
  AdminLoadingState,
  AdminResultBanner,
} from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  eventBannerPlacementLabel,
  eventBannerPresentationLabel,
  type EventBannerPlacement,
  type EventBannerPresentation,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import {
  formatPromotionAdminSchedule,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
  resolveDistributionOperatorStatus,
  type PromotionOperatorStatus,
} from "@/lib/admin/promotion-operation-status";
import { promotionAdminActionLabel } from "@/lib/admin/promotion-operation-actions";
import {
  bannerDestinationSummary,
  bannerListPurposeCopy,
  eventDistributionHref,
  eventEditHref,
  eventPreviewHref,
  inlineSharesPlacementCopy,
  PLACEMENTS_INVENTORY_HREF,
} from "@/lib/admin/promotion-ownership-visibility";
import { adminOperatorRowClassFromPromotionStatus } from "@/lib/admin/admin-operator-row-presentation";

type BannerRow = {
  distributionId: string;
  eventId: string;
  eventTitle: string;
  placement: EventBannerPlacement;
  presentation: EventBannerPresentation;
  status: string;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  href: string | null;
  thumbUrl?: string | null;
};

type DistChannel = "popup" | "banner" | "push" | "bell";

/**
 * Reuse existing Event Distribution PUT writer only.
 * GET current toggles/configs → PUT with banner disabled (others preserved).
 */
async function pauseBannerViaExistingDistributionWriter(row: BannerRow): Promise<{
  ok: boolean;
  error?: string;
}> {
  const getRes = await fetch(
    `/api/admin/platform-events/${encodeURIComponent(row.eventId)}/distribution`,
    { credentials: "same-origin" }
  );
  const getJson = (await getRes.json().catch(() => ({}))) as {
    ok?: boolean;
    toggles?: Record<DistChannel, boolean>;
    rows?: Array<{ channel?: string; config?: Record<string, unknown> }>;
    error?: string;
  };
  if (!getRes.ok || !getJson.ok || !getJson.toggles) {
    return { ok: false, error: getJson.error || "distribution_load_failed" };
  }

  const configOf = (channel: DistChannel): Record<string, unknown> => {
    const found = (getJson.rows || []).find((r) => r.channel === channel);
    return (found?.config && typeof found.config === "object" ? found.config : {}) as Record<
      string,
      unknown
    >;
  };

  const putRes = await fetch(
    `/api/admin/platform-events/${encodeURIComponent(row.eventId)}/distribution`,
    {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTitle: row.eventTitle,
        toggles: {
          popup: Boolean(getJson.toggles.popup),
          banner: false,
          push: Boolean(getJson.toggles.push),
          bell: Boolean(getJson.toggles.bell),
        },
        popup: configOf("popup"),
        banner: configOf("banner"),
        push: configOf("push"),
        bell: configOf("bell"),
      }),
    }
  );
  const putJson = (await putRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!putRes.ok || !putJson.ok) {
    return { ok: false, error: putJson.error || "distribution_pause_failed" };
  }
  return { ok: true };
}

export function AdminPromotionBannerListClient() {
  const { language, safeT, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [rows, setRows] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | undefined>(undefined);
  const [actionResult, setActionResult] = useState<
    { ok: true; message: string } | { ok: false; code: string } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHttpStatus(undefined);
    try {
      const res = await fetch("/api/admin/platform-promotion/banners", {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: BannerRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error || "load_failed");
        setHttpStatus(res.status);
        setRows([]);
        return;
      }
      setRows(json.items ?? []);
    } catch {
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4 p-4" data-admin-promotion-banner-list="1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold">
            {t("admin_menu_promotion_banners")}
          </h1>
          <p
            className="mt-1 max-w-2xl text-sm text-sam-muted"
            data-admin-banner-list-purpose="1"
          >
            {safeT("admin_promotion_banner_list_desc", {
              fallbackKo: bannerListPurposeCopy("ko"),
              fallbackEn: bannerListPurposeCopy("en"),
            })}
          </p>
          <p
            className="mt-1 max-w-2xl text-xs text-sam-muted"
            data-admin-banner-inline-placement-note="1"
          >
            {safeT("admin_promotion_banner_inline_placement_note", {
              fallbackKo: inlineSharesPlacementCopy("ko"),
              fallbackEn: inlineSharesPlacementCopy("en"),
            })}{" "}
            <Link
              href={PLACEMENTS_INVENTORY_HREF}
              className="underline"
              data-admin-banner-placements-link="1"
            >
              {safeT("admin_promotion_banner_view_placements", {
                fallbackKo: "노출 위치 현황 보기",
                fallbackEn: "View placement status",
              })}
            </Link>
          </p>
        </div>
        <AdminActionLink href="/admin/platform-events" variant="secondary">
          {safeT("admin_promotion_banner_goto_events", {
            fallbackKo: "이벤트에서 노출 설정",
            fallbackEn: "Configure via Events",
          })}
        </AdminActionLink>
      </div>

      <AdminResultBanner ko={lang !== "en"} result={actionResult} onClose={() => setActionResult(null)} />

      {loading ? (
        <AdminLoadingState ko={lang !== "en"} />
      ) : error ? (
        <AdminErrorState ko={lang !== "en"} code={error} httpStatus={httpStatus} onRetry={() => void load()} />
      ) : rows.length === 0 ? (
        <div
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-4"
          data-admin-promotion-banner-empty="1"
        >
          <p className="text-sm text-sam-muted">
            {safeT("admin_promotion_banner_empty", {
              fallbackKo: "설정된 이벤트 배너가 없습니다. 이벤트 노출 설정에서 추가하세요.",
              fallbackEn: "No event banners yet. Add them in Event exposure settings.",
            })}
          </p>
          <AdminActionLink href="/admin/platform-events" variant="primary" className="mt-3">
            {safeT("admin_promotion_banner_goto_events", {
              fallbackKo: "이벤트에서 노출 설정",
              fallbackEn: "Configure via Events",
            })}
          </AdminActionLink>
        </div>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {rows.map((row) => {
            const op: PromotionOperatorStatus = resolveDistributionOperatorStatus({
              status: row.status,
              enabled: row.enabled,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
            });
            const isInline = row.presentation === "INLINE_BANNER";
            const canDirectPause = op === "ACTIVE" || op === "SCHEDULED";
            return (
              <li
                key={row.distributionId}
                className={`px-3 py-2.5 ${adminOperatorRowClassFromPromotionStatus(op)}`}
                data-admin-banner-presentation={row.presentation}
                data-admin-banner-placement={row.placement}
                data-admin-op-status={op}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 gap-2">
                    {row.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin list thumb
                      <img
                        src={row.thumbUrl}
                        alt=""
                        className="h-9 w-14 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="h-9 w-14 shrink-0 rounded bg-sam-app" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{row.eventTitle}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-sam-muted">
                        <span>{eventBannerPresentationLabel(row.presentation, lang)}</span>
                        <span>{eventBannerPlacementLabel(row.placement, lang)}</span>
                        <span>
                          {formatPromotionAdminSchedule(row.startsAt, lang)} –{" "}
                          {formatPromotionAdminSchedule(row.endsAt, lang)}
                        </span>
                        <span>
                          {lang === "en" ? "Destination" : "목적지"}:{" "}
                          {bannerDestinationSummary(row.href, lang)}
                        </span>
                        {isInline ? (
                          <span data-admin-banner-inline-badge="1">
                            {lang === "en"
                              ? "Shares ad placement inventory"
                              : "광고 노출 위치 공유"}
                          </span>
                        ) : (
                          <span data-admin-banner-hero-badge="1">
                            {lang === "en"
                              ? "Promotion hero (not feed inventory)"
                              : "히어로 · 피드 재고와 별도"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                      {promotionOperatorStatusLabel(op, lang)}
                    </AdminToneBadge>
                    <AdminActionLink href={eventPreviewHref(row.eventId)} variant="secondary">
                      {promotionAdminActionLabel("PREVIEW", lang)}
                    </AdminActionLink>
                    <AdminActionLink href={eventEditHref(row.eventId)} variant="secondary">
                      {safeT("admin_promotion_action_edit", {
                        fallbackKo: "수정",
                        fallbackEn: "Edit",
                      })}
                    </AdminActionLink>
                    <AdminActionLink
                      href={eventDistributionHref(row.eventId)}
                      variant="secondary"
                      data-admin-banner-exposure-cta="1"
                    >
                      {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
                    </AdminActionLink>
                    {canDirectPause ? (
                      <AdminActionButton
                        variant="secondary"
                        disabled={pausingId === row.distributionId}
                        data-admin-banner-direct-pause="1"
                        onClick={() => {
                          void (async () => {
                            const ko = lang !== "en";
                            const confirmed = await confirmAdminAction({
                              level: adminActionLevel("exposeStop"),
                              ko,
                              title: ko ? "배너 노출 중지" : "Stop banner exposure",
                              description: ko
                                ? `「${row.eventTitle}」 배너 노출을 중지합니다. 이벤트 노출 설정에서 다시 켤 수 있습니다.`
                                : `Stop showing the "${row.eventTitle}" banner. You can turn it back on in Event exposure settings.`,
                              confirmLabel: adminCta("exposeStop", ko),
                            });
                            if (!confirmed.ok) return;
                            setPausingId(row.distributionId);
                            setActionResult(null);
                            const r = await pauseBannerViaExistingDistributionWriter(row);
                            setPausingId(null);
                            if (!r.ok) {
                              setActionResult({ ok: false, code: r.error ?? "save_failed" });
                              return;
                            }
                            setActionResult({
                              ok: true,
                              message: ko ? "배너 노출을 중지했습니다." : "Banner exposure stopped.",
                            });
                            await load();
                          })();
                        }}
                      >
                        {promotionAdminActionLabel("PAUSE_STOP", lang)}
                      </AdminActionButton>
                    ) : (
                      <AdminActionLink
                        href={eventDistributionHref(row.eventId)}
                        variant="quiet"
                        data-admin-banner-stop-deeplink="1"
                      >
                        {promotionAdminActionLabel("CONFIGURE_EXPOSURE", lang)}
                      </AdminActionLink>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
