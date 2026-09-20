"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
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
};

export function AdminPromotionBannerListClient() {
  const { language, safeT } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const [rows, setRows] = useState<BannerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
        setRows([]);
        return;
      }
      setRows(json.items ?? []);
    } catch {
      setError("load_failed");
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
          <h1 className="text-lg font-semibold">
            {safeT("admin_menu_promotion_banners", {
              fallbackKo: "배너",
              fallbackEn: "Banners",
            })}
          </h1>
          <p className="mt-1 text-sm text-sam-muted">
            {safeT("admin_promotion_banner_list_desc", {
              fallbackKo:
                "이벤트 Distribution 배너. 인라인(3:1) / 히어로(39:16) · 커뮤니티 홈 / 거래 홈.",
              fallbackEn:
                "Event Distribution banners. Inline (3:1) / Hero (39:16) · Community / Trade home.",
            })}
          </p>
        </div>
        <AdminActionLink href="/admin/platform-events" variant="secondary">
          {safeT("admin_promotion_banner_goto_events", {
            fallbackKo: "이벤트에서 노출 설정",
            fallbackEn: "Configure via Events",
          })}
        </AdminActionLink>
      </div>

      {loading ? (
        <p className="text-sm text-sam-muted">…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-sam-muted" data-admin-promotion-banner-empty="1">
          {safeT("admin_promotion_banner_empty", {
            fallbackKo: "설정된 배너 Distribution이 없습니다. 이벤트 노출 설정에서 추가하세요.",
            fallbackEn: "No banner distributions yet. Add them in Event exposure settings.",
          })}
        </p>
      ) : (
        <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {rows.map((row) => {
            const op: PromotionOperatorStatus = resolveDistributionOperatorStatus({
              status: row.status,
              enabled: row.enabled,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
            });
            return (
              <li key={row.distributionId} className="px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{row.eventTitle}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-sam-muted">
                      <span>{eventBannerPresentationLabel(row.presentation, lang)}</span>
                      <span>·</span>
                      <span>{eventBannerPlacementLabel(row.placement, lang)}</span>
                      <span>·</span>
                      <span>
                        {formatPromotionAdminSchedule(row.startsAt, lang)} –{" "}
                        {formatPromotionAdminSchedule(row.endsAt, lang)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                      {promotionOperatorStatusLabel(op, lang)}
                    </AdminToneBadge>
                    <AdminActionLink
                      href={`/admin/platform-events/${encodeURIComponent(row.eventId)}`}
                      variant="secondary"
                    >
                      {safeT("admin_promotion_action_configure_exposure", {
                        fallbackKo: "노출 설정",
                        fallbackEn: "Configure exposure",
                      })}
                    </AdminActionLink>
                    <Link
                      href={`/admin/platform-events/${encodeURIComponent(row.eventId)}`}
                      className="text-xs text-sam-muted underline"
                    >
                      {safeT("admin_promotion_action_edit", {
                        fallbackKo: "수정",
                        fallbackEn: "Edit",
                      })}
                    </Link>
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
