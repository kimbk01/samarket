"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { PLATFORM_POPUP_CAMPAIGN_STATUSES } from "@/lib/platform-popup/types";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";

export function AdminPlatformPopupListPage() {
  const { safeT } = useI18n();
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

  const title = safeT("admin_platform_popup_title", {
    fallbackKo: "글로벌 팝업 광고",
    fallbackEn: "Global Popup Ads",
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
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    setCreating(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(json.error || "create_failed");
      return;
    }
    router.push(`/admin/platform-popup/${json.id}`);
  };

  const empty = useMemo(() => !loading && items.length === 0, [loading, items.length]);

  return (
    <div className="space-y-4" data-admin-platform-popup-list="1">
      <AdminPageHeader title={title} description={safeT("admin_platform_popup_list_desc", {
        fallbackKo: "플랫폼 팝업 캠페인 목록 · 승인 · 미리보기",
        fallbackEn: "Platform popup campaigns — list, approve, preview",
      })} />

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
                {safeT("admin_platform_popup_filter_all", { fallbackKo: "전체", fallbackEn: "All" })}
              </option>
              {PLATFORM_POPUP_CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ml-auto rounded bg-sam-primary px-3 py-1.5 text-sm font-semibold text-sam-on-primary disabled:opacity-50"
            disabled={creating}
            onClick={() => void onCreate()}
          >
            {safeT("admin_platform_popup_create", {
              fallbackKo: "캠페인 만들기",
              fallbackEn: "Create campaign",
            })}
          </button>
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
            {safeT("admin_platform_popup_loading", { fallbackKo: "불러오는 중…", fallbackEn: "Loading…" })}
          </p>
        ) : empty ? (
          <p className="text-sm text-sam-muted">
            {safeT("admin_platform_popup_empty", {
              fallbackKo: "캠페인이 없습니다.",
              fallbackEn: "No campaigns yet.",
            })}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-sam-border text-sam-muted">
                <tr>
                  <th className="px-2 py-2">Creative</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Surface</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Approval</th>
                  <th className="px-2 py-2">Schedule</th>
                  <th className="px-2 py-2">Priority</th>
                  <th className="px-2 py-2">Suppression</th>
                  <th className="px-2 py-2">CTA</th>
                  <th className="px-2 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-sam-border/60 hover:bg-sam-app/60">
                    <td className="px-2 py-2">
                      {item.creativeThumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.creativeThumbUrl}
                          alt=""
                          className="h-10 w-[58px] rounded object-cover"
                        />
                      ) : (
                        <span className="text-xs text-sam-muted">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/admin/platform-popup/${item.id}`}
                        className="font-medium text-sam-primary underline-offset-2 hover:underline"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{item.surfaces.join(", ") || "—"}</td>
                    <td className="px-2 py-2 uppercase">{item.status}</td>
                    <td className="px-2 py-2 uppercase">{item.approvalStatus}</td>
                    <td className="px-2 py-2 text-xs">
                      {item.startAt ? new Date(item.startAt).toLocaleString() : "—"}
                      {" → "}
                      {item.endAt ? new Date(item.endAt).toLocaleString() : "—"}
                      <div className="text-sam-muted">{item.timezone}</div>
                    </td>
                    <td className="px-2 py-2">{item.priority}</td>
                    <td className="px-2 py-2">{item.suppressionMode}</td>
                    <td className="px-2 py-2 text-xs">
                      {item.ctaType}
                      <div className="text-sam-muted truncate max-w-[10rem]">
                        {item.ctaType === "external_url" ? item.externalUrl : item.ctaTarget}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {new Date(item.updatedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
