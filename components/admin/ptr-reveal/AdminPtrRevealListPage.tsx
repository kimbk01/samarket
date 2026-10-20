"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { popupSurfaceOperatorLabel } from "@/lib/admin/promotion-ownership-visibility";
import { useAdminConfirmDialog } from "@/components/admin/ui/useAdminConfirmDialog";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
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
  // 폼 대화상자 — 새 광고 이름 입력(prompt)만. 확인은 confirmAdminAction (R2).
  const { prompt: askInput, dialog: confirmDialog } = useAdminConfirmDialog();
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
    const name = await askInput({
      title: L("새 당겨서 새로고침 광고", "New pull-to-refresh ad"),
      description: L("광고 이름을 입력하세요. 나머지 설정은 다음 화면에서 합니다.", "Enter a name. You set the rest on the next screen."),
      inputLabel: L("광고 이름", "Ad name"),
      confirmLabel: L("만들기", "Create"),
      cancelLabel: L("취소", "Cancel"),
    });
    if (!name) return;
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
    const copyOk = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: lang !== "en",
      title: L("광고 복사", "Copy ad"),
      description: L(`「${item.name}」을 복사할까요? (승인·기간 제외)`, `Copy “${item.name}”? (approval and schedule excluded)`),
      confirmLabel: L("복사", "Copy"),
    });
    if (!copyOk.ok) return;
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
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-semibold text-sam-fg">{L("당겨서 새로고침 광고", "Pull-to-refresh ads")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-sam-muted">
            {L(
              "목록을 아래로 당겨 새로고침할 때 스피너 뒤에 드러나는 띠 광고입니다. 팝업과 별도로 운영되며 승인·기간·통계 규칙은 팝업과 같습니다.",
              "A band ad revealed behind the spinner when a list is pulled to refresh. Operated separately from popups, with the same approval, schedule and stats rules."
            )}
          </p>
        </div>
        <AdminActionButton variant="primary" disabled={busy} onClick={() => void create()} data-admin-ptr-create="">
          {L("새 광고 만들기", "New ad")}
        </AdminActionButton>
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

      {error ? <p className="rounded-ui-rect border border-sam-danger bg-sam-danger-soft px-3 py-2 text-sm text-sam-danger" role="alert">{error}</p> : null}

      {loading ?
        <AdminLoadingState ko={lang !== "en"} />
      : filtered.length === 0 ?
        status || query.trim() ?
          <AdminEmptyState
            ko={lang !== "en"}
            onReset={() => {
              setStatus("");
              setQuery("");
            }}
          />
        : <AdminEmptyState ko={lang !== "en"} message={L("등록된 당겨서 새로고침 광고가 없습니다.", "No pull-to-refresh ads yet.")} />
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
                  {item.surfaces.map((sf) => popupSurfaceOperatorLabel(sf, lang)).join(", ") || "—"} ·{" "}
                  {item.startAt ? formatAdminManilaDateTime(item.startAt) : L("시작 즉시", "Immediate")} ~{" "}
                  {item.endAt ? formatAdminManilaDateTime(item.endAt) : L("종료일 없음", "No end")}
                </p>
              </div>
              <AdminToneBadge tone={item.status === "active" ? "success" : item.status === "rejected" || item.status === "ended" ? "danger" : "neutral"}>
                {platformPopupCampaignStatusLabel(item.status, lang)}
              </AdminToneBadge>
              <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => void copy(item)}>
                {L("복사", "Copy")}
              </AdminActionButton>
              <AdminActionLink href={`/admin/ptr-reveal-ads/${item.id}`} variant="ghost" size="sm">
                {adminCta("edit", lang !== "en")}
              </AdminActionLink>
            </li>
          ))}
        </ul>
      }
    </div>
  );
}
