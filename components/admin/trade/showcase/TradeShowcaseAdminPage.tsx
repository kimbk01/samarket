"use client";

import { dibayAlert } from "@/components/ui/dibay-overlay";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminPhp } from "@/lib/admin/ui-standard/admin-format";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  TRADE_SHOWCASE_MAX_IMAGES,
  type TradeShowcaseItem,
} from "@/lib/trade/showcase/trade-showcase-model";

type Category = { id: string; name: string; slug: string };

type Draft = {
  id: string | null;
  trade_category_id: string;
  title: string;
  price: string;
  price_note: string;
  region_label: string;
  description: string;
  image_urls: string[];
  sort_order: string;
  is_active: boolean;
};

const EMPTY_DRAFT: Draft = {
  id: null,
  trade_category_id: "",
  title: "",
  price: "",
  price_note: "",
  region_label: "",
  description: "",
  image_urls: [],
  sort_order: "0",
  is_active: true,
};

function toDraft(item: TradeShowcaseItem): Draft {
  return {
    id: item.id,
    trade_category_id: item.trade_category_id ?? "",
    title: item.title,
    price: item.price == null ? "" : String(item.price),
    price_note: item.price_note ?? "",
    region_label: item.region_label ?? "",
    description: item.description ?? "",
    image_urls: item.image_urls ?? [],
    sort_order: String(item.sort_order ?? 0),
    is_active: item.is_active,
  };
}

const INPUT_CLASS =
  "h-10 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[14px] text-sam-fg outline-none focus:border-sam-primary";

/**
 * P-7 (2026-10-27) 어드민 「샘플 상품」 — 실제 거래 글과 분리된 예시 카탈로그 관리.
 * 사용자 화면: 실제 글이 적을 때 목록 하단 「예시로 둘러보기」에 「샘플 · 거래 불가」 배지로만 노출(검색 제외).
 */
