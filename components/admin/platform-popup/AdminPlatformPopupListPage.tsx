"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PLATFORM_POPUP_CAMPAIGN_STATUSES } from "@/lib/platform-popup/types";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";
import {
  formatPromotionAdminSchedule,
  promotionOperatorStatusLabel,
  promotionOperatorStatusTone,
  resolvePopupOperatorStatus,
} from "@/lib/admin/promotion-operation-status";

export function AdminPlatformPopupListPage() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const router = useRouter();
  const [items, setItems] = useState<PlatformPopupAdminListItem[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    const res = await fetch(`/api/admin/platform-popup-campaigns${q}`, {
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      items?: PlatformPopupAdminListItem[];
      error?: string;
    };
    if (!res.ok || !json.ok) {
      setError(json.error || "load_failed");
      setItems([]);
    } else {
      setItems(json.items ?? []);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = safeT("admin_menu_promotion_popup", {
    fallbackKo: "팝업",
    fallbackEn: "Popups",
  });

  const onCreate = async () => {
    setCreating(true);
    const res = await fetch("/api/admin/platform-popup-campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: safeT("admin_platform_popup_untitled", {
          fallbackKo: "새 팝업 캠페인",
          fallbackEn: "New popup campaign",
        }),
        surfaces: ["GLOBAL"],
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      id?: string;
      error?: string;
    };
    setCreating(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(json.error || "create_failed");
      return;
    }
    router.push(`/admin/platform-popup/${json.id}`);
  };

  const empty = useMemo(() => !loading && items.length === 0, [loading, items.length]);

  return (
    <div className="space-y-4 p-4" data-admin-platform-popup-list="1">
      <AdminPageHeader
        title={title}
        description={safeT("admin_platform_popup_list_desc", {
          fallbackKo: "플랫폼 팝업 캠페인 — 형태 · 위치 · 기간 · 상태",
          fallbackEn: "Platform popup campaigns — presentation · surface · period · status",
        })}
      />

      <AdminCard>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-sam-muted">
            {safeT("admin_platform_popup_filter_status", {
              fallbackKo: "상태",
              fallbackEn: "Status",
            })}
            <select
              className="ml-2 rounded border border-sam-border bg-sam-surface px-2 py-1"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">
                {safeT("admin_platform_popup_filter_all", {
                  fallbackKo: "전체",
                  fallbackEn: "All",
                })}
              </option>
              {PLATFORM_POPUP_CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <AdminActionButton
            className="ml-auto"
            variant="primary"
            disabled={creating}
            onClick={() => void onCreate()}
          >
            {safeT("admin_platform_popup_create", {
              fallbackKo: "캠페인 만들기",
              fallbackEn: "Create campaign",
            })}
          </AdminActionButton>
        </div>
      </AdminCard>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <AdminCard>
        {loading ? (
          <p className="text-sm text-sam-muted">
            {safeT("admin_platform_popup_loading", {
              fallbackKo: "불러오는 중…",
              fallbackEn: "Loading…",
            })}
          </p>
        ) : empty ? (
          <p className="text-sm text-sam-muted">
            {safeT("admin_platform_popup_empty", {
              fallbackKo: "캠페인이 없습니다.",
              fallbackEn: "No campaigns yet.",
            })}
          </p>
        ) : (
          <ul className="divide-y divide-sam-border" data-admin-popup-operational-list="1">
            {items.map((item) => {
              const op = resolvePopupOperatorStatus({
                status: item.status,
                startsAt: item.startAt,
                endsAt: item.endAt,
              });
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/platform-popup/${item.id}`}
                      className="font-semibold hover:underline"
                    >
                      {item.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-sam-muted">
                      <span>{item.presentationType || "—"}</span>
                      <span>·</span>
                      <span>{item.surfaces.join(", ") || "—"}</span>
                      <span>·</span>
                      <span>
                        {formatPromotionAdminSchedule(item.startAt, lang)} –{" "}
                        {formatPromotionAdminSchedule(item.endAt, lang)}
                      </span>
                      <span>({item.timezone || "Asia/Manila"})</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-sam-muted">
                      {item.ctaType}
                      {item.ctaType === "external_url"
                        ? item.externalUrl
                          ? ` · ${item.externalUrl}`
                          : ""
                        : item.ctaTarget
                          ? ` · ${item.ctaTarget}`
                          : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <AdminToneBadge tone={promotionOperatorStatusTone(op)}>
                      {promotionOperatorStatusLabel(op, lang)}
                    </AdminToneBadge>
                    <AdminActionLink
                      href={`/admin/platform-popup/${item.id}`}
                      variant="secondary"
                    >
                      {safeT("admin_promotion_action_preview", {
                        fallbackKo: "미리보기",
                        fallbackEn: "Preview",
                      })}
                    </AdminActionLink>
                    <AdminActionLink
                      href={`/admin/platform-popup/${item.id}`}
                      variant="secondary"
                    >
                      {safeT("admin_promotion_action_edit", {
                        fallbackKo: "수정",
                        fallbackEn: "Edit",
                      })}
                    </AdminActionLink>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </AdminCard>
    </div>
  );
}
