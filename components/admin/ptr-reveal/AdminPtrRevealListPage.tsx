"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PlatformPopupAdminListItem } from "@/lib/platform-popup/admin-campaign-loader";
import { formatPlatformPopupAdminError } from "@/lib/platform-popup/format-platform-popup-admin-error";
import { platformPopupCampaignStatusLabel } from "@/lib/platform-popup/popup-product-labels";
import { PLATFORM_POPUP_CAMPAIGN_STATUSES } from "@/lib/platform-popup/types";

/**
 * 관리자 「당겨서 새로고침 광고」 목록 — Platform Popup 캠페인 중 `ptr_reveal` 만 (팝업 목록과 분리).
 */
export function AdminPtrRevealListPage() {
  const { language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const L = useCallback((ko: string, en: string) => (lang === "en" ? en : ko), [lang]);
  const router = useRouter();
  const [items, setItems] = useState<PlatformPopupAdminListItem[]>([]);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ scope: "ptr" });
    if (status) q.set("status", status);
    const res = await fetch(`/api/admin/platform-popup-campaigns?${q.toString()}`, { credentials: "same-origin" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: PlatformPopupAdminListItem[]; error?: string };
    setLoading(false);
    if (!res.ok || !json.ok) {
      setError(formatPlatformPopupAdminError(json.error || "load_failed", lang));
      return;
    }
    setItems(json.items ?? []);
  }, [status, lang]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.name} ${i.title ?? ""} ${i.ctaTarget} ${i.externalUrl ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  const create = async () => {
    const name = window.prompt(L("새 당겨서 새로고침 광고 이름", "Name for the new pull-to-refresh ad"), "");
    if (!name?.trim()) return;
    setBusy(true);
    const res = await fetch("/api/admin/platform-popup-campaigns", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), presentationType: "ptr_reveal", surfaces: ["GLOBAL"] }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok || !json.id) {
      setError(formatPlatformPopupAdminError(json.error || "create_failed", lang));
      return;
    }
    router.push(`/admin/ptr-reveal-ads/${json.id}`);
  };

  const copy = async (item: PlatformPopupAdminListItem) => {
    if (!window.confirm(L(`「${item.name}」을 복사할까요? (승인·기간 제외)`, `Copy “${item.name}”? (approval and schedule excluded)`))) return;
    setBusy(true);
    const res = await fetch(`/api/admin/platform-popup-campaigns/${item.id}/copy`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok || !json.ok) {
      setError(formatPlatformPopupAdminError(json.error || "copy_failed", lang));
      return;
    }
    await load();
  };

  return (
    <div className="space-y-4 p-4" data-admin-ptr-list="">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-sam-fg">{L("당겨서 새로고침 광고", "Pull-to-refresh ads")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-sam-muted">
            {L(
              "목록을 아래로 당겨 새로고침할 때 스피너 뒤에 드러나는 띠 광고입니다. 팝업과 별도로 운영되며 승인·기간·통계 규칙은 팝업과 같습니다.",
              "A band ad revealed behind the spinner when a list is pulled to refresh. Operated separately from popups, with the same approval, schedule and stats rules."
            )}
          </p>
        </div>
        <button type="button" className="rounded bg-sam-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void create()} data-admin-ptr-create="">
          {L("새 광고 만들기", "New ad")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <input
          className="min-w-[200px] flex-1 rounded border border-sam-border px-2 py-1.5"
          placeholder={L("이름·문구·이동 경로 검색", "Search name, text or link")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-admin-ptr-search=""
        />
        <select className="rounded border border-sam-border px-2 py-1.5" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{L("모든 상태", "All statuses")}</option>
          {PLATFORM_POPUP_CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>
              {platformPopupCampaignStatusLabel(s, lang)}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      {loading ?
        <p className="text-sm text-sam-muted">{L("불러오는 중…", "Loading…")}</p>
      : filtered.length === 0 ?
        <p className="rounded-ui-rect border border-dashed border-sam-border px-4 py-8 text-center text-sm text-sam-muted">
          {L("등록된 당겨서 새로고침 광고가 없습니다.", "No pull-to-refresh ads yet.")}
        </p>
      : <ul className="divide-y divide-sam-border rounded-ui-rect border border-sam-border bg-sam-surface">
          {filtered.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-admin-ptr-row={item.id}>
              <div className="h-10 w-40 shrink-0 overflow-hidden rounded bg-sam-surface-muted">
                {item.creativeThumbUrl ?
                  // eslint-disable-next-line @next/next/no-img-element -- 관리자 썸네일(휴대폰 띠)
                  <img src={item.creativeThumbUrl} alt="" className="h-full w-full object-cover" />
                : null}
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/ptr-reveal-ads/${item.id}`} className="block truncate text-sm font-semibold text-sam-fg hover:underline">
                  {item.name}
                </Link>
                <p className="truncate text-xs text-sam-muted">
                  {item.surfaces.join(", ") || "—"} · {item.startAt ? new Date(item.startAt).toLocaleString() : L("시작 즉시", "Immediate")} ~{" "}
                  {item.endAt ? new Date(item.endAt).toLocaleString() : L("종료일 없음", "No end")}
                </p>
              </div>
              <AdminToneBadge tone={item.status === "active" ? "success" : item.status === "rejected" || item.status === "ended" ? "danger" : "neutral"}>
                {platformPopupCampaignStatusLabel(item.status, lang)}
              </AdminToneBadge>
              <button type="button" className="rounded border border-sam-border px-2 py-1 text-xs" disabled={busy} onClick={() => void copy(item)}>
                {L("복사", "Copy")}
              </button>
              <Link href={`/admin/ptr-reveal-ads/${item.id}`} className="rounded border border-sam-border px-2 py-1 text-xs">
                {L("수정", "Edit")}
              </Link>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