export function TradeShowcaseAdminPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ code: string; httpStatus: number } | null>(null);
  const [items, setItems] = useState<TradeShowcaseItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      const res = await fetch("/api/admin/trade/showcase", { credentials: "include", cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        items?: TradeShowcaseItem[];
        categories?: Category[];
      };
      if (cancelled) return;
      if (!res.ok || !data.ok) {
        setErr({ code: data.error ?? "load_failed", httpStatus: res.status });
      } else {
        setItems(data.items ?? []);
        setCategories(data.categories ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const uploadImages = useCallback(
    async (files: FileList | null) => {
      if (!files || !draft) return;
      const room = TRADE_SHOWCASE_MAX_IMAGES - draft.image_urls.length;
      const picked = Array.from(files).slice(0, Math.max(0, room));
      if (picked.length === 0) return;
      setUploading(true);
      const urls: string[] = [];
      for (const file of picked) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/posts/upload-image", { method: "POST", body: fd, credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (res.ok && data.url) {
          urls.push(data.url);
        } else {
          await dibayAlert({ title: data.error ?? t("admin_trade_showcase_upload_failed") });
          break;
        }
      }
      setDraft((d) => (d ? { ...d, image_urls: [...d.image_urls, ...urls] } : d));
      setUploading(false);
    },
    [draft, t]
  );

  const moveImage = (from: number, to: number) => {
    setDraft((d) => {
      if (!d || to < 0 || to >= d.image_urls.length) return d;
      const next = [...d.image_urls];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return { ...d, image_urls: next };
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const body = {
      trade_category_id: draft.trade_category_id || null,
      title: draft.title,
      price: draft.price.trim() === "" ? null : draft.price,
      price_note: draft.price_note,
      region_label: draft.region_label,
      description: draft.description,
      image_urls: draft.image_urls,
      sort_order: Number(draft.sort_order) || 0,
      is_active: draft.is_active,
    };
    const res = await fetch(draft.id ? `/api/admin/trade/showcase/${draft.id}` : "/api/admin/trade/showcase", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setSaving(false);
    if (!res.ok || !data.ok) {
      await dibayAlert({ title: data.error ?? t("admin_trade_showcase_save_failed") });
      return;
    }
    setDraft(null);
    setTick((n) => n + 1);
  };

  const remove = async (item: TradeShowcaseItem) => {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko,
      title: t("admin_trade_showcase_delete_confirm_title", { title: item.title }),
      description: t("admin_trade_showcase_delete_confirm_desc"),
      confirmLabel: t("admin_trade_showcase_delete_cta"),
      destructive: true,
      retypeValue: item.title,
    });
    if (!confirmed.ok) return;
    const res = await fetch(`/api/admin/trade/showcase/${item.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason: confirmed.reason }),
    });
    if (!res.ok) {
      await dibayAlert({ title: t("admin_trade_showcase_delete_failed") });
      return;
    }
    setTick((n) => n + 1);
  };

  const toggleActive = async (item: TradeShowcaseItem) => {
    const res = await fetch(`/api/admin/trade/showcase/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...item, is_active: !item.is_active }),
    });
    if (!res.ok) await dibayAlert({ title: t("admin_trade_showcase_update_failed") });
    setTick((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader
        title={t("admin_trade_showcase_page_title")}
        description={t("admin_trade_showcase_page_desc")}
      />

      {err?.code === "table_missing" ? (
        <AdminCard>
          <p className="text-[14px] text-sam-fg">
            {t("admin_trade_showcase_table_missing")}
          </p>
        </AdminCard>
      ) : err ? (
        <AdminErrorState ko={ko} code={err.code} httpStatus={err.httpStatus} onRetry={() => setTick((n) => n + 1)} />
      ) : loading ? (
        <AdminLoadingState ko={ko} />
      ) : (
        <>
          <div className="flex justify-end">
            <AdminActionButton variant="primary" onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              {t("admin_trade_showcase_add_sample")}
            </AdminActionButton>
          </div>

          {draft ? (
            <AdminCard title={draft.id ? t("admin_trade_showcase_edit_sample") : t("admin_trade_showcase_add_sample")}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {t("admin_trade_showcase_topic")}
                  <select
                    className={INPUT_CLASS}
                    value={draft.trade_category_id}
                    onChange={(e) => setDraft({ ...draft, trade_category_id: e.target.value })}
                  >
                    <option value="">{t("admin_trade_showcase_all_no_topic")}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {t("admin_trade_showcase_field_title")}
                  <input className={INPUT_CLASS} maxLength={80} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {t("admin_trade_showcase_field_price")}
                  <input className={INPUT_CLASS} inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {t("admin_trade_showcase_field_price_note")}
                  <input className={INPUT_CLASS} maxLength={40} value={draft.price_note} onChange={(e) => setDraft({ ...draft, price_note: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {t("admin_trade_showcase_field_region")}
                  <input className={INPUT_CLASS} maxLength={60} value={draft.region_label} onChange={(e) => setDraft({ ...draft, region_label: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg">
                  {t("admin_trade_showcase_field_order")}
                  <input className={INPUT_CLASS} inputMode="numeric" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-[13px] font-medium text-sam-fg md:col-span-2">
                  {t("admin_trade_showcase_field_desc")}
                  <textarea
                    className="min-h-24 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[14px] text-sam-fg outline-none focus:border-sam-primary"
                    maxLength={2000}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <p className="text-[13px] font-medium text-sam-fg">
                  {t("admin_trade_showcase_photos_count_cover", { n: draft.image_urls.length, max: TRADE_SHOWCASE_MAX_IMAGES })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {draft.image_urls.map((url, i) => (
                    <div key={url} className="flex w-24 flex-col gap-1">
                      <div className="relative h-24 w-24 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                        <SamarketThumbnail src={url} fill roundedClassName="rounded-ui-rect" fallbackSrc="" />
                        {i === 0 ? (
                          <span className="absolute left-1 top-1 rounded-ui-rect bg-sam-primary px-1 text-[12px] font-bold text-sam-on-primary">
                            {t("admin_trade_showcase_cover_badge")}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex justify-between">
                        <AdminActionButton
                          size="sm"
                          variant="ghost"
                          disabled={i === 0}
                          aria-label={t("admin_trade_showcase_move_earlier")}
                          onClick={() => moveImage(i, i - 1)}
                        >
                          ◀
                        </AdminActionButton>
                        <AdminActionButton
                          size="sm"
                          variant="ghost"
                          aria-label={t("admin_trade_showcase_remove_photo")}
                          onClick={() => setDraft({ ...draft, image_urls: draft.image_urls.filter((_, j) => j !== i) })}
                        >
                          ✕
                        </AdminActionButton>
                        <AdminActionButton
                          size="sm"
                          variant="ghost"
                          disabled={i === draft.image_urls.length - 1}
                          aria-label={t("admin_trade_showcase_move_later")}
                          onClick={() => moveImage(i, i + 1)}
                        >
                          ▶
                        </AdminActionButton>
                      </div>
                    </div>
                  ))}
                  {draft.image_urls.length < TRADE_SHOWCASE_MAX_IMAGES ? (
                    <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-ui-rect border border-dashed border-sam-border text-[12px] text-sam-muted">
                      {uploading ? t("admin_trade_showcase_uploading") : t("admin_trade_showcase_add_photo")}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        multiple
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          void uploadImages(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-[14px] text-sam-fg">
                <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                {t("admin_trade_showcase_show_to_users")}
              </label>

              <div className="mt-4 flex justify-end gap-2">
                <AdminActionButton variant="secondary" onClick={() => setDraft(null)} disabled={saving}>
                  {t("admin_trade_showcase_cancel")}
                </AdminActionButton>
                <AdminActionButton variant="primary" onClick={() => void save()} disabled={saving || uploading || !draft.title.trim()}>
                  {saving ? t("admin_trade_showcase_saving") : t("admin_trade_showcase_save")}
                </AdminActionButton>
              </div>
            </AdminCard>
          ) : null}

          {items.length === 0 ? (
            <AdminEmptyState ko={ko} message={t("admin_trade_showcase_empty")} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <AdminCard key={item.id}>
                  <div className="flex gap-3">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                      {item.image_urls[0] ? (
                        <SamarketThumbnail src={item.image_urls[0]} fill roundedClassName="rounded-ui-rect" fallbackSrc="" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-sam-fg">{item.title}</p>
                      <p className="text-[12px] text-sam-muted">
                        {(item.trade_category_id && categoryName.get(item.trade_category_id)) || t("admin_trade_showcase_category_all")}
                        {" · "}
                        {item.price != null ? formatAdminPhp(item.price) : t("admin_trade_showcase_no_price")}
                        {" · "}
                        {t("admin_trade_showcase_photos_n", { n: item.image_urls.length })}
                      </p>
                      <p className={`mt-1 text-[12px] font-semibold ${item.is_active ? "text-sam-primary" : "text-sam-muted"}`}>
                        {item.is_active ? t("admin_trade_showcase_visible") : t("admin_trade_showcase_hidden")} · {t("admin_trade_showcase_order_n", { n: item.sort_order })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AdminActionButton size="sm" variant="secondary" onClick={() => setDraft(toDraft(item))}>
                      {t("admin_trade_showcase_edit")}
                    </AdminActionButton>
                    <AdminActionButton size="sm" variant="neutral" onClick={() => void toggleActive(item)}>
                      {item.is_active ? t("admin_trade_showcase_hide") : t("admin_trade_showcase_show")}
                    </AdminActionButton>
                    <AdminActionButton size="sm" variant="danger" onClick={() => void remove(item)}>
                      {t("admin_trade_showcase_delete_cta")}
                    </AdminActionButton>
                  </div>
                </AdminCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
